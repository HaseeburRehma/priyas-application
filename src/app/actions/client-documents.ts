"use server";

/**
 * Server actions for the per-client document cabinet.
 *
 *   - uploadClientDocumentAction — receives the file via FormData (RSC
 *     can pass a File through a server action), pushes it to the
 *     private `client-documents` bucket under `<org_id>/<client_id>/…`,
 *     inserts a `client_documents` row, revalidates the client detail
 *     path.
 *   - signClientDocumentUrlAction — returns a time-limited signed URL
 *     for viewing/downloading. Bucket is private for PII reasons.
 *   - deleteClientDocumentAction — soft-deletes the row (keeps blob
 *     for audit; a nightly sweep can hard-purge later).
 *
 * All three are gated on `client.update` (admin + dispatcher). Field
 * staff can't upload or delete client documents.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  getCurrentRole,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { getCachedUser } from "@/lib/api/current-user";

type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };

const BUCKET = "client-documents";
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const CATEGORIES = [
  "contract",
  "form",
  "decision",
  "id_card",
  "invoice",
  "photo",
  "other",
] as const;
const CategorySchema = z.enum(CATEGORIES);

/**
 * Upload one file. Called with `formData` where:
 *   - `clientId`: uuid
 *   - `category`: one of the 7 categories above (defaults to 'other')
 *   - `notes`: optional short description
 *   - `file`: the actual File blob
 */
export async function uploadClientDocumentAction(
  formData: FormData,
): Promise<Result<{ id: string; name: string }>> {
  try {
    await requirePermission("client.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { ok: false, error: "missing_client_id" };

  const category = CategorySchema.safeParse(
    formData.get("category") ?? "other",
  );
  if (!category.success) return { ok: false, error: "invalid_category" };

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "missing_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "file_too_large" };
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `mime_not_allowed:${file.type}` };
  }

  const { orgId } = await getCurrentRole();
  if (!orgId) return { ok: false, error: "no_org" };
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const supabase = await createSupabaseServerClient();

  // Path: <org_id>/<client_id>/<timestamp>-<rand>.<ext>
  // First folder segment MUST match org_id — the bucket RLS policy
  // enforces that. The client_id nest keeps files findable in Studio.
  const rand = Math.random().toString(36).slice(2, 10);
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 6);
  const path = `${orgId}/${clientId}/${Date.now()}-${rand}.${ext}`;

  const upload = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upload.error) {
    return { ok: false, error: `storage:${upload.error.message}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("client_documents") as any;
  const { data, error } = await table
    .insert({
      org_id: orgId,
      client_id: clientId,
      uploaded_by: user.id,
      name: file.name,
      category: category.data,
      notes,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id, name")
    .single();
  if (error) {
    // Roll back the storage object so we don't orphan a blob for a
    // failed row insert.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }

  revalidatePath(routes.client(clientId));
  return {
    ok: true,
    data: { id: (data as { id: string; name: string }).id, name: file.name },
  };
}

/**
 * Return a short-lived signed URL for viewing or downloading a doc.
 * We don't want to embed permanent public URLs — client docs are PII.
 */
export async function signClientDocumentUrlAction(
  id: string,
  expiresInSeconds = 60,
): Promise<Result<{ url: string }>> {
  try {
    await requirePermission("client.read");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await ((supabase.from("client_documents") as any))
    .select("storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const path = (row as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, error: "not_found" };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "sign_failed" };
  }
  return { ok: true, data: { url: data.signedUrl } };
}

/**
 * Soft-delete a doc row. Storage blob stays behind — a maintenance
 * job can hard-purge later. Keeps the audit story simple.
 */
export async function deleteClientDocumentAction(
  id: string,
): Promise<Result> {
  try {
    await requirePermission("client.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("client_documents") as any;
  const { data: row, error: readErr } = await table
    .select("client_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "not_found" };

  const { error } = await table
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.client((row as { client_id: string }).client_id));
  return { ok: true, data: undefined };
}

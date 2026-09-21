"use server";

/**
 * Server actions for the PM dashboard "My Files & Notes" widget
 * (feature-update #19). Every mutation is scoped to the caller —
 * owner_id is enforced both by the RLS policies on pm_notes /
 * pm_files (see migration 20260921_000062) AND by explicit filters
 * here so a UI bug can't leak someone else's row.
 *
 * Files land in the `pm-files` bucket at path
 *     <owner_id>/<uuid>.<ext>
 * which matches the storage.objects RLS foldername check.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";

// Same shape as ActionResult in the sibling action files (clients.ts,
// employees.ts, …). Kept inline here rather than centralising, matching
// the local convention across `src/app/actions/*`.
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const BUCKET = "pm-files";
const MAX_FILE_BYTES = 26_214_400; // 25 MB — matches bucket declaration

const NoteInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(200).optional().or(z.literal("")),
  body: z.string().min(1, "Notiz darf nicht leer sein").max(20_000),
  pinned: z.boolean().default(false),
});

/**
 * Upserts a note (create when id is missing, update otherwise).
 * Uses `time.read_all` as the RBAC gate — matches how the widget is
 * scoped in the dashboard page (admin + dispatcher).
 */
export async function savePmNoteAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("time.read_all");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = NoteInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  if (input.id) {
    // Update path — RLS + owner_id filter both enforce ownership.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("pm_notes") as any))
      .update({
        title: input.title || null,
        body: input.body,
        pinned: input.pinned,
      })
      .eq("id", input.id)
      .eq("owner_id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard");
    return { ok: true, data: { id: input.id } };
  }

  // Insert path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("pm_notes") as any))
    .insert({
      org_id: orgId,
      owner_id: user.id,
      title: input.title || null,
      body: input.body,
      pinned: input.pinned,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deletePmNoteAction(
  id: string,
): Promise<ActionResult<null>> {
  try {
    await requirePermission("time.read_all");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Soft delete via deleted_at so a manager can restore via SQL if
  // they nuke something by accident. Owner filter matches RLS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("pm_notes") as any))
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

/**
 * Upload a file to the PM's private `pm-files/<owner_id>/<uuid>.<ext>`
 * bucket path. The client sends a FormData with a single `file` blob.
 */
export async function uploadPmFileAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("time.read_all");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Keine Datei angegeben" };
  }
  if (file.size === 0) return { ok: false, error: "Datei ist leer" };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Datei ist grösser als 25 MB" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Extension derived from the client filename; falls back to `bin`
  // so a caller with no extension still gets a stable path.
  const dotIdx = file.name.lastIndexOf(".");
  const ext =
    dotIdx > 0 && dotIdx < file.name.length - 1
      ? file.name.slice(dotIdx + 1).toLowerCase()
      : "bin";
  const uuid = crypto.randomUUID();
  const storagePath = `${user.id}/${uuid}.${ext}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });
  if (upload.error) return { ok: false, error: upload.error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("pm_files") as any))
    .insert({
      org_id: orgId,
      owner_id: user.id,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id")
    .single();
  if (error) {
    // Best-effort cleanup: the object is orphaned in storage if the
    // row insert fails. Don't propagate the storage-delete error.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deletePmFileAction(
  id: string,
): Promise<ActionResult<null>> {
  try {
    await requirePermission("time.read_all");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Fetch the row so we know which object to remove from storage,
  // and to sanity-check ownership (defense in depth beyond RLS).
  const { data: row } = await supabase
    .from("pm_files")
    .select("storage_path, owner_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  const rowTyped = row as { storage_path: string; owner_id: string } | null;
  if (!rowTyped) return { ok: false, error: "Datei nicht gefunden" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("pm_files") as any))
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: error.message };

  // Best-effort cleanup: even if the object removal fails, the row is
  // soft-deleted so the UI stops showing it.
  await supabase.storage.from(BUCKET).remove([rowTyped.storage_path]).catch(() => {});

  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

/**
 * Mint a signed URL for downloading a PM file. Signed rather than
 * public because the bucket is private (per RLS) — a manager clicking
 * a file in the widget gets a fresh 5-minute URL that the browser can
 * follow without needing the Supabase session.
 */
export async function signPmFileUrlAction(
  id: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    await requirePermission("time.read_all");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: row } = await supabase
    .from("pm_files")
    .select("storage_path")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  const rowTyped = row as { storage_path: string } | null;
  if (!rowTyped) return { ok: false, error: "Datei nicht gefunden" };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(rowTyped.storage_path, 300);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "URL konnte nicht erstellt werden" };
  }
  return { ok: true, data: { url: data.signedUrl } };
}

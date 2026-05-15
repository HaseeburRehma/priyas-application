"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// SECURITY: validate shape AND scope of every argument. Without this a
// same-org user can attach an arbitrary storage object (including one
// belonging to a different property) to a property they don't own.
const recordPhotoSchema = z.object({
  property_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500),
  caption: z.string().max(2000).optional(),
});

/**
 * Records a property photo whose binary lives in the `property-photos`
 * Storage bucket. The file itself is uploaded directly from the browser
 * via `supabase.storage.from(...).upload(...)` (so we don't have to
 * proxy bytes through the server). This action just inserts the metadata
 * row + audit-log entry once the upload completes.
 */
export async function recordPropertyPhotoAction(args: {
  property_id: string;
  storage_path: string;
  caption?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = recordPhotoSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }
  const input = parsed.data;

  // Storage convention (see PropertyPhotosCard / TabletOnboardingFlow):
  // `${orgId}/${propertyId}/...`. The path MUST contain the
  // property_id segment, otherwise a same-org user could re-attach a
  // foreign property's photo to one they're allowed to edit.
  if (!input.storage_path.includes(`/${input.property_id}/`)) {
    return { ok: false, error: "Invalid storage path" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // SECURITY: verify the target property exists and is owned by the
  // caller's org before we accept the metadata. RLS will refuse the
  // insert anyway, but failing fast here gives a clear error and avoids
  // partial writes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRow } = await ((supabase.from("properties") as any))
    .select("id, org_id")
    .eq("id", input.property_id)
    .maybeSingle();
  const property = propRow as { id: string; org_id: string } | null;
  if (!property || property.org_id !== orgId) {
    return { ok: false, error: "Forbidden" };
  }

  // The storage path must also start with the caller's orgId — otherwise
  // somebody could try to attach a foreign org's object that happens to
  // contain `/<property_id>/` in its path.
  if (!input.storage_path.startsWith(`${orgId}/`)) {
    return { ok: false, error: "Invalid storage path" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("property_photos") as any))
    .insert({
      org_id: orgId,
      property_id: input.property_id,
      storage_path: input.storage_path,
      caption: input.caption ?? null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (data as { id: string }).id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user?.id ?? null,
    action: "create",
    table_name: "property_photos",
    record_id: newId,
    after: { message: "Foto hinzugefügt", caption: input.caption ?? null },
  });

  revalidatePath(routes.property(input.property_id));
  return { ok: true, data: { id: newId } };
}

export async function deletePropertyPhotoAction(
  id: string,
  property_id: string,
  storage_path: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.delete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();

  // Best-effort: remove the storage object first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.storage.from("property-photos") as any).remove([storage_path]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("property_photos") as any)).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.property(property_id));
  return { ok: true, data: { id } };
}

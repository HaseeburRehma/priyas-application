"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("property_photos") as any))
    .insert({
      org_id: orgId,
      property_id: args.property_id,
      storage_path: args.storage_path,
      caption: args.caption ?? null,
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
    after: { message: "Foto hinzugefügt", caption: args.caption ?? null },
  });

  revalidatePath(routes.property(args.property_id));
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

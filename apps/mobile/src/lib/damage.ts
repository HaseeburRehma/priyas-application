/**
 * Damage / condition reports — loader + create + Storage upload.
 *
 * Insertion writes to `damage_reports`. Photos are uploaded to the
 * private `property-photos` bucket under `<org_id>/<property_id>/damage/`
 * — the same layout the web app uses, and the org prefix the bucket's
 * RLS requires — and their storage *paths* are stored on `photo_paths`.
 * Reading them back needs signed URLs (see `photo_urls`).
 */

import { getSupabase } from "@/lib/supabase";

export type DamageCategory = "normal" | "note" | "problem" | "damage";

export type DamageReportRow = {
  id: string;
  property_id: string;
  shift_id: string | null;
  employee_id: string | null;
  severity: number;
  category: DamageCategory;
  description: string;
  photo_paths: string[];
  /** Signed, short-lived URLs for `photo_paths`, in the same order. */
  photo_urls: string[];
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  property_name: string;
  client_name: string;
};

const BUCKET = "property-photos";

/**
 * Reports I've filed, most-recent first.
 */
export async function loadMyDamageReports(
  employeeId: string,
): Promise<DamageReportRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("damage_reports")
    .select(
      `id, property_id, shift_id, employee_id, severity, category,
       description, photo_paths, resolved, resolved_at, created_at,
       property:properties ( name, client:clients ( display_name ) )`,
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);

  type Row = {
    id: string;
    property_id: string;
    shift_id: string | null;
    employee_id: string | null;
    severity: number;
    category: DamageCategory;
    description: string;
    photo_paths: string[];
    resolved: boolean;
    resolved_at: string | null;
    created_at: string;
    property: {
      name: string;
      client: { display_name: string } | null;
    } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // The bucket is private: sign every stored path in one call.
  const paths = Array.from(new Set(rows.flatMap((r) => r.photo_paths ?? [])));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from(BUCKET)
      // The list is persisted for offline use (24 h); sign for a week so
      // a cold start doesn't show expired, blank thumbnails.
      .createSignedUrls(paths, 7 * 24 * 60 * 60);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    shift_id: r.shift_id,
    employee_id: r.employee_id,
    severity: r.severity,
    category: r.category,
    description: r.description,
    photo_paths: r.photo_paths ?? [],
    photo_urls: (r.photo_paths ?? [])
      .map((p) => signed.get(p))
      .filter((u): u is string => !!u),
    resolved: r.resolved,
    resolved_at: r.resolved_at,
    created_at: r.created_at,
    property_name: r.property?.name ?? "—",
    client_name: r.property?.client?.display_name ?? "—",
  }));
}

/**
 * Upload one photo to Storage. Returns the storage path, or null on
 * failure. Path scheme: `<org_id>/<property_id>/damage/<timestamp>-<rand>.<ext>`.
 */
export async function uploadDamagePhoto(args: {
  orgId: string;
  propertyId: string;
  fileUri: string;
  mimeType: string | null;
}): Promise<string | null> {
  const supabase = getSupabase();
  const ext = (args.mimeType?.split("/")[1] ?? "jpg").split(";")[0];
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${args.orgId}/${args.propertyId}/damage/${Date.now()}-${rand}.${ext}`;

  // React Native FormData with file:// URI. Cast via `as never` because
  // the web File-shape isn't the RN shape; Supabase accepts both.
  const form = new FormData();
  form.append("file", {
    uri: args.fileUri,
    name: path.split("/").pop(),
    type: args.mimeType ?? "image/jpeg",
  } as never);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, form as unknown as Blob, {
      contentType: args.mimeType ?? "image/jpeg",
      upsert: false,
    });
  if (error) return null;
  return path;
}

export async function createDamageReport(args: {
  orgId: string;
  employeeId: string;
  propertyId: string;
  shiftId: string | null;
  severity: number; // 1-5
  category: DamageCategory;
  description: string;
  /** Storage paths returned by `uploadDamagePhoto`. */
  photoPaths: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const desc = args.description.trim();
  if (!desc) return { ok: false, error: "description_required" };
  if (args.severity < 1 || args.severity > 5) {
    return { ok: false, error: "invalid_severity" };
  }

  const { data, error } = await supabase
    .from("damage_reports")
    .insert({
      org_id: args.orgId,
      employee_id: args.employeeId,
      property_id: args.propertyId,
      shift_id: args.shiftId,
      severity: args.severity,
      category: args.category,
      description: desc,
      photo_paths: args.photoPaths,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Minimal property list for the picker — only the ones the caller
 *  can actually access via RLS. */
export async function loadPropertiesForPicker(): Promise<
  Array<{ id: string; name: string; client_name: string }>
> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("properties")
    .select("id, name, client:clients ( display_name )")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);
  type R = {
    id: string;
    name: string;
    client: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as R[]).map((r) => ({
    id: r.id,
    name: r.name,
    client_name: r.client?.display_name ?? "—",
  }));
}

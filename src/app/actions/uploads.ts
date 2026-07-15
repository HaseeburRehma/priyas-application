"use server";

/**
 * Avatar + org-logo uploads.
 *
 * Both flows follow the same pattern:
 *   1. RBAC check (avatar = any authed user; logo = admin only).
 *   2. Validate the FormData: mime type, byte size.
 *   3. Upload into the matching public bucket under a per-owner folder.
 *   4. Patch the URL column on the owning row (profiles.avatar_url /
 *      organizations.logo_url).
 *   5. Best-effort cleanup of the previous file so the bucket doesn't
 *      grow unbounded as users iterate.
 *   6. revalidatePath('/settings') so the new image renders on the
 *      next render pass without a hard refresh.
 *
 * Storage path conventions (see migration 000042 for the RLS policies):
 *   avatars/{user_id}/{epoch}-{slug}.{ext}
 *   org-logos/{org_id}/{epoch}-{slug}.{ext}
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type Result =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

const AVATAR_BUCKET = "avatars";
const LOGO_BUCKET = "org-logos";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_MIME_ALLOW = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// SVG intentionally excluded: org-logos is a public bucket, and an SVG
// can embed <script>/event handlers that execute if the raw object URL
// is opened directly (not through an <img>/<Image> tag, which neutralizes
// it) — unnecessary risk for what's realistically always a raster logo.
const LOGO_MIME_ALLOW = ["image/jpeg", "image/png", "image/webp"];

/**
 * Sluggify a filename for use in a storage path.
 *
 * We strip everything except basic latin letters/numbers + dot/dash/
 * underscore, normalise diacritics, and clamp to 64 chars. The output
 * is *not* meant to be a faithful filename round-trip; the alt text
 * in the UI shows the user-friendly version, and `getPublicUrl()`
 * works against the path regardless.
 */
function slugifyFilename(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").slice(0, 64);
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "bin").toLowerCase();
  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "file"}.${ext}`;
}

/** Best-effort deletion of a previously stored object. Never throws. */
async function tryDelete(bucket: string, path: string): Promise<void> {
  if (!path) return;
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // The bucket cleanup is opportunistic — failure here just leaves
    // a stale file behind, which the lifecycle policy on the bucket
    // can clean up later. Never block the upload on this.
  }
}

/**
 * Pull the storage path out of a public URL. Returns null if the URL
 * doesn't look like one of ours. Used so we can delete the previous
 * avatar when the user uploads a replacement.
 */
function extractStoragePath(
  publicUrl: string | null,
  bucket: string,
): string | null {
  if (!publicUrl) return null;
  // Supabase public URL shape:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

// ============================================================================
// Avatar (per-user)
// ============================================================================

export async function uploadProfileAvatarAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Keine Datei ausgewählt." };
  }
  if (!AVATAR_MIME_ALLOW.includes(file.type)) {
    return {
      ok: false,
      error: `Dateityp nicht erlaubt: ${file.type || "unbekannt"}. JPG, PNG, WebP oder GIF verwenden.`,
    };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: `Datei zu groß (${Math.round(file.size / 1024 / 1024)} MB). Maximum: 5 MB.`,
    };
  }

  const filename = slugifyFilename(file.name || "avatar.png");
  const path = `${user.id}/${Date.now()}-${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: uploadErr.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  // Fetch the previous avatar so we can clean up after a successful swap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileTable = supabase.from("profiles") as any;
  const { data: prev } = await profileTable
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const prevUrl =
    (prev as { avatar_url: string | null } | null)?.avatar_url ?? null;

  const { error: updateErr } = await profileTable
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  if (updateErr) {
    // Rollback the upload to keep storage tidy.
    await tryDelete(AVATAR_BUCKET, path);
    return { ok: false, error: updateErr.message };
  }

  // Best-effort cleanup of the previous file.
  const prevPath = extractStoragePath(prevUrl, AVATAR_BUCKET);
  if (prevPath && prevPath !== path) {
    void tryDelete(AVATAR_BUCKET, prevPath);
  }

  revalidatePath(routes.settings);
  return { ok: true, url: publicUrl, path };
}

export async function removeProfileAvatarAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileTable = supabase.from("profiles") as any;
  const { data: prev } = await profileTable
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const prevUrl =
    (prev as { avatar_url: string | null } | null)?.avatar_url ?? null;

  const { error } = await profileTable
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  const prevPath = extractStoragePath(prevUrl, AVATAR_BUCKET);
  if (prevPath) void tryDelete(AVATAR_BUCKET, prevPath);

  revalidatePath(routes.settings);
  return { ok: true };
}

// ============================================================================
// Org logo (admin only)
// ============================================================================

export async function uploadOrgLogoAction(
  formData: FormData,
): Promise<Result> {
  try {
    await requirePermission("settings.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "forbidden",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileTable = supabase.from("profiles") as any;
  const { data: profile } = await profileTable
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId =
    (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) return { ok: false, error: "no_org" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Keine Datei ausgewählt." };
  }
  if (!LOGO_MIME_ALLOW.includes(file.type)) {
    return {
      ok: false,
      error: `Dateityp nicht erlaubt: ${file.type || "unbekannt"}. JPG, PNG oder WebP verwenden.`,
    };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: `Datei zu groß (${Math.round(file.size / 1024 / 1024)} MB). Maximum: 2 MB.`,
    };
  }

  const filename = slugifyFilename(file.name || "logo.png");
  const path = `${orgId}/${Date.now()}-${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: uploadErr.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgTable = supabase.from("organizations") as any;
  const { data: prev } = await orgTable
    .select("logo_url")
    .eq("id", orgId)
    .maybeSingle();
  const prevUrl =
    (prev as { logo_url: string | null } | null)?.logo_url ?? null;

  const { error: updateErr } = await orgTable
    .update({ logo_url: publicUrl })
    .eq("id", orgId);
  if (updateErr) {
    await tryDelete(LOGO_BUCKET, path);
    return { ok: false, error: updateErr.message };
  }

  const prevPath = extractStoragePath(prevUrl, LOGO_BUCKET);
  if (prevPath && prevPath !== path) {
    void tryDelete(LOGO_BUCKET, prevPath);
  }

  revalidatePath(routes.settings);
  return { ok: true, url: publicUrl, path };
}

export async function removeOrgLogoAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await requirePermission("settings.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "forbidden",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileTable = supabase.from("profiles") as any;
  const { data: profile } = await profileTable
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId =
    (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) return { ok: false, error: "no_org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgTable = supabase.from("organizations") as any;
  const { data: prev } = await orgTable
    .select("logo_url")
    .eq("id", orgId)
    .maybeSingle();
  const prevUrl =
    (prev as { logo_url: string | null } | null)?.logo_url ?? null;

  const { error } = await orgTable
    .update({ logo_url: null })
    .eq("id", orgId);
  if (error) return { ok: false, error: error.message };

  const prevPath = extractStoragePath(prevUrl, LOGO_BUCKET);
  if (prevPath) void tryDelete(LOGO_BUCKET, prevPath);

  revalidatePath(routes.settings);
  return { ok: true };
}

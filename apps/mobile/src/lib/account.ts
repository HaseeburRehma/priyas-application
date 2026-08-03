/**
 * Account + device management for the Settings tab.
 *
 * Profile updates hit `public.profiles`; RLS lets me update my own row
 * only. TOTP status comes from `supabase.auth.mfa.listFactors()`.
 * Device list comes from `public.user_devices` (I only see my own rows
 * per the RLS policy from migration 000048).
 */

import { getSupabase } from "@/lib/supabase";

export type UserDevice = {
  id: string;
  device_label: string;
  device_kind: "desktop" | "mobile" | "tablet" | "unknown";
  os: string | null;
  browser: string | null;
  geo_label: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export async function updateMyProfile(patch: {
  fullName?: string;
  phone?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const dbPatch: Record<string, unknown> = {};
  if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;

  if (Object.keys(dbPatch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update(dbPatch)
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Devices signed into this account, excluding revoked ones.
 * Returns them newest-activity first.
 */
export async function loadMyDevices(): Promise<UserDevice[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("user_devices")
    .select(
      "id, device_label, device_kind, os, browser, geo_label, first_seen_at, last_seen_at",
    )
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  return (data ?? []) as UserDevice[];
}

/** Revoke a device by setting `revoked_at`. RLS restricts to own rows. */
export async function revokeDevice(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("user_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sign out every other device via Supabase's built-in `scope: 'others'`. */
export async function signOutOthers(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type MfaState = {
  hasVerifiedTotp: boolean;
  factorId: string | null;
};

export async function loadMfaState(): Promise<MfaState> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = (data?.totp ?? []).find((f) => f.status === "verified");
  return {
    hasVerifiedTotp: !!verified,
    factorId: verified?.id ?? null,
  };
}

export async function unenrollTotp(
  factorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

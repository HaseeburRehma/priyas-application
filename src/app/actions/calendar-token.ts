"use server";

import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Mint (or reuse) an opaque iCal subscription token for the current user.
 * One token per user; calling this again returns the existing one.
 */
export async function ensureCalendarTokenAction(): Promise<
  ActionResult<{ token: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await ((supabase.from("calendar_tokens") as any))
    .select("token, expires_at")
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    // Reuse only if the token is still valid. Legacy rows (expires_at = NULL)
    // were minted before migration 000034 — we honour them but the
    // /api/schedule/ical route warns when they're used.
    const exp = (existing as { token: string; expires_at: string | null })
      .expires_at;
    const stillValid =
      exp === null || new Date(exp).getTime() > Date.now();
    if (stillValid) {
      return {
        ok: true,
        data: { token: (existing as { token: string }).token },
      };
    }
  }

  const token = `ct_${randomUUID().replace(/-/g, "")}`;
  // One-year lifetime. Long enough that subscribed calendars don't need
  // hand-holding; short enough that a leaked URL stops working eventually.
  const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("calendar_tokens") as any)).insert({
    token,
    profile_id: user.id,
    org_id: orgId,
    label: "Schedule subscription",
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { token } };
}

/**
 * Revoke every existing token for the current user and mint a fresh one.
 * Used by the "Rotate iCal link" button — preferred over deleting + re-issuing
 * because it leaves an audit trail (the row is still there with
 * `expires_at = now()`), and existing subscribers transition through a
 * single 401 rather than silently breaking forever.
 */
export async function rotateCalendarTokenAction(): Promise<
  ActionResult<{ token: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Revoke: mark all existing tokens as already-expired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: revokeErr } = await ((supabase.from("calendar_tokens") as any))
    .update({ expires_at: new Date().toISOString() })
    .eq("profile_id", user.id);
  if (revokeErr) return { ok: false, error: revokeErr.message };

  const token = `ct_${randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("calendar_tokens") as any)).insert({
    token,
    profile_id: user.id,
    org_id: orgId,
    label: "Schedule subscription",
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { token } };
}

export async function revokeCalendarTokenAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("calendar_tokens") as any))
    .delete()
    .eq("profile_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

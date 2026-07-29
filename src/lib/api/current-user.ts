import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Request-scoped current-user cache.
 *
 * `supabase.auth.getUser()` calls `/auth/v1/user` over the network on every
 * invocation to verify the session JWT — that's a ~30–80 ms round trip
 * from Vercel to Supabase. A single dashboard render used to make 3–5
 * of those calls (dashboard loader, my-self loader, RBAC `can()`, side
 * loaders, …) — pure duplicated latency.
 *
 * React's `cache()` memoises the result for the lifetime of one server
 * request. Downstream loaders and RBAC helpers switch to `getCachedUser()`
 * and every one after the first is instant. Server actions that need a
 * fresh check (e.g. right after a sign-in / sign-out) can still call
 * `supabase.auth.getUser()` directly and bypass this.
 *
 * Only used server-side. Client code has its own realtime auth state.
 */

export type CachedUser = {
  id: string;
  email: string | null;
} | null;

export const getCachedUser = cache(async (): Promise<CachedUser> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
});

/**
 * Convenience: current user's profile row (org_id + role + full name).
 * Cached alongside the user itself so the RBAC layer and the dashboard
 * greeting share one query instead of doing it twice.
 */
export type CachedProfile = {
  id: string;
  orgId: string | null;
  role: "admin" | "dispatcher" | "employee";
  fullName: string;
} | null;

export const getCachedProfile = cache(async (): Promise<CachedProfile> => {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, org_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as
    | {
        id: string;
        org_id: string | null;
        role: "admin" | "dispatcher" | "employee";
        full_name: string;
      }
    | null;
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    role: row.role,
    fullName: row.full_name,
  };
});

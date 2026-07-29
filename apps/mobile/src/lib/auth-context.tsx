/**
 * Auth + profile context.
 *
 * On mount:
 *   1. Look up the current session from SecureStore-backed Supabase.
 *   2. If found, fetch the profile row (role) so RBAC can gate the UI.
 *   3. Subscribe to auth state changes so sign-in / sign-out flip
 *      the app root between the (auth) and (tabs) stacks live.
 *
 * The `_layout.tsx` root reads `useAuth()` to redirect between the
 * authenticated tab shell and the /login stack.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Role } from "@/lib/rbac";

export type AuthProfile = {
  id: string;
  fullName: string;
  role: Role;
  orgId: string | null;
  employeeId: string | null;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: AuthProfile | null;
  needsTotpEnrolment: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsTotpEnrolment, setNeedsTotpEnrolment] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name, role, org_id")
      .eq("id", userId)
      .maybeSingle();
    const row = prof as
      | { id: string; full_name: string; role: Role; org_id: string | null }
      | null;
    if (!row) {
      setProfile(null);
      return;
    }
    // Best-effort employees row so mobile can insert time_entries
    // directly. Employees that were never fully onboarded may lack
    // this row — the schedule screen will surface a friendly empty
    // state instead of a crash.
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    const empId = (emp as { id: string } | null)?.id ?? null;

    setProfile({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      orgId: row.org_id,
      employeeId: empId,
    });

    // Spec §6.2 — admin + dispatcher must enrol TOTP before using
    // the app. Field staff are exempt.
    if (row.role === "admin" || row.role === "dispatcher") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find(
        (f) => f.status === "verified",
      );
      setNeedsTotpEnrolment(!verified);
    } else {
      setNeedsTotpEnrolment(false);
    }
  }, [supabase]);

  // Initial hydrate + auth subscription.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user.id) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s?.user.id) {
        await loadProfile(s.user.id);
      } else {
        setProfile(null);
        setNeedsTotpEnrolment(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      needsTotpEnrolment,
      signOut,
      refreshProfile,
    }),
    [loading, session, profile, needsTotpEnrolment, signOut, refreshProfile],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be inside <AuthProvider>");
  return v;
}

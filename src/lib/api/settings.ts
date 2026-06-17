import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsData = {
  org: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  /** The current user's own profile — used by the "My Account" card
   *  for avatar + display name without a second round-trip. */
  me: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string | null;
    role: "admin" | "dispatcher" | "employee";
  };
  data: Record<string, unknown>;
  /** Display-formatted "Last saved" timestamp from settings.updated_at,
   *  in the org's default locale. Null if the row has never been saved. */
  savedAt: string | null;
  members: Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: "admin" | "dispatcher" | "employee";
    email: string | null;
  }>;
};

export async function loadSettings(): Promise<SettingsData | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return null;

  const [orgRes, settingsRes, membersRes, meRes] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, logo_url").eq("id", orgId).maybeSingle(),
    supabase.from("settings").select("data, updated_at").eq("org_id", orgId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("role", { ascending: true })
      .limit(50),
    supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  type Org = { id: string; name: string; slug: string; logo_url: string | null };
  const org = orgRes.data as Org | null;
  if (!org) return null;

  const settingsRow = settingsRes.data as
    | { data: Record<string, unknown>; updated_at: string }
    | null;
  const settingsData = settingsRow?.data ?? {};
  const savedAt = settingsRow?.updated_at
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      }).format(new Date(settingsRow.updated_at))
    : null;

  type Member = {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: "admin" | "dispatcher" | "employee";
  };
  const members = (membersRes.data ?? []) as Member[];

  const meRow = (meRes.data ?? null) as Member | null;
  const me = {
    id: user.id,
    full_name: meRow?.full_name ?? user.email ?? "—",
    avatar_url: meRow?.avatar_url ?? null,
    email: user.email ?? null,
    role: (meRow?.role ?? "employee") as Member["role"],
  };

  return {
    org,
    me,
    data: settingsData,
    savedAt,
    members: members.map((m) => ({ ...m, email: null })),
  };
}

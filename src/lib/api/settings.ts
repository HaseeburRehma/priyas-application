import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SettingsData = {
  org: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
  data: Record<string, unknown>;
  members: Array<{
    id: string;
    full_name: string;
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

  const [orgRes, settingsRes, membersRes] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, logo_url").eq("id", orgId).maybeSingle(),
    supabase.from("settings").select("data").eq("org_id", orgId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("role", { ascending: true })
      .limit(50),
  ]);

  type Org = { id: string; name: string; slug: string; logo_url: string | null };
  const org = orgRes.data as Org | null;
  if (!org) return null;

  const settingsData =
    ((settingsRes.data as { data: Record<string, unknown> } | null)?.data) ?? {};

  type Member = { id: string; full_name: string; role: "admin" | "dispatcher" | "employee" };
  const members = (membersRes.data ?? []) as Member[];

  // Best-effort emails for members.
  const emails = new Map<string, string>();
  if (members.length > 0) {
    // We can only access auth.users via the service role. Keep blank here.
    // The page just displays full_name + role; email column stays null.
  }

  return {
    org,
    data: settingsData,
    members: members.map((m) => ({ ...m, email: emails.get(m.id) ?? null })),
  };
}

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { AppShell } from "@/components/layout/AppShell";
import { BottomNav } from "@/components/layout/BottomNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllowedRoutes } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

/** Translate the DB enum to the user-facing role names from the spec. */
function roleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "Management";
    case "dispatcher":
      return "Project Manager";
    case "employee":
      return "Field Staff";
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/**
 * Authenticated app shell. Responsive across all breakpoints:
 *   - desktop ≥1024px: persistent left sidebar (240px or 72px collapsed) +
 *     sticky topbar.
 *   - tablet 768–1023px: sidebar collapses to icon-only by default (still
 *     persistent); user can expand via the toggle.
 *   - mobile <768px: sidebar hidden by default, slides in as a drawer via
 *     the topbar hamburger; permanent bottom nav for the five most-used
 *     destinations.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(routes.login);

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileRaw as { full_name: string; role: string } | null;

  const fullName = profile?.full_name ?? user.email ?? "User";
  const role = profile?.role ?? "—";
  const initials = fullName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Allowed-route set drives sidebar + bottom-nav visibility for this user.
  const allowedRoutes = await getAllowedRoutes();
  const allowed = Array.from(allowedRoutes);

  return (
    <div className="min-h-screen bg-tertiary-200">
      <Sidebar allowedRoutes={allowed} />

      {/*
        Content column. Margin-left tracks sidebar width:
          mobile: 0 (sidebar is a drawer)
          tablet collapsed default: 72px
          desktop full: 240px
        Sidebar's actual width is driven by the Zustand store, so in CSS we
        use the same breakpoint defaults — when the user toggles, layout
        catches up via responsive utilities applied here and inside Sidebar.
      */}
      <AppShell
        user={{
          name: fullName,
          email: user.email ?? "",
          role: roleLabel(role),
          initials,
        }}
      >
        {children}
      </AppShell>

      <BottomNav allowedRoutes={allowed} />
    </div>
  );
}

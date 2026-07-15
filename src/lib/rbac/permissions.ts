import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCurrentDeviceRevoked } from "@/lib/security/device-revocation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type Role = "admin" | "dispatcher" | "employee";

export type Action =
  // Clients
  | "client.read"
  | "client.create"
  | "client.update"
  | "client.archive"
  | "client.delete"
  // Properties
  | "property.read"
  | "property.create"
  | "property.update"
  | "property.delete"
  // Employees
  | "employee.read"
  | "employee.create"
  | "employee.update"
  | "employee.archive"
  | "employee.delete"
  // Shifts / schedule
  | "shift.read"
  | "shift.create"
  | "shift.update"
  // Invoices
  | "invoice.read"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  // Reports
  | "report.alltagshilfe.view"
  | "report.alltagshilfe.export"
  // Invoice subactions
  | "invoice.send"
  | "invoice.mark_paid"
  | "invoice.lexware_sync"
  // Settings
  | "settings.read"
  | "settings.update"
  // Vacation
  | "vacation.request"
  | "vacation.approve"
  | "vacation.read_all"
  // Damage reports
  | "damage.read"
  | "damage.create"
  | "damage.resolve"
  // Training modules
  | "training.read"
  | "training.manage"
  | "training.complete"
  // Time tracking
  | "time.checkin"
  | "time.read_all"
  | "time.correct";

/**
 * Single source of truth for who can do what. Mirrors the RLS policies in
 * SQL — this is a defensive *additional* check at the action layer so we
 * fail fast with a clear error before hitting the database.
 *
 * Spec mapping:
 *   admin       = Management
 *   dispatcher  = Project Manager
 *   employee    = Field Staff
 */
const MATRIX: Record<Action, Role[]> = {
  "client.read": ["admin", "dispatcher", "employee"],
  "client.create": ["admin", "dispatcher"],
  "client.update": ["admin", "dispatcher"],
  "client.archive": ["admin"],
  "client.delete": ["admin"],

  "property.read": ["admin", "dispatcher", "employee"],
  "property.create": ["admin", "dispatcher"],
  "property.update": ["admin", "dispatcher"],
  "property.delete": ["admin"],

  "employee.read": ["admin", "dispatcher", "employee"],
  "employee.create": ["admin"],
  "employee.update": ["admin", "dispatcher"],
  "employee.archive": ["admin"],
  "employee.delete": ["admin"],

  "shift.read": ["admin", "dispatcher", "employee"],
  "shift.create": ["admin", "dispatcher"],
  "shift.update": ["admin", "dispatcher"],

  "invoice.read": ["admin", "dispatcher"],
  "invoice.create": ["admin", "dispatcher"],
  "invoice.update": ["admin", "dispatcher"],
  "invoice.delete": ["admin"],

  "report.alltagshilfe.view": ["admin", "dispatcher"],
  "report.alltagshilfe.export": ["admin", "dispatcher"],

  "invoice.send": ["admin", "dispatcher"],
  "invoice.mark_paid": ["admin", "dispatcher"],
  "invoice.lexware_sync": ["admin"],

  "settings.read": ["admin", "dispatcher"],
  "settings.update": ["admin"],

  // Any signed-in user (with a profile) can submit; managers approve.
  "vacation.request": ["admin", "dispatcher", "employee"],
  "vacation.approve": ["admin", "dispatcher"],
  "vacation.read_all": ["admin", "dispatcher"],

  // Damage reports — field staff log them, managers triage + resolve.
  "damage.read": ["admin", "dispatcher", "employee"],
  "damage.create": ["admin", "dispatcher", "employee"],
  "damage.resolve": ["admin", "dispatcher"],

  // Training modules — anyone reads, managers manage, anyone completes own.
  "training.read": ["admin", "dispatcher", "employee"],
  "training.manage": ["admin", "dispatcher"],
  "training.complete": ["admin", "dispatcher", "employee"],

  // Time tracking — every signed-in user can punch in/out their own shifts.
  // Managers can read everyone's data and apply manual corrections.
  "time.checkin": ["admin", "dispatcher", "employee"],
  "time.read_all": ["admin", "dispatcher"],
  "time.correct": ["admin", "dispatcher"],
};

export class PermissionError extends Error {
  constructor(message: string, public readonly action: Action) {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * Returns the current user's role, or `null` if signed out / unattached /
 * revoked. This is the one chokepoint `requireAuth()`, `requirePermission()`,
 * `canReachRoute()` and `getAllowedRoutes()` all funnel through, so it's
 * also where device-revocation enforcement lives — `middleware.ts`'s
 * equivalent check only runs for page navigations/Server Actions (it
 * explicitly skips all `/api/*` routes, which handle their own auth), so
 * cookie-authenticated API routes like `/api/reports/export` previously
 * never checked `user_devices` at all. A revoked device is treated exactly
 * like "not signed in" — every caller already handles that shape correctly.
 *
 * Wrapped in React's `cache()` so the extra device-revocation lookup this
 * adds only costs one Supabase round-trip per request even when several
 * permission checks run during the same Server Action/page render.
 */
export const getCurrentRole = cache(async function getCurrentRole(): Promise<{
  userId: string | null;
  orgId: string | null;
  role: Role | null;
  supabase: SupabaseServerClient;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, orgId: null, role: null, supabase };

  if (await isCurrentDeviceRevoked(supabase, user.id)) {
    await supabase.auth.signOut();
    return { userId: null, orgId: null, role: null, supabase };
  }

  const { data } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as { org_id: string | null; role: Role | null } | null;
  return {
    userId: user.id,
    orgId: profile?.org_id ?? null,
    role: profile?.role ?? null,
    supabase,
  };
});

/**
 * Lighter-weight check than `requirePermission`: just confirms the
 * caller is signed in and belongs to an org. Use this on public API
 * routes (`/api/clients`, `/api/invoices`, etc.) so unauthenticated
 * requests get a clean 401 instead of an empty-array HTTP 200 via
 * RLS. Returns the user id + org id when the session is valid, or
 * null on either failure mode so callers can map it to a 401 response.
 */
export async function requireAuth(): Promise<
  { userId: string; orgId: string } | null
> {
  const { userId, orgId } = await getCurrentRole();
  if (!userId || !orgId) return null;
  return { userId, orgId };
}

/**
 * Roles the spec requires mandatory 2FA for (Management + Project Manager).
 * `employee` (Field Staff) is unaffected.
 */
const AAL2_REQUIRED_ROLES: Role[] = ["admin", "dispatcher"];

/** Throws PermissionError if the current user can't perform the action. */
export async function requirePermission(action: Action) {
  const { userId, orgId, role, supabase } = await getCurrentRole();
  if (!userId) throw new PermissionError("Not signed in", action);
  if (!orgId) throw new PermissionError("No organisation attached", action);
  if (!role || !MATRIX[action].includes(role)) {
    throw new PermissionError(
      `Role '${role ?? "anonymous"}' is not permitted to ${action}`,
      action,
    );
  }
  if (AAL2_REQUIRED_ROLES.includes(role)) {
    // `getAuthenticatorAssuranceLevel()` with no argument reads the `aal`
    // claim off the already-cached local session — no network call, so
    // this is free to run on every write. The dashboard layout already
    // redirects admin/dispatcher to /setup-2fa on page render, but that
    // only covers page navigations; this closes the same gap for Server
    // Actions and API routes called directly (curl, a future mobile
    // client, a compromised/replayed session cookie hitting an action
    // without ever rendering the dashboard).
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel !== "aal2") {
      throw new PermissionError("2FA verification required", action);
    }
  }
  return { userId, orgId, role };
}

/** Boolean variant for conditional UI. Server-only. */
export async function can(action: Action): Promise<boolean> {
  try {
    await requirePermission(action);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================================
 * Route-level access — drives both sidebar visibility and page redirects.
 * Each entry lists the roles that may *reach* the route. RLS still owns
 * data-level access; this is the cosmetic + first-line redirect layer.
 * ========================================================================== */

export type RouteKey =
  | "dashboard"
  | "clients"
  | "clientNew"
  | "client"
  | "properties"
  | "propertyNew"
  | "property"
  | "schedule"
  | "vacation"
  | "training"
  | "employees"
  | "employee"
  | "invoices"
  | "invoice"
  | "invoiceNew"
  | "invoiceEdit"
  | "assignments"
  | "assignment"
  | "assignmentNew"
  | "reports"
  | "alltagshilfeReport"
  | "settings"
  | "chat"
  | "notifications"
  | "onboard";

const ALL_ROLES: Role[] = ["admin", "dispatcher", "employee"];
const MANAGER_ROLES: Role[] = ["admin", "dispatcher"];

/**
 * Allow-list per route. Field staff get the minimum surface from the spec:
 * dashboard, schedule (their own), vacation, training, chat, notifications.
 * Everything else is manager-only.
 */
export const ROUTE_ACCESS: Record<RouteKey, Role[]> = {
  dashboard: ALL_ROLES,
  schedule: ALL_ROLES,
  vacation: ALL_ROLES,
  training: ALL_ROLES,
  chat: ALL_ROLES,
  notifications: ALL_ROLES,

  clients: MANAGER_ROLES,
  clientNew: MANAGER_ROLES,
  client: MANAGER_ROLES,
  properties: MANAGER_ROLES,
  propertyNew: MANAGER_ROLES,
  property: MANAGER_ROLES,
  employees: MANAGER_ROLES,
  employee: MANAGER_ROLES,
  invoices: MANAGER_ROLES,
  invoice: MANAGER_ROLES,
  invoiceNew: MANAGER_ROLES,
  invoiceEdit: MANAGER_ROLES,
  assignments: MANAGER_ROLES,
  assignment: MANAGER_ROLES,
  assignmentNew: MANAGER_ROLES,
  reports: MANAGER_ROLES,
  alltagshilfeReport: MANAGER_ROLES,
  settings: MANAGER_ROLES,
  onboard: MANAGER_ROLES,
};

/** Returns true if the current signed-in user may reach the route. */
export async function canReachRoute(route: RouteKey): Promise<boolean> {
  const { role } = await getCurrentRole();
  if (!role) return false;
  return ROUTE_ACCESS[route].includes(role);
}

/**
 * Page-level guard. Throws via Next's `redirect()` when the user cannot
 * reach this route. Use at the top of server-component page files.
 */
export async function requireRoute(route: RouteKey): Promise<void> {
  // We import lazily to keep this module usable from non-Next contexts.
  const { redirect } = await import("next/navigation");
  const allowed = await canReachRoute(route);
  if (!allowed) redirect("/dashboard");
}

/**
 * Bulk check used by the sidebar — single DB hit, returns the allow-list
 * of route keys for the current user.
 */
export async function getAllowedRoutes(): Promise<Set<RouteKey>> {
  const { role } = await getCurrentRole();
  const out = new Set<RouteKey>();
  if (!role) return out;
  for (const [key, roles] of Object.entries(ROUTE_ACCESS) as Array<
    [RouteKey, Role[]]
  >) {
    if (roles.includes(role)) out.add(key);
  }
  return out;
}

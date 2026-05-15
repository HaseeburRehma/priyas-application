"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateEmployeeRoleSchema,
} from "@/lib/validators/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requirePermission,
  PermissionError,
  type Role,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { env } from "@/lib/constants/env";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(
  action: string,
  recordId: string,
  message: string,
  before: unknown = null,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action,
    table_name: "employees",
    record_id: recordId,
    before: before ?? null,
    after: { message, meta: "via WebApp" },
  });
}

export async function createEmployeeAction(
  raw: unknown,
): Promise<
  ActionResult<{
    id: string;
    inviteStatus: "sent" | "skipped" | "failed";
    inviteError?: string;
  }>
> {
  let callerRole: Role;
  try {
    const ctx = await requirePermission("employee.create");
    callerRole = ctx.role;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  // Only admins can mint other admins/dispatchers. employee.create
  // already implies admin in the permission matrix today, but we
  // keep this defensive check so the rule survives a matrix tweak.
  if (
    (input.role === "admin" || input.role === "dispatcher") &&
    callerRole !== "admin"
  ) {
    return {
      ok: false,
      error: "Only admins may invite admins or dispatchers.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // 1) Insert the employees row first (placeholder — profile_id stays
  //    NULL until the invite is accepted; the trigger in migration
  //    000028 then claims this row by matching email).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("employees") as any))
    .insert({
      org_id: orgId,
      full_name: input.full_name,
      email: input.email || null,
      phone: input.phone || null,
      hire_date: input.hire_date || null,
      weekly_hours: input.weekly_hours,
      hourly_rate_eur:
        typeof input.hourly_rate_eur === "number" ? input.hourly_rate_eur : null,
      status: input.status,
      notes: input.notes || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const newId = (data as { id: string }).id;

  // 2) When an email was provided, send a Supabase invite. This requires
  //    the service role key (admin API). If the env isn't configured
  //    we fall back to "row created, manager must share access manually"
  //    — the row stays valid, just without an auth invitation.
  let inviteStatus: "sent" | "skipped" | "failed" = "skipped";
  let inviteError: string | null = null;
  if (input.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(
        input.email,
        {
          data: {
            org_id: orgId,
            full_name: input.full_name,
            role: input.role,
            phone: input.phone || null,
          },
          // The invitee lands on the standard auth callback which then
          // routes them to /dashboard once their profile + employees
          // rows are linked by handle_new_user().
          redirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(
            routes.dashboard,
          )}`,
        },
      );
      if (invErr) {
        inviteError = invErr.message;
        inviteStatus = "failed";
      } else {
        inviteStatus = "sent";
      }
    } catch (err) {
      inviteError = err instanceof Error ? err.message : "unknown";
      inviteStatus = "failed";
    }
  }

  await audit(
    "create",
    newId,
    inviteStatus === "sent"
      ? `Mitarbeiter <strong>${input.full_name}</strong> angelegt + eingeladen.`
      : `Mitarbeiter <strong>${input.full_name}</strong> angelegt (Einladung: ${inviteStatus}).`,
  );
  revalidatePath(routes.employees);
  revalidatePath(routes.dashboard);

  // Don't fail the whole action just because the invite mail bounced —
  // the manager can re-send from the detail page. Surface the status
  // in the result so the UI can show a contextual toast.
  return {
    ok: true,
    data: {
      id: newId,
      inviteStatus,
      ...(inviteError ? { inviteError } : {}),
    },
  };
}

export async function updateEmployeeAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("employee.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  // Capture pre-update snapshot so the audit row carries a real
  // `before` diff. Without this the audit log loses half the change
  // history (only new values land in `after`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: beforeRow } = await ((supabase.from("employees") as any))
    .select(
      "full_name, email, phone, hire_date, weekly_hours, hourly_rate_eur, status, notes",
    )
    .eq("id", input.id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employees") as any))
    .update({
      full_name: input.full_name,
      email: input.email || null,
      phone: input.phone || null,
      hire_date: input.hire_date || null,
      weekly_hours: input.weekly_hours,
      hourly_rate_eur:
        typeof input.hourly_rate_eur === "number" ? input.hourly_rate_eur : null,
      status: input.status,
      notes: input.notes || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await audit(
    "update",
    input.id,
    `Mitarbeiter <strong>${input.full_name}</strong> aktualisiert.`,
    beforeRow ?? null,
  );
  revalidatePath(routes.employee(input.id));
  revalidatePath(routes.employees);
  return { ok: true, data: { id: input.id } };
}

/**
 * Promote / demote an existing employee by writing to
 * `profiles.role`. The BEFORE-UPDATE trigger added in migration 000024
 * (`trg_prevent_self_role_escalation`) blocks a user from changing
 * their own row — we mirror that check here so the UI can surface a
 * friendly error before the DB throws errcode 42501.
 *
 * Returns the previous role so the caller can show "promoted from X
 * to Y" copy / undo in the future.
 */
export async function updateEmployeeRoleAction(
  raw: unknown,
): Promise<ActionResult<{ employeeId: string; role: Role; previousRole: Role | null }>> {
  let callerUserId: string;
  let callerRole: Role;
  try {
    const ctx = await requirePermission("employee.update");
    callerUserId = ctx.userId;
    callerRole = ctx.role;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = updateEmployeeRoleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { employeeId, role: nextRole } = parsed.data;

  // Only admins may assign admin/dispatcher; dispatchers can demote /
  // re-classify within "employee". Without this check the DB-level RLS
  // would let a dispatcher set someone else's role to admin.
  if (
    (nextRole === "admin" || nextRole === "dispatcher") &&
    callerRole !== "admin"
  ) {
    return {
      ok: false,
      error: "Only admins may assign admin or dispatcher.",
    };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: empRow, error: empErr } = await ((supabase.from("employees") as any))
    .select("id, profile_id, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr) return { ok: false, error: empErr.message };
  const emp = empRow as {
    id: string;
    profile_id: string | null;
    full_name: string;
  } | null;
  if (!emp) return { ok: false, error: "Employee not found." };
  if (!emp.profile_id) {
    return {
      ok: false,
      error: "Employee has not accepted the invitation yet.",
    };
  }
  // Friendly guardrail in front of the SQL trigger: admins can promote
  // anyone *but themselves* to prevent accidental self-demotion.
  if (emp.profile_id === callerUserId) {
    return {
      ok: false,
      error: "self-role-change",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prevRow } = await ((supabase.from("profiles") as any))
    .select("role")
    .eq("id", emp.profile_id)
    .maybeSingle();
  const previousRole =
    (prevRow as { role: Role | null } | null)?.role ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await ((supabase.from("profiles") as any))
    .update({ role: nextRole })
    .eq("id", emp.profile_id);
  if (upErr) {
    // The trigger raises 42501 on self-role-change. Surface a stable
    // sentinel so the client can show the localised message.
    const code = (upErr as { code?: string }).code;
    if (code === "42501") {
      return { ok: false, error: "self-role-change" };
    }
    return { ok: false, error: upErr.message };
  }

  await audit(
    "role_change",
    emp.id,
    `Rolle für <strong>${emp.full_name}</strong> auf <code>${nextRole}</code> gesetzt (vorher: ${previousRole ?? "—"}).`,
    { role: previousRole },
  );
  revalidatePath(routes.employee(emp.id));
  revalidatePath(routes.employees);
  return {
    ok: true,
    data: { employeeId: emp.id, role: nextRole, previousRole },
  };
}

/* ============================================================================
 * Bulk actions.
 * ========================================================================== */

export type BulkActionSummary = {
  ok: true;
  data: {
    ok: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  };
};

/**
 * Bulk archive employees. Mirrors `archiveEmployeeAction` per row,
 * but skips the future-shift cleanup-per-row audit chatter — the
 * unassigned count is logged once at the end of the batch.
 */
export async function bulkArchiveEmployeesAction(
  ids: string[],
): Promise<BulkActionSummary | { ok: false; error: string }> {
  try {
    await requirePermission("employee.archive");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, data: { ok: 0, failed: 0, errors: [] } };
  }
  const unique = Array.from(new Set(ids.filter((s) => typeof s === "string")));
  if (unique.length > 500) {
    return { ok: false, error: "Too many items selected (max 500)." };
  }

  const supabase = await createSupabaseServerClient();
  const errors: Array<{ id: string; error: string }> = [];
  let success = 0;
  const nowIso = new Date().toISOString();

  for (const id of unique) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ employee_id: null })
      .eq("employee_id", id)
      .gt("starts_at", nowIso);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: beforeRow } = await ((supabase.from("employees") as any))
      .select("full_name, status, deleted_at")
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("employees") as any))
      .update({ deleted_at: nowIso, status: "inactive" })
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
      continue;
    }
    await audit(
      "archive",
      id,
      "Mitarbeiter archiviert (Bulk-Aktion).",
      beforeRow ?? null,
    );
    success += 1;
  }

  revalidatePath(routes.employees);
  return {
    ok: true,
    data: { ok: success, failed: errors.length, errors },
  };
}

/**
 * Bulk-invite placeholder employee rows. For each id we look up the
 * row, skip those with an existing `profile_id` (already accepted),
 * skip rows missing an email (we can't invite without one) and otherwise
 * send a fresh Supabase invite via the admin API. Requires
 * `employee.create`.
 */
export async function bulkInviteEmployeesAction(
  ids: string[],
): Promise<BulkActionSummary | { ok: false; error: string }> {
  let callerRole: Role;
  try {
    const ctx = await requirePermission("employee.create");
    callerRole = ctx.role;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  void callerRole;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, data: { ok: 0, failed: 0, errors: [] } };
  }
  const unique = Array.from(new Set(ids.filter((s) => typeof s === "string")));
  if (unique.length > 500) {
    return { ok: false, error: "Too many items selected (max 500)." };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: "Invite is unavailable: SUPABASE_SERVICE_ROLE_KEY not configured.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await ((supabase.from("employees") as any))
    .select("id, full_name, email, phone, profile_id")
    .in("id", unique);
  type Row = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    profile_id: string | null;
  };
  const empRows = (rows ?? []) as Row[];

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const errors: Array<{ id: string; error: string }> = [];
  let success = 0;

  for (const emp of empRows) {
    if (emp.profile_id) {
      errors.push({ id: emp.id, error: "already_accepted" });
      continue;
    }
    if (!emp.email) {
      errors.push({ id: emp.id, error: "missing_email" });
      continue;
    }
    try {
      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(
        emp.email,
        {
          data: {
            org_id: orgId,
            full_name: emp.full_name,
            role: "employee",
            phone: emp.phone,
          },
          redirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(
            routes.dashboard,
          )}`,
        },
      );
      if (invErr) {
        errors.push({ id: emp.id, error: invErr.message });
        continue;
      }
      await audit(
        "invite",
        emp.id,
        `Einladung an <strong>${emp.full_name}</strong> erneut gesendet (Bulk-Aktion).`,
      );
      success += 1;
    } catch (err) {
      errors.push({
        id: emp.id,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // Surface employees whose IDs weren't returned by the DB (deleted /
  // wrong org). Mark them as failed so the count adds up.
  const seen = new Set(empRows.map((e) => e.id));
  for (const id of unique) {
    if (!seen.has(id)) errors.push({ id, error: "not_found" });
  }

  revalidatePath(routes.employees);
  return {
    ok: true,
    data: { ok: success, failed: errors.length, errors },
  };
}

export async function archiveEmployeeAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("employee.archive");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();

  // ---- FK cleanup BEFORE the soft-delete --------------------------------
  // The `shifts` table has `employee_id` ON DELETE SET NULL, but a *soft*
  // delete leaves the FK pointing at an archived row. To keep planners
  // honest we null out the assignment on every *future* shift; history
  // (past shifts, time_entries, training_assignments) keeps the FK
  // intact so audit/reporting can still attribute the work to the
  // archived employee. We log the count separately so the audit trail
  // shows what was cleaned up.
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: futureShiftsData, error: futureShiftsErr } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ employee_id: null })
      .eq("employee_id", id)
      .gt("starts_at", nowIso)
      .select("id");
  if (futureShiftsErr) return { ok: false, error: futureShiftsErr.message };
  const unassignedCount = Array.isArray(futureShiftsData)
    ? (futureShiftsData as Array<{ id: string }>).length
    : 0;
  if (unassignedCount > 0) {
    await audit(
      "unassign_future_shifts",
      id,
      `${unassignedCount} zukünftige Schicht(en) vor Archivierung freigegeben.`,
    );
  }

  // Capture pre-archive snapshot for the audit log.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: beforeRow } = await ((supabase.from("employees") as any))
    .select("full_name, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employees") as any))
    .update({ deleted_at: nowIso, status: "inactive" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("archive", id, "Mitarbeiter archiviert.", beforeRow ?? null);
  revalidatePath(routes.employees);
  return { ok: true, data: { id } };
}

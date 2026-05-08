"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/validators/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { env } from "@/lib/constants/env";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(
  action: string,
  recordId: string,
  message: string,
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
  try {
    await requirePermission("employee.create");
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
            role: "employee",
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
  await audit("update", input.id, `Mitarbeiter <strong>${input.full_name}</strong> aktualisiert.`);
  revalidatePath(routes.employee(input.id));
  revalidatePath(routes.employees);
  return { ok: true, data: { id: input.id } };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employees") as any))
    .update({ deleted_at: new Date().toISOString(), status: "inactive" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("archive", id, "Mitarbeiter archiviert.");
  revalidatePath(routes.employees);
  return { ok: true, data: { id } };
}

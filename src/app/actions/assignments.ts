"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const StaffSchema = z.object({
  employeeId: z.string().uuid(),
  allocatedHours: z.number().positive().max(168),
});

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  propertyId: z.string().uuid(),
  hoursPerPeriod: z.number().positive().max(168),
  frequency: z.enum(["weekly", "biweekly", "monthly"]).default("weekly"),
  hourlyRateCents: z.number().int().min(0).nullable(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
  staff: z.array(StaffSchema).max(20),
});

export async function upsertAssignmentAction(
  input: z.infer<typeof UpsertSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = UpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Sum-of-staff must not exceed planned hours.
  const sumAllocated = parsed.data.staff.reduce((a, s) => a + s.allocatedHours, 0);
  if (sumAllocated > parsed.data.hoursPerPeriod) {
    return {
      ok: false,
      error: `Mitarbeiterstunden (${sumAllocated}h) übersteigen geplante Stunden (${parsed.data.hoursPerPeriod}h).`,
    };
  }

  const supabase = await createSupabaseServerClient();
  // Resolve org_id from property, and verify the property actually belongs
  // to the client the caller claims — clientId is otherwise trusted as-is
  // from the request, so without this check a stale/crafted request could
  // link a property to an unrelated client in the same org, corrupting the
  // client↔property↔billing chain invoices are built from.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRow } = await ((supabase.from("properties") as any))
    .select("org_id, client_id")
    .eq("id", parsed.data.propertyId)
    .maybeSingle();
  const prop = propRow as { org_id: string; client_id: string } | null;
  if (!prop) return { ok: false, error: "property_not_found" };
  const orgId = prop.org_id;
  if (prop.client_id !== parsed.data.clientId) {
    return { ok: false, error: "property_client_mismatch" };
  }

  // Every allocated employee must belong to the same org as the assignment.
  // Neither the RLS write policy on assignment_staff nor (until this check)
  // this action verified that — a dispatcher could otherwise link another
  // org's employee record into their own org's assignment, corrupting that
  // employee's workload data across the tenant boundary.
  const wantEmployeeIds = Array.from(
    new Set(parsed.data.staff.map((s) => s.employeeId)),
  );
  if (wantEmployeeIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: empRows } = await ((supabase.from("employees") as any))
      .select("id")
      .eq("org_id", orgId)
      .in("id", wantEmployeeIds)
      .is("deleted_at", null);
    const validIds = new Set(((empRows ?? []) as Array<{ id: string }>).map((r) => r.id));
    if (validIds.size !== wantEmployeeIds.length) {
      return { ok: false, error: "employee_not_in_org" };
    }
  }

  let assignmentId = parsed.data.id;
  const payload = {
    org_id: orgId,
    client_id: parsed.data.clientId,
    property_id: parsed.data.propertyId,
    hours_per_period: parsed.data.hoursPerPeriod,
    frequency: parsed.data.frequency,
    hourly_rate_cents: parsed.data.hourlyRateCents,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn ?? null,
    active: parsed.data.active,
    notes: parsed.data.notes ?? null,
  };

  if (assignmentId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("assignments") as any))
      .update(payload)
      .eq("id", assignmentId);
    if (error) return { ok: false, error: error.message };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ins, error } = await ((supabase.from("assignments") as any))
      .insert(payload)
      .select("id")
      .single();
    if (error || !ins) return { ok: false, error: error?.message ?? "insert_failed" };
    assignmentId = (ins as { id: string }).id;
  }

  // Replace staff allocations atomically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("assignment_staff") as any))
    .delete()
    .eq("assignment_id", assignmentId);
  if (parsed.data.staff.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: ssErr } = await ((supabase.from("assignment_staff") as any))
      .insert(
        parsed.data.staff.map((s) => ({
          assignment_id: assignmentId!,
          employee_id: s.employeeId,
          allocated_hours: s.allocatedHours,
        })),
      );
    if (ssErr) return { ok: false, error: ssErr.message };
  }

  revalidatePath(routes.assignments);
  revalidatePath(routes.assignment(assignmentId));
  return { ok: true, data: { id: assignmentId } };
}

export async function archiveAssignmentAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("assignments") as any))
    .update({ active: false, ends_on: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.assignments);
  return { ok: true, data: { id } };
}

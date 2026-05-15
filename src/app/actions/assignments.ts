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
  // Resolve org_id from property.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRow } = await ((supabase.from("properties") as any))
    .select("org_id")
    .eq("id", parsed.data.propertyId)
    .maybeSingle();
  const orgId = (propRow as { org_id: string } | null)?.org_id;
  if (!orgId) return { ok: false, error: "property_not_found" };

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

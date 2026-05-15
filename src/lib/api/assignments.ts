import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_HOURLY_RATE_CENTS,
  type AssignmentBreakdown,
} from "@/lib/billing";
import { summarizeAssignment } from "@/lib/billing/draft";

export type AssignmentSummaryRow = {
  assignment_id: string;
  client_id: string;
  client_name: string;
  property_id: string;
  property_name: string;
  hours_per_period: number;
  frequency: "weekly" | "biweekly" | "monthly";
  effective_rate_cents: number;
  allocated_hours: number;
  staff_count: number;
  active: boolean;
};

export async function loadAssignments(): Promise<AssignmentSummaryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("assignment_summary")
    .select("*")
    .order("active", { ascending: false })
    .order("client_name", { ascending: true });
  return ((data ?? []) as AssignmentSummaryRow[]).map((r) => ({
    ...r,
    hours_per_period: Number(r.hours_per_period),
    effective_rate_cents: Number(r.effective_rate_cents),
    allocated_hours: Number(r.allocated_hours),
  }));
}

export type AssignmentDetail = {
  id: string;
  client_id: string;
  client_name: string;
  property_id: string;
  property_name: string;
  hours_per_period: number;
  frequency: "weekly" | "biweekly" | "monthly";
  effective_rate_cents: number;
  active: boolean;
  notes: string | null;
  breakdown: AssignmentBreakdown;
};

export async function loadAssignmentDetail(
  assignmentId: string,
  options: { sinceISO?: string; untilISO?: string } = {},
): Promise<AssignmentDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("assignment_summary")
    .select("*")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  const summary = row as AssignmentSummaryRow | null;
  if (!summary) return null;

  // Planned per-staff hours.
  const { data: plannedRows } = await supabase
    .from("assignment_staff")
    .select(
      `allocated_hours, employee:employees ( id, full_name )`,
    )
    .eq("assignment_id", assignmentId);
  type PlannedDb = {
    allocated_hours: number;
    employee: { id: string; full_name: string } | null;
  };
  const planned = ((plannedRows ?? []) as unknown as PlannedDb[])
    .filter((p) => p.employee);

  // Actual minutes by employee in the window — default last 30 days.
  const until = options.untilISO ?? new Date().toISOString();
  const sinceMs =
    options.sinceISO ?? new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: shiftRows } = await supabase
    .from("shifts")
    .select("employee_id, actual_minutes, billable_minutes")
    .eq("assignment_id", assignmentId)
    .is("deleted_at", null)
    .gte("starts_at", sinceMs)
    .lte("starts_at", until);
  type DbShift = {
    employee_id: string | null;
    actual_minutes: number | null;
    billable_minutes: number | null;
  };
  const actualByEmployee = new Map<string, number>();
  for (const s of (shiftRows ?? []) as DbShift[]) {
    if (!s.employee_id) continue;
    actualByEmployee.set(
      s.employee_id,
      (actualByEmployee.get(s.employee_id) ?? 0) +
        Number(s.billable_minutes ?? s.actual_minutes ?? 0),
    );
  }

  const breakdown = summarizeAssignment({
    assignmentId,
    propertyName: summary.property_name,
    rateCents: summary.effective_rate_cents || DEFAULT_HOURLY_RATE_CENTS,
    staff: planned.map((p) => ({
      employeeId: p.employee!.id,
      employeeName: p.employee!.full_name,
      plannedMinutes: Math.round(Number(p.allocated_hours) * 60),
      actualMinutes: actualByEmployee.get(p.employee!.id) ?? 0,
    })),
  });

  return {
    id: summary.assignment_id,
    client_id: summary.client_id,
    client_name: summary.client_name,
    property_id: summary.property_id,
    property_name: summary.property_name,
    hours_per_period: Number(summary.hours_per_period),
    frequency: summary.frequency,
    effective_rate_cents: Number(summary.effective_rate_cents),
    active: summary.active,
    notes: null,
    breakdown,
  };
}

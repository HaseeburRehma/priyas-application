import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invoiceKindForClient } from "@/lib/billing/rates";
import { buildDraftInvoice, type ApprovedShiftRow } from "@/lib/billing/draft";
import type { DraftInvoice } from "@/lib/billing/types";

export type PrepareDraftArgs = {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  /** If provided, restrict to a single assignment. */
  assignmentId?: string | null;
  groupBy?: "property_employee" | "property" | "shift";
};

export type PrepareDraftResult = {
  draft: DraftInvoice;
  client: {
    id: string;
    org_id: string;
    display_name: string;
    customer_type: "residential" | "commercial" | "alltagshilfe";
    export_target: "internal" | "lexware";
    default_hourly_rate_cents: number | null;
    annual_budget_cents: number | null;
    billing_email: string | null;
    email: string | null;
  };
  shiftCount: number;
  totalMinutes: number;
};

/**
 * Aggregate approved shifts for a client over a date range into a draft
 * invoice. Pure SQL → in-memory aggregation → `buildDraftInvoice`.
 */
export async function prepareDraftForRange(
  args: PrepareDraftArgs,
): Promise<PrepareDraftResult | null> {
  const supabase = await createSupabaseServerClient();

  const { data: clientRow } = await supabase
    .from("clients")
    .select(
      `id, org_id, display_name, customer_type, export_target,
       default_hourly_rate_cents, annual_budget_cents, billing_email, email`,
    )
    .eq("id", args.clientId)
    .is("deleted_at", null)
    .maybeSingle();
  const client = clientRow as PrepareDraftResult["client"] | null;
  if (!client) return null;

  // Fetch approved, billable shifts in range for this client's properties.
  let q = supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, billable_minutes, actual_minutes,
       override_rate_cents, assignment_id,
       employee:employees ( id, full_name ),
       property:properties!inner ( id, name, client_id ),
       assignment:assignments ( id, hourly_rate_cents )`,
    )
    .is("deleted_at", null)
    .eq("billing_status", "approved")
    .eq("properties.client_id", client.id)
    .gte("starts_at", `${args.periodStart}T00:00:00Z`)
    .lte("starts_at", `${args.periodEnd}T23:59:59Z`);

  if (args.assignmentId) q = q.eq("assignment_id", args.assignmentId);

  const { data: shiftRows, error } = await q;
  if (error) throw error;

  type DbShift = {
    id: string;
    starts_at: string;
    ends_at: string;
    billable_minutes: number | null;
    actual_minutes: number | null;
    override_rate_cents: number | null;
    assignment_id: string | null;
    employee: { id: string; full_name: string } | null;
    property: { id: string; name: string; client_id: string } | null;
    assignment: { id: string; hourly_rate_cents: number | null } | null;
  };

  const rows: ApprovedShiftRow[] = ((shiftRows ?? []) as unknown as DbShift[])
    .filter((r) => r.employee && r.property)
    .map((r) => ({
      shiftId: r.id,
      employeeId: r.employee!.id,
      employeeName: r.employee!.full_name,
      propertyId: r.property!.id,
      propertyName: r.property!.name,
      assignmentId: r.assignment_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      billableMinutes: Number(r.billable_minutes ?? r.actual_minutes ?? 0),
      overrideRateCents: r.override_rate_cents,
      assignmentRateCents: r.assignment?.hourly_rate_cents ?? null,
      clientDefaultRateCents: client.default_hourly_rate_cents,
    }));

  const totalMinutes = rows.reduce((a, r) => a + r.billableMinutes, 0);

  const draft = buildDraftInvoice({
    clientId: client.id,
    invoiceKind: invoiceKindForClient(client.customer_type),
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    shifts: rows,
    groupBy: args.groupBy,
    notes: null,
  });

  return { draft, client, shiftCount: rows.length, totalMinutes };
}

/**
 * Internal hours tracking per client (Priya clients only).
 *
 * Fixed-contract clients are invoiced a flat monthly fee, so the invoice
 * never shows hours — but the team still needs to know whether the
 * contracted hours are actually being delivered. This loader sums the
 * client's shifts for the last few calendar months (Europe/Berlin):
 *
 *   planned — every non-cancelled shift, scheduled duration
 *   actual  — completed shifts, billable → actual → scheduled minutes
 *
 * RLS is org-scoped, so the caller's session client is enough.
 */
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClientHoursMonth = {
  /** "2026-10" */
  month: string;
  plannedMinutes: number;
  actualMinutes: number;
  shiftCount: number;
};

const MONTHS_BACK = 3;

const berlinMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
});

function monthKey(d: Date): string {
  // en-CA formats as "2026-10".
  return berlinMonth.format(d);
}

/** Newest month first, always MONTHS_BACK entries (zeros when empty). */
export async function loadClientHours(clientId: string): Promise<ClientHoursMonth[]> {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))));
  }
  const oldest = keys[keys.length - 1]!;
  // One day of slack before the Berlin month starts covers the UTC offset;
  // rows outside the wanted months are dropped by the key lookup below.
  const from = new Date(`${oldest}-01T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, status, billable_minutes, actual_minutes,
       property:properties!inner ( client_id )`,
    )
    .is("deleted_at", null)
    .eq("properties.client_id", clientId)
    .neq("status", "cancelled")
    .gte("starts_at", from.toISOString());
  if (error) throw error;

  const byMonth = new Map<string, ClientHoursMonth>(
    keys.map((k) => [k, { month: k, plannedMinutes: 0, actualMinutes: 0, shiftCount: 0 }]),
  );

  type Row = {
    starts_at: string;
    ends_at: string;
    status: string;
    billable_minutes: number | null;
    actual_minutes: number | null;
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    const bucket = byMonth.get(monthKey(new Date(r.starts_at)));
    if (!bucket) continue;
    const scheduled = Math.max(
      0,
      Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000),
    );
    bucket.plannedMinutes += scheduled;
    bucket.shiftCount += 1;
    if (r.status === "completed") {
      bucket.actualMinutes += r.billable_minutes ?? r.actual_minutes ?? scheduled;
    }
  }

  return keys.map((k) => byMonth.get(k)!);
}

export type ContractReminder = {
  clientId: string;
  displayName: string;
  contractEnd: string;
  contractMonths: number | null;
  fixedMonthlyFeeCents: number | null;
};

const REMIND_DAYS = 30;

/**
 * Fixed-contract clients whose term ends within the next 30 days or has
 * already ended. Nothing renews or stops automatically — the dashboard
 * lists them so an admin decides (extend via the edit form, or switch
 * the client to hourly / archive it). Soonest first.
 */
export async function loadContractReminders(): Promise<ContractReminder[]> {
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + REMIND_DAYS);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, display_name, contract_end, contract_months, fixed_monthly_fee_cents")
    .is("deleted_at", null)
    .eq("archived", false)
    .eq("billing_mode", "fixed")
    .not("contract_end", "is", null)
    .lte("contract_end", horizon.toISOString().slice(0, 10))
    .order("contract_end", { ascending: true })
    .limit(20);
  // A reminder list must never take the dashboard down with it.
  if (error) {
    console.error("[contract-reminders]", error.message);
    return [];
  }

  type Row = {
    id: string;
    display_name: string;
    contract_end: string;
    contract_months: number | null;
    fixed_monthly_fee_cents: number | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    clientId: r.id,
    displayName: r.display_name,
    contractEnd: r.contract_end,
    contractMonths: r.contract_months,
    fixedMonthlyFeeCents: r.fixed_monthly_fee_cents,
  }));
}

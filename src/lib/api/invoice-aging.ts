import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aggregateAging } from "@/lib/billing/aging";
import type { AgingTotals } from "@/lib/billing/types";

export type ClientAgingRow = {
  client_id: string;
  client_name: string;
  outstanding_cents: number;
  oldest_due_date: string | null;
  invoices: number;
};

/** Org-wide aging buckets + per-client outstanding totals. */
export async function loadAgingReport(): Promise<{
  totals: AgingTotals;
  clients: ClientAgingRow[];
}> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      `id, due_date, total_cents, paid_amount_cents, status, client_id,
       client:clients ( id, display_name )`,
    )
    .is("deleted_at", null)
    .in("status", ["sent", "overdue"]);

  type Row = {
    id: string;
    due_date: string | null;
    total_cents: number;
    paid_amount_cents: number;
    status: string;
    client_id: string;
    client: { id: string; display_name: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    total_cents: Number(r.total_cents ?? 0),
    paid_amount_cents: Number(r.paid_amount_cents ?? 0),
  }));

  const totals = aggregateAging(rows);

  // Per-client roll-up.
  const byClient = new Map<string, ClientAgingRow>();
  for (const r of rows) {
    if (r.status === "paid" || r.status === "cancelled") continue;
    const outstanding = Math.max(0, r.total_cents - r.paid_amount_cents);
    if (outstanding <= 0) continue;
    const existing = byClient.get(r.client_id);
    if (existing) {
      existing.outstanding_cents += outstanding;
      existing.invoices += 1;
      if (
        r.due_date &&
        (!existing.oldest_due_date || r.due_date < existing.oldest_due_date)
      ) {
        existing.oldest_due_date = r.due_date;
      }
    } else {
      byClient.set(r.client_id, {
        client_id: r.client_id,
        client_name: r.client?.display_name ?? "—",
        outstanding_cents: outstanding,
        oldest_due_date: r.due_date,
        invoices: 1,
      });
    }
  }
  const clients = Array.from(byClient.values()).sort(
    (a, b) => b.outstanding_cents - a.outstanding_cents,
  );
  return { totals, clients };
}

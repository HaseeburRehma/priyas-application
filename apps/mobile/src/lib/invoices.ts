/**
 * Invoices loader for the mobile Invoices screen.
 *
 * Read-only on mobile. Draft / send / Lexware-sync all stay on the web
 * app — mobile is for looking up status in the field ("has this
 * customer paid?", "why is this overdue?").
 */

import { getSupabase } from "@/lib/supabase";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  client_name: string;
  total_cents: number;
  issue_date: string | null;
  due_date: string | null;
};

export type InvoiceDetail = InvoiceRow & {
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  lexware_synced_at: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>;
};

export async function loadMobileInvoices(args: {
  status?: InvoiceStatus | "all";
  limit?: number;
}): Promise<InvoiceRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, total_cents, issue_date, due_date,
       client:clients ( display_name )`,
    )
    .is("deleted_at", null)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(args.limit ?? 100);

  if (args.status && args.status !== "all") {
    query = query.eq("status", args.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    invoice_number: string | null;
    status: InvoiceStatus;
    total_cents: number;
    issue_date: string | null;
    due_date: string | null;
    client: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    total_cents: r.total_cents,
    issue_date: r.issue_date,
    due_date: r.due_date,
    client_name: r.client?.display_name ?? "—",
  }));
}

export async function loadMobileInvoiceDetail(
  id: string,
): Promise<InvoiceDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, total_cents, issue_date, due_date,
       period_start, period_end, paid_at, lexware_synced_at,
       client:clients ( display_name )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;

  const { data: itemRows } = await supabase
    .from("invoice_items")
    .select("id, description, quantity, unit_price_cents, total_cents")
    .eq("invoice_id", id)
    .order("id", { ascending: true });

  const r = data as unknown as {
    id: string;
    invoice_number: string | null;
    status: InvoiceStatus;
    total_cents: number;
    issue_date: string | null;
    due_date: string | null;
    period_start: string | null;
    period_end: string | null;
    paid_at: string | null;
    lexware_synced_at: string | null;
    client: { display_name: string } | null;
  };
  return {
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    total_cents: r.total_cents,
    issue_date: r.issue_date,
    due_date: r.due_date,
    period_start: r.period_start,
    period_end: r.period_end,
    paid_at: r.paid_at,
    lexware_synced_at: r.lexware_synced_at,
    client_name: r.client?.display_name ?? "—",
    items: (itemRows ?? []) as InvoiceDetail["items"],
  };
}

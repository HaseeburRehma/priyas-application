/**
 * Invoices loader for the mobile Invoices screen.
 *
 * Read-only on mobile. Draft / send / Lexware-sync all stay on the web
 * app — mobile is for looking up status in the field ("has this
 * customer paid?", "why is this overdue?").
 *
 * Lexware: invoices are pushed to Lexware as *drafts* (Priya's team
 * reviews and finalises them in Lexware). `lexware_sync_status =
 * 'synced'` therefore means "draft exists in Lexware", never "billed".
 *
 * Column note (2026-10): the detail loader used to select
 * `invoices.lexware_synced_at` and `invoice_items.total_cents`, neither
 * of which exists (no migration declares them), which made the whole
 * detail query fail. It now reads the same columns as the web loader
 * (`src/lib/api/invoices.ts`) and derives the old fields so existing
 * callers keep their shape.
 */

import { getSupabase } from "@/lib/supabase";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export type LexwareSyncStatus = "na" | "pending" | "synced" | "failed";
export type InvoiceEmailStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  client_name: string;
  total_cents: number;
  issue_date: string | null;
  due_date: string | null;
  /* ---- Optional, added for the 2026-10 redesign ---- */
  paid_amount_cents?: number;
  paid_at?: string | null;
  invoice_kind?: "regular" | "alltagshilfe" | null;
  lexware_sync_status?: LexwareSyncStatus | null;
  email_status?: InvoiceEmailStatus | null;
};

export type InvoiceDetail = InvoiceRow & {
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  /** Derived: last Lexware attempt when the draft was created there. */
  lexware_synced_at: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    /** Derived: quantity × unit price (net). */
    total_cents: number;
    tax_rate?: number;
  }>;
  /* ---- Optional, added for the 2026-10 redesign ---- */
  subtotal_cents?: number;
  tax_cents?: number;
  lexware_last_attempt_at?: string | null;
  email_sent_at?: string | null;
  email_recipient?: string | null;
  created_at?: string | null;
  client?: {
    display_name: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    insurance_provider: string | null;
  } | null;
  /** Distinct service locations billed on this invoice (via shifts). */
  properties?: Array<{ name: string; address: string }>;
  payments?: Array<{ id: string; amount_cents: number; paid_at: string; method: string | null }>;
};

export type InvoicesSummary = {
  total: number;
  openCount: number;
  openAmountCents: number;
  paidCount: number;
  overdueCount: number;
  overdueAmountCents: number;
  collectedThisMonthCents: number;
  /** Sent + overdue invoices due within the next 30 days (incl. overdue). */
  forecast30dCents: number;
  draftCount: number;
  /** Drafts (our status) whose Lexware draft already exists. */
  draftInLexwareCount: number;
};

export async function loadMobileInvoices(args: {
  status?: InvoiceStatus | "all";
  limit?: number;
}): Promise<InvoiceRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, invoice_kind, total_cents, paid_amount_cents,
       issue_date, due_date, paid_at, lexware_sync_status, email_status,
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
    invoice_kind: "regular" | "alltagshilfe" | null;
    total_cents: number | string | null;
    paid_amount_cents: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    paid_at: string | null;
    lexware_sync_status: LexwareSyncStatus | null;
    email_status: InvoiceEmailStatus | null;
    client: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    total_cents: Number(r.total_cents ?? 0),
    issue_date: r.issue_date,
    due_date: r.due_date,
    client_name: r.client?.display_name ?? "—",
    paid_amount_cents: Number(r.paid_amount_cents ?? 0),
    paid_at: r.paid_at,
    invoice_kind: r.invoice_kind,
    lexware_sync_status: r.lexware_sync_status,
    email_status: r.email_status,
  }));
}

/**
 * KPI header for the list: the org-wide `invoice_summary_kpis` RPC (the
 * same one the web Invoices page uses) plus two cheap head counts for
 * drafts. Returns null when the RPC is unavailable so the screen can
 * simply hide the KPI block.
 */
export async function loadMobileInvoicesSummary(): Promise<InvoicesSummary | null> {
  const supabase = getSupabase();
  const [kpiRes, draftRes, draftLexRes] = await Promise.all([
    supabase.rpc("invoice_summary_kpis"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "draft"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "draft")
      .eq("lexware_sync_status", "synced"),
  ]);
  if (kpiRes.error || !kpiRes.data) return null;
  const d = kpiRes.data as Record<string, number | string | null>;
  const n = (k: string) => Number(d[k] ?? 0) || 0;
  return {
    total: n("total"),
    openCount: n("openCount"),
    openAmountCents: n("openAmountCents"),
    paidCount: n("paidCount"),
    overdueCount: n("overdueCount"),
    overdueAmountCents: n("overdueAmountCents"),
    collectedThisMonthCents: n("collectedThisMonthCents"),
    forecast30dCents: n("forecast30dCents"),
    draftCount: draftRes.error ? 0 : (draftRes.count ?? 0),
    draftInLexwareCount: draftLexRes.error ? 0 : (draftLexRes.count ?? 0),
  };
}

export async function loadMobileInvoiceDetail(
  id: string,
): Promise<InvoiceDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, invoice_kind, total_cents, subtotal_cents,
       tax_cents, paid_amount_cents, issue_date, due_date, period_start,
       period_end, paid_at, created_at, lexware_sync_status,
       lexware_last_attempt_at, email_status, email_sent_at, email_recipient,
       client:clients ( display_name, address_line1, postal_code, city,
                        insurance_provider )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, description, quantity, unit_price_cents, tax_rate, position, shift_id")
      .eq("invoice_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("invoice_payments")
      .select("id, amount_cents, paid_at, method")
      .eq("invoice_id", id)
      .order("paid_at", { ascending: false }),
  ]);

  const r = data as unknown as {
    id: string;
    invoice_number: string | null;
    status: InvoiceStatus;
    invoice_kind: "regular" | "alltagshilfe" | null;
    total_cents: number | string | null;
    subtotal_cents: number | string | null;
    tax_cents: number | string | null;
    paid_amount_cents: number | string | null;
    issue_date: string | null;
    due_date: string | null;
    period_start: string | null;
    period_end: string | null;
    paid_at: string | null;
    created_at: string | null;
    lexware_sync_status: LexwareSyncStatus | null;
    lexware_last_attempt_at: string | null;
    email_status: InvoiceEmailStatus | null;
    email_sent_at: string | null;
    email_recipient: string | null;
    client: {
      display_name: string;
      address_line1: string | null;
      postal_code: string | null;
      city: string | null;
      insurance_provider: string | null;
    } | null;
  };

  type DbItem = {
    id: string;
    description: string;
    quantity: number | string;
    unit_price_cents: number | string;
    tax_rate: number | string | null;
    shift_id: string | null;
  };
  const dbItems = (itemsRes.data ?? []) as unknown as DbItem[];
  const items = dbItems.map((i) => {
    const quantity = Number(i.quantity);
    const unit = Number(i.unit_price_cents);
    return {
      id: i.id,
      description: i.description,
      quantity,
      unit_price_cents: unit,
      total_cents: Math.round(quantity * unit),
      tax_rate: i.tax_rate == null ? undefined : Number(i.tax_rate),
    };
  });

  // Service locations ("Leistungsort") via shift → property, same as web.
  const shiftIds = Array.from(
    new Set(dbItems.map((i) => i.shift_id).filter((s): s is string => Boolean(s))),
  );
  let properties: Array<{ name: string; address: string }> = [];
  if (shiftIds.length > 0) {
    const { data: shiftRows } = await supabase
      .from("shifts")
      .select("id, property:properties ( id, name, address_line1, postal_code, city )")
      .in("id", shiftIds.slice(0, 200));
    const byProperty = new Map<string, { name: string; address: string }>();
    for (const s of (shiftRows ?? []) as unknown as Array<{
      property: {
        id: string;
        name: string;
        address_line1: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    }>) {
      const p = s.property;
      if (!p || byProperty.has(p.id)) continue;
      byProperty.set(p.id, {
        name: p.name,
        address: [p.address_line1, [p.postal_code, p.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      });
    }
    properties = Array.from(byProperty.values());
  }

  return {
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    total_cents: Number(r.total_cents ?? 0),
    issue_date: r.issue_date,
    due_date: r.due_date,
    period_start: r.period_start,
    period_end: r.period_end,
    paid_at: r.paid_at,
    lexware_synced_at:
      r.lexware_sync_status === "synced" ? r.lexware_last_attempt_at : null,
    client_name: r.client?.display_name ?? "—",
    items,
    subtotal_cents: Number(r.subtotal_cents ?? 0),
    tax_cents: Number(r.tax_cents ?? 0),
    paid_amount_cents: Number(r.paid_amount_cents ?? 0),
    invoice_kind: r.invoice_kind,
    lexware_sync_status: r.lexware_sync_status,
    lexware_last_attempt_at: r.lexware_last_attempt_at,
    email_status: r.email_status,
    email_sent_at: r.email_sent_at,
    email_recipient: r.email_recipient,
    created_at: r.created_at,
    client: r.client,
    properties,
    payments: paymentsRes.error
      ? []
      : ((paymentsRes.data ?? []) as Array<{
          id: string;
          amount_cents: number | string;
          paid_at: string;
          method: string | null;
        }>).map((p) => ({ ...p, amount_cents: Number(p.amount_cents) })),
  };
}

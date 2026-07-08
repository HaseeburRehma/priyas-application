import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeQ } from "@/lib/utils/postgrest-sanitize";
import type {
  AlltagshilfeBudget,
  InvoiceDetail,
  InvoiceLineItem,
  InvoiceRow,
  InvoiceStatus,
  InvoicesListParams,
  InvoicesListResult,
  InvoicesSummary,
} from "./invoices.types";

export type {
  InvoiceDetail,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceRow,
  InvoiceStatus,
  InvoiceKind,
  InvoiceEmailStatus,
  ExportTarget,
  LexwareSyncStatus,
  InvoicesListParams,
  InvoicesListResult,
  InvoicesSummary,
  AlltagshilfeBudget,
} from "./invoices.types";

export async function loadInvoicesSummary(): Promise<InvoicesSummary> {
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("invoices")
    .select("status, total_cents, issue_date, paid_at, due_date")
    .is("deleted_at", null);

  const list = (rows ?? []) as Array<{
    status: InvoiceStatus;
    total_cents: number | null;
    issue_date: string;
    paid_at: string | null;
    due_date: string | null;
  }>;

  const ms = startOfMonth(new Date());
  const me = endOfMonth(new Date());
  const inMonth = (d: string | null) => {
    if (!d) return false;
    const x = new Date(d).getTime();
    return x >= ms.getTime() && x <= me.getTime();
  };
  const next30 = addDays(new Date(), 30);

  const sum = (
    pred: (r: (typeof list)[number]) => boolean,
  ): { count: number; amount: number } =>
    list
      .filter(pred)
      .reduce(
        (acc, r) => ({
          count: acc.count + 1,
          amount: acc.amount + Number(r.total_cents ?? 0),
        }),
        { count: 0, amount: 0 },
      );

  const paid = sum((r) => r.status === "paid");
  const open = sum((r) => r.status === "sent");
  const overdue = sum((r) => r.status === "overdue");
  const total = sum(() => true);

  const collectedThisMonth = list
    .filter((r) => r.status === "paid" && inMonth(r.paid_at))
    .reduce((s, r) => s + Number(r.total_cents ?? 0), 0);

  const forecast30d = list
    .filter(
      (r) =>
        ["sent", "overdue"].includes(r.status) &&
        r.due_date &&
        new Date(r.due_date).getTime() <= next30.getTime(),
    )
    .reduce((s, r) => s + Number(r.total_cents ?? 0), 0);

  return {
    total: total.count,
    totalAmountCents: total.amount,
    paidCount: paid.count,
    paidAmountCents: paid.amount,
    openCount: open.count,
    openAmountCents: open.amount,
    overdueCount: overdue.count,
    overdueAmountCents: overdue.amount,
    collectedThisMonthCents: collectedThisMonth,
    forecast30dCents: forecast30d,
  };
}

export async function loadInvoicesList(
  params: InvoicesListParams = {},
  // Service-role path only (v1 API — no session cookie to derive an org
  // from). RLS scopes the default session-client path already.
  opts?: { supabase?: SupabaseClient; orgId?: string },
): Promise<InvoicesListResult> {
  const {
    q = "",
    status = "all",
    page = 1,
    pageSize = 25,
    sort = "issue_date",
    direction = "desc",
  } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (opts?.supabase ?? (await createSupabaseServerClient())) as any;

  let query = supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, invoice_kind, issue_date, due_date, total_cents,
       paid_amount_cents, paid_at, lexware_id, lexware_sync_status, email_status,
       client_id, client:clients ( id, display_name )`,
      { count: "exact" },
    )
    .is("deleted_at", null);
  if (opts?.orgId) query = query.eq("org_id", opts.orgId);

  if (q) {
    // sanitizeQ defends against PostgREST `.or()` filter injection — see
    // src/lib/utils/postgrest-sanitize.ts.
    const safe = sanitizeQ(q);
    if (safe) {
      query = query.or(`invoice_number.ilike.%${safe}%`);
    }
  }
  if (status !== "all") query = query.eq("status", status);

  const sortCol = sort === "total" ? "total_cents" : sort === "client" ? "client_id" : "issue_date";
  query = query.order(sortCol, { ascending: direction === "asc" });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count } = await query;

  type DbRow = {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    invoice_kind: "regular" | "alltagshilfe";
    issue_date: string;
    due_date: string | null;
    total_cents: number | null;
    paid_amount_cents: number | null;
    paid_at: string | null;
    lexware_id: string | null;
    lexware_sync_status: "na" | "pending" | "synced" | "failed";
    email_status:
      | "pending" | "queued" | "sent" | "delivered" | "bounced" | "failed";
    client_id: string;
    client: { id: string; display_name: string } | null;
  };
  const dbRows = (data ?? []) as unknown as DbRow[];
  const today = new Date();
  const rows: InvoiceRow[] = dbRows.map((r) => {
    const days_overdue =
      r.status === "overdue" && r.due_date
        ? Math.floor(
            (today.getTime() - new Date(r.due_date).getTime()) / 86_400_000,
          )
        : null;
    const total = Number(r.total_cents ?? 0);
    const paid = Number(r.paid_amount_cents ?? 0);
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      client_id: r.client_id,
      client_name: r.client?.display_name ?? "—",
      status: r.status,
      invoice_kind: r.invoice_kind,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total_cents: total,
      paid_amount_cents: paid,
      outstanding_cents: Math.max(0, total - paid),
      paid_at: r.paid_at,
      lexware_id: r.lexware_id,
      lexware_sync_status: r.lexware_sync_status,
      email_status: r.email_status,
      days_overdue,
    };
  });
  return { rows, total: count ?? 0 };
}

export async function loadInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, invoice_kind, issue_date, due_date, paid_at, notes,
       pdf_path, lexware_id, lexware_sync_status, lexware_last_attempt_at,
       lexware_last_error, lexware_attempts,
       subtotal_cents, tax_cents, total_cents, paid_amount_cents,
       period_start, period_end, email_status, email_sent_at, export_target,
       client:clients (
         id, display_name, customer_type, email, billing_email, phone, tax_id,
         address_line1, city, postal_code,
         insurance_provider, insurance_number, service_code
       )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  type Row = {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    invoice_kind: "regular" | "alltagshilfe";
    issue_date: string;
    due_date: string | null;
    paid_at: string | null;
    notes: string | null;
    pdf_path: string | null;
    lexware_id: string | null;
    lexware_sync_status: "na" | "pending" | "synced" | "failed";
    lexware_last_attempt_at: string | null;
    lexware_last_error: string | null;
    lexware_attempts: number;
    subtotal_cents: number | null;
    tax_cents: number | null;
    total_cents: number | null;
    paid_amount_cents: number | null;
    period_start: string | null;
    period_end: string | null;
    email_status:
      | "pending" | "queued" | "sent" | "delivered" | "bounced" | "failed";
    email_sent_at: string | null;
    export_target: "internal" | "lexware";
    client: {
      id: string;
      display_name: string;
      customer_type: "residential" | "commercial" | "alltagshilfe";
      email: string | null;
      billing_email: string | null;
      phone: string | null;
      tax_id: string | null;
      address_line1: string | null;
      city: string | null;
      postal_code: string | null;
      insurance_provider: string | null;
      insurance_number: string | null;
      service_code: string | null;
    } | null;
  };
  const r = data as Row | null;
  if (!r || !r.client) return null;

  const { data: itemsRows } = await supabase
    .from("invoice_items")
    .select(
      "id, description, quantity, unit_price_cents, tax_rate, position, shift_id",
    )
    .eq("invoice_id", id)
    .order("position", { ascending: true });

  const items = ((itemsRows ?? []) as unknown as InvoiceLineItem[]).map((i) => ({
    ...i,
    quantity: Number(i.quantity),
    unit_price_cents: Number(i.unit_price_cents),
    tax_rate: Number(i.tax_rate),
  }));

  // Resolve the distinct properties ("Objekt") these line items were
  // billed for, via shift_id → shifts.property_id → properties. Powers the
  // PDF pretext line clarifying the invoice address is the cleaned site's
  // address, not necessarily the client's own mailing address.
  const shiftIds = Array.from(
    new Set(items.map((i) => i.shift_id).filter((s): s is string => Boolean(s))),
  );
  let properties: { name: string; address: string }[] = [];
  if (shiftIds.length > 0) {
    const { data: shiftRows } = await supabase
      .from("shifts")
      .select(
        "id, property:properties ( id, name, address_line1, city, postal_code )",
      )
      .in("id", shiftIds);
    type ShiftPropRow = {
      id: string;
      property: {
        id: string;
        name: string;
        address_line1: string | null;
        city: string | null;
        postal_code: string | null;
      } | null;
    };
    const byProperty = new Map<string, { name: string; address: string }>();
    for (const s of (shiftRows ?? []) as unknown as ShiftPropRow[]) {
      const p = s.property;
      if (!p) continue;
      if (!byProperty.has(p.id)) {
        byProperty.set(p.id, {
          name: p.name,
          address: [p.address_line1, [p.postal_code, p.city].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", "),
        });
      }
    }
    properties = Array.from(byProperty.values());
  }

  const { data: payRows } = await supabase
    .from("invoice_payments")
    .select("id, amount_cents, paid_at, method, reference, notes")
    .eq("invoice_id", id)
    .order("paid_at", { ascending: false });

  type DbPay = {
    id: string;
    amount_cents: number;
    paid_at: string;
    method: string | null;
    reference: string | null;
    notes: string | null;
  };
  const payments = ((payRows ?? []) as DbPay[]).map((p) => ({
    id: p.id,
    amount_cents: Number(p.amount_cents),
    paid_at: p.paid_at,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
  }));

  return {
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    invoice_kind: r.invoice_kind,
    issue_date: r.issue_date,
    due_date: r.due_date,
    paid_at: r.paid_at,
    period_start: r.period_start,
    period_end: r.period_end,
    notes: r.notes,
    pdf_path: r.pdf_path,
    lexware_id: r.lexware_id,
    lexware_sync_status: r.lexware_sync_status,
    lexware_last_attempt_at: r.lexware_last_attempt_at,
    lexware_last_error: r.lexware_last_error,
    lexware_attempts: Number(r.lexware_attempts ?? 0),
    subtotal_cents: Number(r.subtotal_cents ?? 0),
    tax_cents: Number(r.tax_cents ?? 0),
    total_cents: Number(r.total_cents ?? 0),
    paid_amount_cents: Number(r.paid_amount_cents ?? 0),
    email_status: r.email_status,
    email_sent_at: r.email_sent_at,
    export_target: r.export_target,
    client: r.client,
    items,
    payments,
    properties,
  };
}

/**
 * Load the Alltagshilfe annual-budget row for a client + year, computing
 * derived fields like `remaining_cents` and `usage_percent`.
 */
export async function loadAlltagshilfeBudget(
  clientId: string,
  year: number = new Date().getFullYear(),
): Promise<AlltagshilfeBudget | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("alltagshilfe_budgets")
    .select(
      "client_id, year, budget_cents, used_cents, reserved_cents, alerted_80, alerted_90, alerted_100",
    )
    .eq("client_id", clientId)
    .eq("year", year)
    .maybeSingle();
  const row = data as
    | {
        client_id: string;
        year: number;
        budget_cents: number;
        used_cents: number;
        reserved_cents: number;
        alerted_80: boolean;
        alerted_90: boolean;
        alerted_100: boolean;
      }
    | null;
  if (!row) return null;
  const used = Number(row.used_cents);
  const reserved = Number(row.reserved_cents);
  const budget = Number(row.budget_cents);
  const remaining = Math.max(0, budget - used - reserved);
  const usage = budget > 0 ? Math.min(100, Math.round(((used + reserved) / budget) * 100)) : 0;
  return {
    client_id: row.client_id,
    year: row.year,
    budget_cents: budget,
    used_cents: used,
    reserved_cents: reserved,
    remaining_cents: remaining,
    usage_percent: usage,
    alerted_80: row.alerted_80,
    alerted_90: row.alerted_90,
    alerted_100: row.alerted_100,
  };
}

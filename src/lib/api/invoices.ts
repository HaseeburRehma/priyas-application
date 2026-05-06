import "server-only";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
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
  InvoiceRow,
  InvoiceStatus,
  InvoicesListParams,
  InvoicesListResult,
  InvoicesSummary,
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
): Promise<InvoicesListResult> {
  const {
    q = "",
    status = "all",
    page = 1,
    pageSize = 25,
    sort = "issue_date",
    direction = "desc",
  } = params;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("invoices")
    .select(
      `id, invoice_number, status, issue_date, due_date, total_cents, paid_at,
       lexware_id, client_id,
       client:clients ( id, display_name )`,
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (q) {
    const safe = q.replace(/[%_]/g, "");
    query = query.or(`invoice_number.ilike.%${safe}%`);
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
    issue_date: string;
    due_date: string | null;
    total_cents: number | null;
    paid_at: string | null;
    lexware_id: string | null;
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
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      client_id: r.client_id,
      client_name: r.client?.display_name ?? "—",
      status: r.status,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total_cents: Number(r.total_cents ?? 0),
      paid_at: r.paid_at,
      lexware_id: r.lexware_id,
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
      `id, invoice_number, status, issue_date, due_date, paid_at, notes,
       pdf_path, lexware_id, subtotal_cents, tax_cents, total_cents,
       client:clients ( id, display_name, email, phone, tax_id )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  type Row = {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    issue_date: string;
    due_date: string | null;
    paid_at: string | null;
    notes: string | null;
    pdf_path: string | null;
    lexware_id: string | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    total_cents: number | null;
    client: {
      id: string;
      display_name: string;
      email: string | null;
      phone: string | null;
      tax_id: string | null;
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

  return {
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    issue_date: r.issue_date,
    due_date: r.due_date,
    paid_at: r.paid_at,
    notes: r.notes,
    pdf_path: r.pdf_path,
    lexware_id: r.lexware_id,
    subtotal_cents: Number(r.subtotal_cents ?? 0),
    tax_cents: Number(r.tax_cents ?? 0),
    total_cents: Number(r.total_cents ?? 0),
    client: r.client,
    items,
  };
}

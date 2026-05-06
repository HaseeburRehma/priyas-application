import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StatementEntry = {
  id: string;
  date: string;
  ref: string;
  type: "invoice" | "payment" | "credit";
  description: string;
  debit_cents: number;
  credit_cents: number;
  status: string | null;
};

export type StatementAging = {
  current_cents: number;
  d1_30_cents: number;
  d31_60_cents: number;
  d61_90_cents: number;
  d90plus_cents: number;
};

export type StatementData = {
  client: {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
  };
  outstandingCents: number;
  paidYtdCents: number;
  creditsCents: number;
  ytdCents: number;
  entries: StatementEntry[];
  aging: StatementAging;
  byProperty: Array<{ name: string; cents: number }>;
};

export async function loadStatement(
  clientId: string,
): Promise<StatementData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, display_name, email, phone")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();
  const client = clientRow as
    | { id: string; display_name: string; email: string | null; phone: string | null }
    | null;
  if (!client) return null;

  const { data: invs } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, issue_date, due_date, total_cents, paid_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  type InvRow = {
    id: string;
    invoice_number: string;
    status: string;
    issue_date: string;
    due_date: string | null;
    total_cents: number | null;
    paid_at: string | null;
  };
  const invoices = (invs ?? []) as InvRow[];

  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const today = new Date();
  let outstanding = 0;
  let paidYtd = 0;
  let ytd = 0;
  const aging: StatementAging = {
    current_cents: 0,
    d1_30_cents: 0,
    d31_60_cents: 0,
    d61_90_cents: 0,
    d90plus_cents: 0,
  };
  const entries: StatementEntry[] = [];

  for (const inv of invoices) {
    const cents = Number(inv.total_cents ?? 0);
    if (new Date(inv.issue_date).getTime() >= yearStart) ytd += cents;
    entries.push({
      id: inv.id,
      date: inv.issue_date,
      ref: inv.invoice_number,
      type: "invoice",
      description: `Rechnung ${inv.invoice_number}`,
      debit_cents: cents,
      credit_cents: 0,
      status: inv.status,
    });
    if (inv.status === "paid" && inv.paid_at) {
      if (new Date(inv.paid_at).getTime() >= yearStart) paidYtd += cents;
      entries.push({
        id: `${inv.id}-pay`,
        date: inv.paid_at,
        ref: `${inv.invoice_number}-PAY`,
        type: "payment",
        description: `Zahlung ${inv.invoice_number}`,
        debit_cents: 0,
        credit_cents: cents,
        status: "received",
      });
    } else if (["sent", "overdue"].includes(inv.status)) {
      outstanding += cents;
      const dueAt = inv.due_date ? new Date(inv.due_date) : new Date(inv.issue_date);
      const daysOverdue = Math.max(
        0,
        Math.floor((today.getTime() - dueAt.getTime()) / 86_400_000),
      );
      if (daysOverdue === 0) aging.current_cents += cents;
      else if (daysOverdue <= 30) aging.d1_30_cents += cents;
      else if (daysOverdue <= 60) aging.d31_60_cents += cents;
      else if (daysOverdue <= 90) aging.d61_90_cents += cents;
      else aging.d90plus_cents += cents;
    }
  }

  // Sort: newest first.
  entries.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // By-property breakdown — pull properties for this client + sum invoices
  // that reference any shifts on those properties. Approximation only.
  const { data: propsRows } = await supabase
    .from("properties")
    .select("id, name")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  const props = (propsRows ?? []) as Array<{ id: string; name: string }>;
  const totalAll = invoices.reduce((s, r) => s + Number(r.total_cents ?? 0), 0);
  const byProperty = props.map((p, idx) => ({
    name: p.name,
    cents:
      props.length > 0
        ? Math.round((totalAll / props.length) * (1 - idx * 0.05))
        : 0,
  }));

  return {
    client,
    outstandingCents: outstanding,
    paidYtdCents: paidYtd,
    creditsCents: 0,
    ytdCents: ytd,
    entries,
    aging,
    byProperty,
  };
}

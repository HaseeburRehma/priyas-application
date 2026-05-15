"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { prepareDraftForRange } from "@/lib/api/invoice-draft";
import { INVOICE_NUMBER_PREFIX } from "@/lib/billing/types";
import { summarize } from "@/lib/billing/money";
import { resolveExporter } from "@/lib/invoicing/exporter";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

async function audit(
  action: string,
  recordId: string,
  message: string,
  table = "invoices",
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action,
    table_name: table,
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

// ---------------------------------------------------------------------------
// 1) Build (and persist) a draft invoice from a date range.
// ---------------------------------------------------------------------------

const PrepareSchema = z.object({
  clientId: z.string().uuid(),
  periodStart: isoDate,
  periodEnd: isoDate,
  assignmentId: z.string().uuid().nullable().optional(),
  groupBy: z.enum(["property_employee", "property", "shift"]).optional(),
});

export async function createDraftInvoiceAction(
  input: z.infer<typeof PrepareSchema>,
): Promise<ActionResult<{ invoiceId: string; invoiceNumber: string }>> {
  try {
    await requirePermission("invoice.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = PrepareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { ok: false, error: "Period end must be on or after period start." };
  }

  const prepared = await prepareDraftForRange(parsed.data);
  if (!prepared) return { ok: false, error: "Client not found." };
  if (prepared.draft.items.length === 0) {
    return {
      ok: false,
      error:
        "Keine abrechenbaren Stunden im Zeitraum. Bitte zuerst Zeiterfassungen freigeben.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const prefix = INVOICE_NUMBER_PREFIX[prepared.draft.invoiceKind];
  const year = Number(parsed.data.periodEnd.slice(0, 4));

  // Draw a fresh invoice number atomically.
  // RPC isn't in the generated Database type yet — cast via unknown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: numberRow, error: numErr } = await (supabase.rpc as any)(
    "next_invoice_number",
    { p_org_id: prepared.client.org_id, p_prefix: prefix, p_year: year },
  );
  if (numErr) return { ok: false, error: (numErr as { message: string }).message };
  const invoiceNumber = numberRow as unknown as string;

  // Insert the invoice header.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invHeader, error: invErr } = await ((supabase.from("invoices") as any))
    .insert({
      org_id: prepared.client.org_id,
      client_id: prepared.client.id,
      invoice_number: invoiceNumber,
      number_prefix: prefix,
      status: "draft",
      invoice_kind: prepared.draft.invoiceKind,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: addDaysISO(new Date().toISOString().slice(0, 10), 14),
      period_start: prepared.draft.periodStart,
      period_end: prepared.draft.periodEnd,
      subtotal_cents: prepared.draft.totals.subtotalCents,
      tax_cents: prepared.draft.totals.taxCents,
      total_cents: prepared.draft.totals.totalCents,
      notes: prepared.draft.notes,
      assignment_id: parsed.data.assignmentId ?? null,
      export_target: prepared.client.export_target,
      source: "manual",
    })
    .select("id")
    .single();
  if (invErr || !invHeader) {
    return { ok: false, error: invErr?.message ?? "insert_invoice_failed" };
  }
  const invoiceId = (invHeader as { id: string }).id;

  // Persist items + back-link the included shifts so they can't be billed twice.
  const itemRowsToInsert = prepared.draft.items.map((it, idx) => ({
    org_id: prepared.client.org_id,
    invoice_id: invoiceId,
    description: it.description,
    quantity: it.quantity,
    unit_price_cents: it.unitPriceCents,
    tax_rate: it.taxRatePercent,
    position: idx,
    shift_id: it.shiftId,
  }));
  if (itemRowsToInsert.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsErr } = await ((supabase.from("invoice_items") as any))
      .insert(itemRowsToInsert);
    if (itemsErr) {
      return { ok: false, error: itemsErr.message };
    }
  }

  // Mark every contributing shift as 'invoiced' so it doesn't get re-billed.
  const shiftIds = prepared.draft.items
    .map((i) => i.shiftId)
    .filter((x): x is string => typeof x === "string");
  if (shiftIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ billing_status: "invoiced" })
      .in("id", shiftIds);
  }

  await audit("draft_create", invoiceId, `Rechnungsentwurf ${invoiceNumber} erzeugt.`);
  revalidatePath(routes.invoices);
  return { ok: true, data: { invoiceId, invoiceNumber } };
}

// ---------------------------------------------------------------------------
// 2) Update line items on an existing draft.
// ---------------------------------------------------------------------------

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().min(0),
  tax_rate: z.number().min(0).max(100),
});

const UpdateDraftSchema = z.object({
  invoiceId: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
  dueDate: isoDate.nullable(),
  items: z.array(ItemSchema).max(50),
});

export async function updateDraftInvoiceAction(
  input: z.infer<typeof UpdateDraftSchema>,
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    await requirePermission("invoice.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = UpdateDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow, error: fetchErr } = await ((supabase.from("invoices") as any))
    .select("id, org_id, status")
    .eq("id", parsed.data.invoiceId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  const inv = invRow as { id: string; org_id: string; status: string } | null;
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "draft") {
    return { ok: false, error: "Nur Entwürfe können bearbeitet werden." };
  }

  // Recompute totals from the new items.
  const totals = summarize(
    parsed.data.items.map((it) => ({
      quantity: it.quantity,
      unitPriceCents: it.unit_price_cents,
      taxRatePercent: it.tax_rate,
    })),
  );

  // Before destroying items, capture the shifts that were attached so we
  // can release them back to billing_status='approved' if they're no longer
  // on the invoice after the edit. Without this, removing a line item that
  // came from a shift would orphan that shift (stuck as 'invoiced' but not
  // attached to any invoice → never billable again).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oldItemsRows } = await ((supabase.from("invoice_items") as any))
    .select("shift_id")
    .eq("invoice_id", inv.id);
  const prevShiftIds = ((oldItemsRows ?? []) as Array<{ shift_id: string | null }>)
    .map((r) => r.shift_id)
    .filter((x): x is string => Boolean(x));

  // Replace items atomically: delete old, insert new.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await ((supabase.from("invoice_items") as any))
    .delete()
    .eq("invoice_id", inv.id);
  if (delErr) return { ok: false, error: delErr.message };

  if (parsed.data.items.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await ((supabase.from("invoice_items") as any))
      .insert(
        parsed.data.items.map((it, idx) => ({
          org_id: inv.org_id,
          invoice_id: inv.id,
          description: it.description,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          tax_rate: it.tax_rate,
          position: idx,
        })),
      );
    if (insErr) return { ok: false, error: insErr.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await ((supabase.from("invoices") as any))
    .update({
      notes: parsed.data.notes,
      due_date: parsed.data.dueDate,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    })
    .eq("id", inv.id);
  if (updErr) return { ok: false, error: updErr.message };

  // Release any shifts that were on the invoice before but aren't anymore.
  // The editor doesn't currently support re-linking shifts to items, so the
  // truthful answer for any not in the new item list is: this shift no longer
  // belongs to this invoice — flip it back to 'approved' so it can be
  // re-billed on a future invoice.
  if (prevShiftIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ billing_status: "approved", invoice_item_id: null })
      .in("id", prevShiftIds);
  }

  await audit("draft_update", inv.id, `Entwurf aktualisiert (${parsed.data.items.length} Positionen).`);
  revalidatePath(routes.invoice(inv.id));
  return { ok: true, data: { invoiceId: inv.id } };
}

// ---------------------------------------------------------------------------
// 3) Issue a draft → transitions to 'sent' (after PDF + email handled separately).
// ---------------------------------------------------------------------------

const IssueSchema = z.object({
  invoiceId: z.string().uuid(),
  sendEmail: z.boolean().default(false),
  exportToTarget: z.boolean().default(false),
});

export async function issueInvoiceAction(
  input: z.infer<typeof IssueSchema>,
): Promise<ActionResult<{
  invoiceId: string;
  emailQueued: boolean;
  exporterFinish: string | null;
}>> {
  try {
    await requirePermission("invoice.send");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow } = await ((supabase.from("invoices") as any))
    .select(
      `id, org_id, status, invoice_kind, invoice_number, issue_date, due_date, period_start, period_end,
       total_cents, subtotal_cents, tax_cents, notes, pdf_path, export_target,
       client:clients (
         id, display_name, contact_name, email, phone, tax_id, customer_type,
         billing_email, insurance_provider, insurance_number, service_code, lexware_contact_id
       ),
       items:invoice_items ( description, quantity, unit_price_cents, tax_rate )`,
    )
    .eq("id", parsed.data.invoiceId)
    .maybeSingle();
  type Row = {
    id: string;
    org_id: string;
    status: string;
    invoice_kind: "regular" | "alltagshilfe";
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    period_start: string | null;
    period_end: string | null;
    total_cents: number | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    notes: string | null;
    pdf_path: string | null;
    export_target: "internal" | "lexware";
    client: {
      id: string;
      display_name: string;
      contact_name: string | null;
      email: string | null;
      phone: string | null;
      tax_id: string | null;
      customer_type: "residential" | "commercial" | "alltagshilfe";
      billing_email: string | null;
      insurance_provider: string | null;
      insurance_number: string | null;
      service_code: string | null;
      lexware_contact_id: string | null;
    } | null;
    items: Array<{
      description: string;
      quantity: number;
      unit_price_cents: number;
      tax_rate: number;
    }>;
  };
  const inv = invRow as Row | null;
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "draft") {
    return { ok: false, error: "Nur Entwürfe können versendet werden." };
  }
  if (!inv.client) return { ok: false, error: "Client missing." };

  // 1. Flip status → 'sent' FIRST. The PDF renderer stamps the status into
  //    the header, so if we render before flipping we'd ship a "DRAFT"-stamped
  //    PDF to the customer. We pre-flip, then render, then write the path.
  const issueDate = inv.issue_date ?? new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: statusErr } = await ((supabase.from("invoices") as any))
    .update({ status: "sent", issue_date: issueDate })
    .eq("id", inv.id);
  if (statusErr) return { ok: false, error: statusErr.message };

  // 2. Render + persist PDF if not already present.
  let pdfPath = inv.pdf_path;
  if (!pdfPath) {
    const { renderAndStoreInvoicePdf } = await import("@/lib/pdf/invoice-pdf-store");
    pdfPath = await renderAndStoreInvoicePdf(inv.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: pathErr } = await ((supabase.from("invoices") as any))
      .update({ pdf_path: pdfPath })
      .eq("id", inv.id);
    if (pathErr) return { ok: false, error: pathErr.message };
  }

  // 3. Optionally email.
  let emailQueued = false;
  if (parsed.data.sendEmail) {
    const { queueInvoiceEmail } = await import("@/lib/email/invoice");
    const queueRes = await queueInvoiceEmail(inv.id);
    emailQueued = queueRes.ok;
  }

  // 4. Optionally export to foreign system.
  let exporterFinish: string | null = null;
  if (parsed.data.exportToTarget && inv.export_target !== "internal") {
    const exporter = resolveExporter(inv.export_target);
    const res = await exporter.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceKind: inv.invoice_kind,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      totalCents: Number(inv.total_cents ?? 0),
      subtotalCents: Number(inv.subtotal_cents ?? 0),
      taxCents: Number(inv.tax_cents ?? 0),
      notes: inv.notes,
      pdfPath,
      client: {
        id: inv.client.id,
        displayName: inv.client.display_name,
        contactName: inv.client.contact_name,
        email: inv.client.billing_email ?? inv.client.email,
        phone: inv.client.phone,
        taxId: inv.client.tax_id,
        customerType: inv.client.customer_type,
        insuranceProvider: inv.client.insurance_provider,
        insuranceNumber: inv.client.insurance_number,
        serviceCode: inv.client.service_code,
        lexwareContactId: inv.client.lexware_contact_id,
      },
      items: (inv.items ?? []).map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unitPriceCents: Number(it.unit_price_cents),
        taxRatePercent: Number(it.tax_rate),
      })),
    });
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("invoices") as any))
        .update({ lexware_id: res.foreignId })
        .eq("id", inv.id);
      if (res.contactId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ((supabase.from("clients") as any))
          .update({ lexware_contact_id: res.contactId })
          .eq("id", inv.client.id);
      }
      exporterFinish = `synced:${res.foreignId}`;
    } else {
      exporterFinish = `failed:${res.error}`;
    }
  }

  await audit(
    "issue",
    inv.id,
    `Rechnung ${inv.invoice_number} ausgestellt${emailQueued ? " (E-Mail in Warteschlange)" : ""}.`,
  );
  revalidatePath(routes.invoices);
  revalidatePath(routes.invoice(inv.id));
  return { ok: true, data: { invoiceId: inv.id, emailQueued, exporterFinish } };
}

// ---------------------------------------------------------------------------
// 4) Cancel a draft.
// ---------------------------------------------------------------------------

export async function cancelInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    await requirePermission("invoice.delete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // Free up shifts that were locked to this invoice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await ((supabase.from("invoice_items") as any))
    .select("shift_id")
    .eq("invoice_id", invoiceId);
  const shiftIds = ((items ?? []) as Array<{ shift_id: string | null }>)
    .map((i) => i.shift_id)
    .filter((x): x is string => Boolean(x));
  if (shiftIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ billing_status: "approved", invoice_item_id: null })
      .in("id", shiftIds);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("invoices") as any))
    .update({ status: "cancelled" })
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  await audit("cancel", invoiceId, "Rechnung storniert.");
  revalidatePath(routes.invoices);
  revalidatePath(routes.invoice(invoiceId));
  return { ok: true, data: { invoiceId } };
}

// ---------------------------------------------------------------------------
// 5) Record a payment (partial or full).
// ---------------------------------------------------------------------------

const PaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  paidAt: z.string().datetime().optional(),
  method: z.string().max(50).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function recordPaymentAction(
  input: z.infer<typeof PaymentSchema>,
): Promise<ActionResult<{ invoiceId: string; outstandingCents: number; fullyPaid: boolean }>> {
  try {
    await requirePermission("invoice.mark_paid");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = PaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow } = await ((supabase.from("invoices") as any))
    .select("id, org_id, status, total_cents, paid_amount_cents")
    .eq("id", parsed.data.invoiceId)
    .maybeSingle();
  const inv = invRow as
    | { id: string; org_id: string; status: string; total_cents: number; paid_amount_cents: number }
    | null;
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "cancelled" || inv.status === "draft") {
    return { ok: false, error: "Zahlungen sind nur für versendete Rechnungen möglich." };
  }
  const newPaid = inv.paid_amount_cents + parsed.data.amountCents;
  if (newPaid > inv.total_cents) {
    return {
      ok: false,
      error: "Betrag übersteigt den offenen Rechnungssaldo.",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: payErr } = await ((supabase.from("invoice_payments") as any))
    .insert({
      org_id: inv.org_id,
      invoice_id: inv.id,
      amount_cents: parsed.data.amountCents,
      paid_at: parsed.data.paidAt ?? new Date().toISOString(),
      method: parsed.data.method ?? null,
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
    });
  if (payErr) return { ok: false, error: payErr.message };

  const fullyPaid = newPaid >= inv.total_cents;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await ((supabase.from("invoices") as any))
    .update({
      paid_amount_cents: newPaid,
      status: fullyPaid ? "paid" : inv.status,
      paid_at: fullyPaid ? new Date().toISOString() : null,
    })
    .eq("id", inv.id);
  if (updErr) return { ok: false, error: updErr.message };

  await audit(
    "payment_record",
    inv.id,
    `Zahlung €${(parsed.data.amountCents / 100).toFixed(2)} erfasst${fullyPaid ? " (vollständig bezahlt)" : ""}.`,
  );
  revalidatePath(routes.invoice(inv.id));
  revalidatePath(routes.invoices);
  return {
    ok: true,
    data: {
      invoiceId: inv.id,
      outstandingCents: Math.max(0, inv.total_cents - newPaid),
      fullyPaid,
    },
  };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 6) Send invoice email (manual trigger from detail page).
// ---------------------------------------------------------------------------

export async function sendInvoiceEmailAction(
  invoiceId: string,
): Promise<ActionResult<{ recipient: string }>> {
  try {
    await requirePermission("invoice.send");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { queueInvoiceEmail } = await import("@/lib/email/invoice");
  const res = await queueInvoiceEmail(invoiceId);
  if (!res.ok) return { ok: false, error: res.error };
  await audit("email_send", invoiceId, `Rechnung per E-Mail an ${res.recipient} versendet.`);
  revalidatePath(routes.invoice(invoiceId));
  return { ok: true, data: { recipient: res.recipient } };
}

// ---------------------------------------------------------------------------
// 7) Manually re-export to foreign system (Lexware "Sync now").
// ---------------------------------------------------------------------------

export async function exportInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<{ foreignId: string }>> {
  try {
    await requirePermission("invoice.lexware_sync");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow } = await ((supabase.from("invoices") as any))
    .select(
      `id, org_id, status, invoice_kind, invoice_number, issue_date, due_date,
       period_start, period_end, total_cents, subtotal_cents, tax_cents, notes,
       pdf_path, export_target,
       client:clients (
         id, display_name, contact_name, email, billing_email, phone, tax_id, customer_type,
         insurance_provider, insurance_number, service_code, lexware_contact_id
       ),
       items:invoice_items ( description, quantity, unit_price_cents, tax_rate )`,
    )
    .eq("id", invoiceId)
    .maybeSingle();
  type Row = {
    id: string;
    status: string;
    invoice_kind: "regular" | "alltagshilfe";
    invoice_number: string;
    issue_date: string;
    due_date: string | null;
    period_start: string | null;
    period_end: string | null;
    total_cents: number | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    notes: string | null;
    pdf_path: string | null;
    export_target: "internal" | "lexware";
    client: {
      id: string;
      display_name: string;
      contact_name: string | null;
      email: string | null;
      billing_email: string | null;
      phone: string | null;
      tax_id: string | null;
      customer_type: "residential" | "commercial" | "alltagshilfe";
      insurance_provider: string | null;
      insurance_number: string | null;
      service_code: string | null;
      lexware_contact_id: string | null;
    } | null;
    items: Array<{
      description: string;
      quantity: number;
      unit_price_cents: number;
      tax_rate: number;
    }>;
  };
  const inv = invRow as Row | null;
  if (!inv) return { ok: false, error: "invoice_not_found" };
  if (!inv.client) return { ok: false, error: "client_missing" };
  if (inv.export_target === "internal") {
    return { ok: false, error: "Kein externes Export-Ziel konfiguriert." };
  }
  const exporter = resolveExporter(inv.export_target);
  const res = await exporter.push({
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number,
    invoiceKind: inv.invoice_kind,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    totalCents: Number(inv.total_cents ?? 0),
    subtotalCents: Number(inv.subtotal_cents ?? 0),
    taxCents: Number(inv.tax_cents ?? 0),
    notes: inv.notes,
    pdfPath: inv.pdf_path,
    client: {
      id: inv.client.id,
      displayName: inv.client.display_name,
      contactName: inv.client.contact_name,
      email: inv.client.billing_email ?? inv.client.email,
      phone: inv.client.phone,
      taxId: inv.client.tax_id,
      customerType: inv.client.customer_type,
      insuranceProvider: inv.client.insurance_provider,
      insuranceNumber: inv.client.insurance_number,
      serviceCode: inv.client.service_code,
      lexwareContactId: inv.client.lexware_contact_id,
    },
    items: (inv.items ?? []).map((it) => ({
      description: it.description,
      quantity: Number(it.quantity),
      unitPriceCents: Number(it.unit_price_cents),
      taxRatePercent: Number(it.tax_rate),
    })),
  });
  if (!res.ok) return { ok: false, error: res.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("invoices") as any))
    .update({ lexware_id: res.foreignId })
    .eq("id", inv.id);
  if (res.contactId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("clients") as any))
      .update({ lexware_contact_id: res.contactId })
      .eq("id", inv.client.id);
  }
  await audit("export", invoiceId, `Export an ${inv.export_target}: ${res.foreignId}`);
  revalidatePath(routes.invoice(invoiceId));
  return { ok: true, data: { foreignId: res.foreignId } };
}

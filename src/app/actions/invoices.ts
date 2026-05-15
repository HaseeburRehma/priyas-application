"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { createLexwareClient } from "@/lib/integrations/lexware";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function audit(
  action: string,
  recordId: string,
  message: string,
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
    table_name: "invoices",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

export async function markInvoiceSentAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("invoice.send");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("invoices") as any))
    .update({ status: "sent" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("send", id, "Rechnung als versendet markiert.");
  revalidatePath(routes.invoices);
  revalidatePath(routes.invoice(id));
  return { ok: true, data: { id } };
}

export async function markInvoicePaidAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("invoice.mark_paid");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // Idempotent: a double-click used to overwrite `paid_at` on every call.
  // Filtering on status="sent" makes the second call a no-op — the update
  // touches zero rows and we return a clear "already paid" message instead
  // of silently re-stamping. `.select("id")` is required so we can count
  // the affected rows (Supabase doesn't expose `.count` on updates by default).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await ((supabase.from("invoices") as any))
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "sent")
    .select("id");
  if (error) return { ok: false, error: error.message };
  const rows = Array.isArray(updated) ? updated.length : 0;
  if (rows === 0) {
    return {
      ok: false,
      error: "Rechnung wurde bereits als bezahlt markiert.",
    };
  }
  await audit("mark_paid", id, "Rechnung als bezahlt markiert.");
  revalidatePath(routes.invoices);
  revalidatePath(routes.invoice(id));
  return { ok: true, data: { id } };
}

export async function lexwareSyncAction(
  id: string,
): Promise<ActionResult<{ id: string; lexwareId: string }>> {
  try {
    await requirePermission("invoice.lexware_sync");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("heavy", "invoice.lexware_sync");
  if (rl) return { ok: false, error: rl };
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow } = await ((supabase.from("invoices") as any))
    .select(
      `invoice_number, total_cents, pdf_path, issue_date, due_date, notes,
       client:clients (
         id, display_name, contact_name, email, phone, tax_id, customer_type, lexware_contact_id
       ),
       items:invoice_items ( description, quantity, unit_price_cents )`,
    )
    .eq("id", id)
    .maybeSingle();
  type Row = {
    invoice_number: string;
    total_cents: number | null;
    pdf_path: string | null;
    issue_date: string;
    due_date: string | null;
    notes: string | null;
    client: {
      id: string;
      display_name: string;
      contact_name: string | null;
      email: string | null;
      phone: string | null;
      tax_id: string | null;
      customer_type: "residential" | "commercial" | "alltagshilfe";
      lexware_contact_id: string | null;
    } | null;
    items: Array<{
      description: string;
      quantity: number;
      unit_price_cents: number;
    }> | null;
  };
  const inv = invRow as Row | null;
  if (!inv) return { ok: false, error: "invoice_not_found" };

  const lex = createLexwareClient();
  try {
    const result = await lex.pushInvoice({
      invoiceNumber: inv.invoice_number,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      notes: inv.notes,
      customerEmail: inv.client?.email ?? null,
      totalCents: Number(inv.total_cents ?? 0),
      pdfUrl: inv.pdf_path,
      client: inv.client
        ? {
            display_name: inv.client.display_name,
            contact_name: inv.client.contact_name,
            email: inv.client.email,
            phone: inv.client.phone,
            tax_id: inv.client.tax_id,
            customer_type: inv.client.customer_type,
            lexware_contact_id: inv.client.lexware_contact_id,
          }
        : undefined,
      items: (inv.items ?? []).map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit_price_cents: Number(it.unit_price_cents),
        tax_rate_percent: 19,
      })),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({ lexware_id: result.id })
      .eq("id", id);
    // Persist the contact id back so we don't keep creating new contacts.
    const contactId = (result as unknown as { contactId?: string }).contactId;
    if (contactId && inv.client?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("clients") as any))
        .update({ lexware_contact_id: contactId })
        .eq("id", inv.client.id);
    }
    await audit("lexware_sync", id, `Lexware ID gesetzt: ${result.id}`);
    revalidatePath(routes.invoice(id));
    return { ok: true, data: { id, lexwareId: result.id } };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Lexware sync failed";
    return { ok: false, error: message };
  }
}

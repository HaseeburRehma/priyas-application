import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";
import { createLexwareClient } from "@/lib/integrations/lexware";
import { resolveRateCents, vatRateFor, invoiceKindForClient } from "@/lib/billing/rates";
import { summarize } from "@/lib/billing/money";

/* ---------------------------------------------------------------------------
 * Public types — shared between the server action (UI) and cron route.
 * ------------------------------------------------------------------------- */

export type GenerateMonthlyArgs = {
  /** 4-digit calendar year. */
  year: number;
  /** 0-indexed month, matches the alltagshilfe loader. */
  month: number;
  /** When true, no rows are written and no Lexware calls are made. */
  dryRun: boolean;
};

export type GenerationError = {
  clientId: string;
  clientName: string;
  reason: string;
};

export type GenerateMonthlyResult = {
  ok: boolean;
  generated: number;
  skipped: number;
  errors: GenerationError[];
  totalEur: number;
};

export type LastRunSummary = {
  at: string;
  dryRun: boolean;
  generated: number;
  skipped: number;
  errorsCount: number;
  totalCents: number;
  year: number;
  month: number;
} | null;

type DbShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  org_id: string;
  override_rate_cents: number | null;
  assignment: { hourly_rate_cents: number | null } | null;
  property: {
    client_id: string;
    client: {
      id: string;
      display_name: string;
      customer_type: string;
      export_target: string;
      default_hourly_rate_cents: number | null;
    } | null;
  } | null;
};

type DbInvoiceRow = {
  client_id: string;
};

/* ---------------------------------------------------------------------------
 * Audit log helper — works against either the user-scoped server client
 * or the service-role client.
 * ------------------------------------------------------------------------- */

async function audit(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  recordId: string | null,
  message: string,
  meta: Record<string, unknown>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: userId,
    action: "lexware_monthly_generate",
    table_name: "invoices",
    record_id: recordId,
    after: { message, meta },
  });
}

/* ---------------------------------------------------------------------------
 * Cron entry-point — builds a service-role Supabase client and runs the
 * shared core. Used by `POST /api/jobs/lexware-monthly`.
 * ------------------------------------------------------------------------- */

export async function runMonthlyInvoicesAsService(
  args: GenerateMonthlyArgs,
): Promise<GenerateMonthlyResult> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      ok: false,
      generated: 0,
      skipped: 0,
      errors: [
        {
          clientId: "",
          clientName: "—",
          reason: "service_role_key_missing",
        },
      ],
      totalEur: 0,
    };
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  return runMonthlyInvoices(supabase, args, /*userId*/ null);
}

/* ---------------------------------------------------------------------------
 * Shared core — reused by both the server action and the cron route.
 * ------------------------------------------------------------------------- */

export async function runMonthlyInvoices(
  supabase: SupabaseClient,
  args: GenerateMonthlyArgs,
  userId: string | null,
): Promise<GenerateMonthlyResult> {
  const { year, month, dryRun } = args;
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));
  const periodLabel = `${String(month + 1).padStart(2, "0")}/${year}`;

  // 1) Pull all completed shifts in the window, joined to the owning client.
  const { data: shiftsData, error: shiftsErr } = await (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.from("shifts") as any
  )
    .select(
      `id, starts_at, ends_at, org_id, override_rate_cents,
       assignment:assignments ( hourly_rate_cents ),
       property:properties ( client_id,
                             client:clients ( id, display_name, customer_type, export_target, default_hourly_rate_cents ) )`,
    )
    .eq("status", "completed")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", monthEnd.toISOString())
    .is("deleted_at", null);

  if (shiftsErr) {
    return {
      ok: false,
      generated: 0,
      skipped: 0,
      errors: [
        { clientId: "", clientName: "—", reason: shiftsErr.message },
      ],
      totalEur: 0,
    };
  }

  const shifts = (shiftsData ?? []) as unknown as DbShift[];

  // 2) Bucket hours by client, then by effective rate within each client —
  //    different shifts can carry different assignment/client rates, so a
  //    client's auto-invoice may need more than one line item.
  type Bucket = {
    clientId: string;
    clientName: string;
    orgId: string;
    customerType: string;
    /** rateCents -> accumulated hours at that rate */
    rates: Map<number, number>;
  };
  const byClient = new Map<string, Bucket>();
  for (const s of shifts) {
    const c = s.property?.client;
    const clientId = s.property?.client_id ?? c?.id;
    if (!clientId || !c) continue;
    // Alltagshilfe clients are billed manually — never auto-sync to Lexware.
    if (c.customer_type === "alltagshilfe") continue;
    // This pipeline always pushes straight to Lexware (see step 4b below) —
    // clients left on "internal" billing must never be auto-invoiced here,
    // or the export_target toggle would be meaningless. They're billed via
    // the manual shift-approval → /invoices/new flow instead.
    if (c.export_target !== "lexware") continue;
    const hrs = Math.max(
      0,
      (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) /
        3_600_000,
    );
    if (hrs === 0) continue;
    // Walk the same shift-override -> assignment -> client-default -> system
    // fallback chain the manual draft-invoice flow uses, so the cron never
    // bills a client at a different rate than a manually-created invoice
    // would for the same shifts.
    const rateCents = resolveRateCents({
      shiftOverrideCents: s.override_rate_cents,
      assignmentRateCents: s.assignment?.hourly_rate_cents ?? null,
      clientDefaultRateCents: c.default_hourly_rate_cents,
    });
    let bucket = byClient.get(clientId);
    if (!bucket) {
      bucket = {
        clientId,
        clientName: c.display_name,
        orgId: s.org_id,
        customerType: c.customer_type,
        rates: new Map(),
      };
      byClient.set(clientId, bucket);
    }
    bucket.rates.set(rateCents, (bucket.rates.get(rateCents) ?? 0) + hrs);
  }

  if (byClient.size === 0) {
    return { ok: true, generated: 0, skipped: 0, errors: [], totalEur: 0 };
  }

  // 3) Look up which clients are already invoiced for this period.
  const clientIds = Array.from(byClient.keys());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRows } = await ((supabase.from("invoices") as any))
    .select("client_id")
    .eq("period_year", year)
    .eq("period_month", month)
    .in("client_id", clientIds)
    .is("deleted_at", null)
    .not("lexware_id", "is", null);
  const alreadyBilled = new Set(
    ((existingRows ?? []) as DbInvoiceRow[]).map((r) => r.client_id),
  );

  // 4) Generate per-client.
  const errors: GenerationError[] = [];
  let generated = 0;
  let skipped = 0;
  let totalCents = 0;
  const lex = createLexwareClient();

  for (const bucket of byClient.values()) {
    const taxRatePercent = vatRateFor(invoiceKindForClient(bucket.customerType));
    // One line item per distinct effective rate — most clients have a single
    // rate and thus a single line, but mixed-rate months (rate changed
    // mid-period, or per-assignment overrides) need separate lines so the
    // printed price-per-hour on the invoice matches what was actually billed.
    const lineItems = Array.from(bucket.rates.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rateCents, hours], idx) => ({
        description: `Pflegedienstleistungen ${periodLabel}`,
        quantity: Math.round(hours * 100) / 100,
        unitPriceCents: rateCents,
        taxRatePercent,
        position: idx + 1,
      }));
    const totals = summarize(lineItems);
    const totalHours = Array.from(bucket.rates.values()).reduce((a, h) => a + h, 0);

    if (totals.totalCents === 0) {
      skipped += 1;
      continue;
    }
    if (alreadyBilled.has(bucket.clientId)) {
      skipped += 1;
      continue;
    }

    totalCents += totals.totalCents;
    if (dryRun) {
      generated += 1;
      continue;
    }

    try {
      const invoiceNumber = await nextInvoiceNumber(
        supabase,
        bucket.orgId,
        year,
        month,
      );
      const issueDate = new Date(Date.UTC(year, month + 1, 1))
        .toISOString()
        .slice(0, 10); // first of *next* month
      const dueDate = new Date(Date.UTC(year, month + 1, 15))
        .toISOString()
        .slice(0, 10);

      // 4a) INSERT the invoice header as already 'sent', mirroring the
      // manual issueInvoiceAction flow (invoice-draft.ts): this pipeline
      // always pushes straight to Lexware in the same request (there's no
      // manual-review step for auto-monthly invoices), so there's no real
      // "draft" phase. Leaving it as 'draft' meant a failed push below
      // orphaned the row forever — both retry surfaces
      // (retryLexwarePushSweep and bulkRetrySyncAction) only ever look at
      // status IN (sent, overdue, paid), by design, so a stuck 'draft' row
      // was invisible to every retry path and that client silently never
      // got billed for the period. lexware_sync_status starts 'pending'
      // and gets corrected to 'synced'/'failed' below once we know which.
      const { data: insertedRow, error: insertErr } = await (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from("invoices") as any
      )
        .insert({
          org_id: bucket.orgId,
          client_id: bucket.clientId,
          invoice_number: invoiceNumber,
          status: "sent",
          issue_date: issueDate,
          due_date: dueDate,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          total_cents: totals.totalCents,
          period_year: year,
          period_month: month,
          source: "auto_monthly",
          lexware_sync_status: "pending",
          notes: `Auto-generated monthly invoice ${periodLabel}`,
        })
        .select("id")
        .single();
      if (insertErr || !insertedRow) {
        errors.push({
          clientId: bucket.clientId,
          clientName: bucket.clientName,
          reason: insertErr?.message ?? "invoice_insert_failed",
        });
        continue;
      }
      const newInvoiceId = (insertedRow as { id: string }).id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("invoice_items") as any)).insert(
        lineItems.map((it) => ({
          org_id: bucket.orgId,
          invoice_id: newInvoiceId,
          description: it.description,
          quantity: it.quantity,
          unit_price_cents: it.unitPriceCents,
          tax_rate: it.taxRatePercent,
          position: it.position,
        })),
      );

      // 4b) Push to Lexware.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: clientRow } = await ((supabase.from("clients") as any))
        .select(
          "id, display_name, contact_name, email, phone, tax_id, customer_type, address_line1, city, postal_code, country, lexware_contact_id",
        )
        .eq("id", bucket.clientId)
        .maybeSingle();
      type ClientRow = {
        id: string;
        display_name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        tax_id: string | null;
        customer_type: "residential" | "commercial" | "alltagshilfe";
        address_line1: string | null;
        city: string | null;
        postal_code: string | null;
        country: string | null;
        lexware_contact_id: string | null;
      };
      const client = clientRow as ClientRow | null;

      try {
        const pushed = await lex.pushInvoice({
          invoiceNumber,
          issueDate,
          dueDate,
          notes: `Pflegedienstleistungen ${periodLabel}`,
          customerEmail: client?.email ?? null,
          totalCents: totals.totalCents,
          client: client
            ? {
                display_name: client.display_name,
                contact_name: client.contact_name,
                email: client.email,
                phone: client.phone,
                tax_id: client.tax_id,
                customer_type: client.customer_type,
                address_line1: client.address_line1,
                city: client.city,
                postal_code: client.postal_code,
                country: client.country,
                lexware_contact_id: client.lexware_contact_id,
              }
            : undefined,
          items: lineItems.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price_cents: it.unitPriceCents,
            tax_rate_percent: it.taxRatePercent,
          })),
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ((supabase.from("invoices") as any))
          .update({
            lexware_id: pushed.id,
            status: "sent",
            lexware_sync_status: "synced",
            lexware_last_attempt_at: new Date().toISOString(),
            lexware_last_error: null,
            lexware_attempts: 1,
          })
          .eq("id", newInvoiceId);

        if (pushed.contactId && client?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await ((supabase.from("clients") as any))
            .update({ lexware_contact_id: pushed.contactId })
            .eq("id", client.id);
        }

        await audit(
          supabase,
          bucket.orgId,
          userId,
          newInvoiceId,
          `Monatsrechnung ${periodLabel} an Lexware übertragen`,
          {
            client_id: bucket.clientId,
            hours: totalHours,
            amount_cents: totals.totalCents,
            tax_cents: totals.taxCents,
            lexware_id: pushed.id,
          },
        );
        generated += 1;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "lexware_push_failed";
        // The invoice row already exists (status='sent', lexware_id=null) —
        // record the failure on it so retryLexwarePushSweep / the "Retry
        // failed syncs" button in the UI can find and re-attempt it. Before
        // this fix, a failure here was reported only in the in-memory
        // `errors` list for this one cron run and then lost — the row
        // itself never showed as failed and nothing ever retried it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ((supabase.from("invoices") as any))
          .update({
            lexware_sync_status: "failed",
            lexware_last_attempt_at: new Date().toISOString(),
            lexware_last_error: message.slice(0, 500),
            lexware_attempts: 1,
          })
          .eq("id", newInvoiceId);
        errors.push({
          clientId: bucket.clientId,
          clientName: bucket.clientName,
          reason: message,
        });
      }
    } catch (err) {
      errors.push({
        clientId: bucket.clientId,
        clientName: bucket.clientName,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  // 5) Summary audit row — useful for the "last run" panel.
  const summaryOrg = shifts[0]?.org_id;
  if (summaryOrg) {
    await audit(
      supabase,
      summaryOrg,
      userId,
      null,
      dryRun
        ? `Monatsrechnungslauf Vorschau ${periodLabel}`
        : `Monatsrechnungslauf ${periodLabel}`,
      {
        dry_run: dryRun,
        generated,
        skipped,
        errors_count: errors.length,
        total_cents: totalCents,
        year,
        month,
      },
    );
  }

  return {
    ok: errors.length === 0,
    generated,
    skipped,
    errors,
    totalEur: Math.round(totalCents) / 100,
  };
}

/** Builds the next invoice_number for a given org + period. */
async function nextInvoiceNumber(
  supabase: SupabaseClient,
  orgId: string,
  year: number,
  month: number,
): Promise<string> {
  const prefix = `AUTO-${year}-${String(month + 1).padStart(2, "0")}-`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("invoices") as any))
    .select("invoice_number")
    .eq("org_id", orgId)
    .ilike("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  const list = (data ?? []) as Array<{ invoice_number: string }>;
  const lastSeq = list[0]?.invoice_number
    ? Number(list[0].invoice_number.split("-").pop()) || 0
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

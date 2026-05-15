import { NextResponse, type NextRequest } from "next/server";
import { loadReports, type ReportRange } from "@/lib/api/reports";
import { loadAlltagshilfeMonthly } from "@/lib/api/alltagshilfe";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import {
  renderReportsPdf,
  type OpenInvoiceRow,
  type ReportType,
} from "@/lib/pdf/reports-pdf";
import { renderAlltagshilfePdf } from "@/lib/pdf/alltagshilfe-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { asAppLocale } from "@/lib/utils/i18n-format";
import { getLocale } from "next-intl/server";

const VALID_RANGES: ReportRange[] = ["30d", "Q", "YTD", "12mo"];
const VALID_TYPES = [
  "summary",
  "monthly-revenue",
  "alltagshilfe",
  "hours",
  "completion",
  "open-invoices",
  "satisfaction",
] as const;

// Types we render via the generic Reports PDF renderer. Alltagshilfe
// has its own dedicated renderer because its data shape (per-client
// staff tables) doesn't fit ReportsData.
const REPORTS_PDF_TYPES: ReportType[] = [
  "summary",
  "monthly-revenue",
  "hours",
  "completion",
  "satisfaction",
  "open-invoices",
];

/**
 * GET /api/reports/export?type=summary&range=YTD&format=csv|pdf
 *
 * For now this returns a CSV download regardless of the requested format —
 * a real PDF generator (react-pdf / pdf-lib) drops in here in a follow-up.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("report.alltagshilfe.export");
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof PermissionError ? err.message : "Forbidden",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const typeRaw = url.searchParams.get("type") ?? "summary";
  const rangeRaw = url.searchParams.get("range") ?? "YTD";
  const format = url.searchParams.get("format") ?? "csv";

  const type = (VALID_TYPES as ReadonlyArray<string>).includes(typeRaw)
    ? (typeRaw as (typeof VALID_TYPES)[number])
    : "summary";
  const range = VALID_RANGES.includes(rangeRaw as ReportRange)
    ? (rangeRaw as ReportRange)
    : "YTD";

  const data = await loadReports(range);

  // CSV-escape per RFC 4180: wrap in quotes if the value contains a
  // comma, quote, CR or LF; double any embedded quotes.
  //
  // SECURITY: also defuse Excel / Google Sheets formula injection — if a
  // cell starts with =, +, -, @, \t or \r the spreadsheet evaluates it
  // as a formula. We prefix such cells with a single quote so they
  // render as plain text.
  const csvEscape = (s: string): string => {
    let out = s;
    if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
      out = `'${out}`;
    }
    if (/[",\r\n]/.test(out)) {
      return `"${out.replace(/"/g, '""')}"`;
    }
    return out;
  };

  // Open-invoices fetch is shared between the CSV and PDF branches —
  // computed lazily on demand so the other report types don't pay the
  // round-trip cost.
  type OpenInvoiceFetched = {
    invoice_number: string;
    status: "sent" | "overdue";
    issue_date: string;
    due_date: string | null;
    total_cents: number;
    client_name: string;
    days_overdue: number | null;
  };
  let openInvoicesCache: OpenInvoiceFetched[] | undefined;
  const loadOpenInvoices = async (): Promise<OpenInvoiceFetched[]> => {
    if (openInvoicesCache) return openInvoicesCache;
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoiceRows } = await ((supabase.from("invoices") as any))
      .select(
        `invoice_number, status, issue_date, due_date, total_cents,
         client:clients ( display_name )`,
      )
      .is("deleted_at", null)
      .in("status", ["sent", "overdue"])
      .order("due_date", { ascending: true, nullsFirst: false });
    type Row = {
      invoice_number: string;
      status: "sent" | "overdue";
      issue_date: string;
      due_date: string | null;
      total_cents: number;
      client: { display_name: string } | null;
    };
    const today = new Date();
    openInvoicesCache = ((invoiceRows ?? []) as Row[]).map((r) => {
      const due = r.due_date ? new Date(r.due_date) : null;
      const days_overdue = due
        ? Math.floor((today.getTime() - due.getTime()) / 86_400_000)
        : null;
      return {
        invoice_number: r.invoice_number,
        status: r.status,
        issue_date: r.issue_date,
        due_date: r.due_date,
        total_cents: Number(r.total_cents ?? 0),
        client_name: r.client?.display_name ?? "—",
        days_overdue,
      };
    });
    return openInvoicesCache;
  };

  // Minimal CSV builder. Real PDF rendering is the next iteration.
  let body = "";
  const filename = `priya-report-${type}-${range}.csv`;

  switch (type) {
    case "monthly-revenue":
      body =
        "month,invoiced_eur,collected_eur,forecast\n" +
        data.revenueSeries
          .map(
            (m) =>
              `${m.label},${(m.invoicedCents / 100).toFixed(2)},${(m.collectedCents / 100).toFixed(2)},${m.forecast ? "1" : "0"}`,
          )
          .join("\n");
      break;
    case "hours":
      body =
        "service_type,hours,share_pct\n" +
        data.hoursByService
          .map((r) => `${r.serviceType},${r.hours},${r.pct.toFixed(2)}`)
          .join("\n");
      break;
    case "completion":
      body = `metric,value\ncompleted,${data.kpis.shiftsCompleted}\ntotal,${data.kpis.shiftsTotal}\ncompletion_pct,${data.kpis.shiftsCompletionPct.toFixed(2)}\nredistributed,${data.kpis.shiftsRedistributed}`;
      break;
    case "satisfaction":
      body =
        `metric,value\n` +
        `satisfaction_avg,${data.kpis.satisfactionAvg.toFixed(2)}\n` +
        `satisfaction_reviews,${data.kpis.satisfactionReviews}\n` +
        `satisfaction_nps,${data.kpis.satisfactionNps}`;
      break;
    case "open-invoices": {
      const invoices = await loadOpenInvoices();
      body =
        "invoice_number,client,status,issue_date,due_date,total_eur,days_overdue\n" +
        invoices
          .map((r) =>
            [
              csvEscape(r.invoice_number),
              csvEscape(r.client_name),
              r.status,
              r.issue_date ?? "",
              r.due_date ?? "",
              (r.total_cents / 100).toFixed(2),
              r.days_overdue ?? "",
            ].join(","),
          )
          .join("\n");
      break;
    }
    case "alltagshilfe": {
      const now = new Date();
      const locale = asAppLocale(await getLocale());
      const report = await loadAlltagshilfeMonthly(
        now.getFullYear(),
        now.getMonth(),
        locale,
      );
      const lines: string[] = [
        "client,insurance_provider,care_level,employee,hours_total,amount_eur",
      ];
      for (const row of report.rows) {
        for (const member of row.staff) {
          lines.push(
            [
              csvEscape(row.client.name),
              csvEscape(row.client.insurance),
              "", // care_level not surfaced on AlltagshilfeRow.client
              csvEscape(member.name),
              member.hours.toFixed(2),
              (member.amountCents / 100).toFixed(2),
            ].join(","),
          );
        }
      }
      body = lines.join("\n");
      break;
    }
    case "summary":
    default:
      body =
        `metric,value\n` +
        `range,${data.range}\n` +
        `revenue_eur,${(data.kpis.revenueCents / 100).toFixed(2)}\n` +
        `revenue_delta_pct,${data.kpis.revenueDeltaPct.toFixed(2)}\n` +
        `hours,${data.kpis.hours}\n` +
        `hours_delta_pct,${data.kpis.hoursDeltaPct.toFixed(2)}\n` +
        `shifts_completed,${data.kpis.shiftsCompleted}\n` +
        `shifts_total,${data.kpis.shiftsTotal}\n` +
        `completion_pct,${data.kpis.shiftsCompletionPct.toFixed(2)}\n` +
        `satisfaction_avg,${data.kpis.satisfactionAvg.toFixed(2)}\n` +
        `satisfaction_reviews,${data.kpis.satisfactionReviews}\n` +
        `satisfaction_nps,${data.kpis.satisfactionNps}\n` +
        `total_hours,${data.totalHours}\n` +
        `billing_rate_pct,${data.billingRate.toFixed(2)}\n` +
        `average_rate_eur,${data.averageRate.toFixed(2)}`;
      break;
  }

  if (format === "pdf") {
    // Resolve org name once — used by both renderers.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let orgName = "Priya's Reinigungsservice";
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await ((supabase.from("profiles") as any))
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = (profile as { org_id: string | null } | null)?.org_id;
      if (orgId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: org } = await ((supabase.from("organizations") as any))
          .select("name")
          .eq("id", orgId)
          .maybeSingle();
        const n = (org as { name: string | null } | null)?.name;
        if (n) orgName = n;
      }
    }

    // 1) Alltagshilfe gets its own renderer + dataset.
    if (type === "alltagshilfe") {
      const now = new Date();
      const locale = asAppLocale(await getLocale());
      const report = await loadAlltagshilfeMonthly(
        now.getFullYear(),
        now.getMonth(),
        locale,
      );
      const bytes = await renderAlltagshilfePdf(report, { name: orgName });
      const pdfFilename = filename.replace(".csv", ".pdf");
      return new NextResponse(bytes as unknown as BodyInit, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${pdfFilename}"`,
          "cache-control": "no-store",
        },
      });
    }

    // 2) Open-invoices needs the actual list of unpaid invoices.
    //    Reuses the same fetch the CSV branch uses (deduplicated via
    //    loadOpenInvoices() — the cache means at most one DB round-trip
    //    even though both branches reference the data).
    let openInvoicesExtra: OpenInvoiceRow[] | undefined;
    if (type === "open-invoices") {
      const invoices = await loadOpenInvoices();
      openInvoicesExtra = invoices.map((r) => ({
        invoice_number: r.invoice_number,
        client_name: r.client_name,
        status: r.status,
        issue_date: r.issue_date,
        due_date: r.due_date,
        total_cents: r.total_cents,
        days_overdue: r.days_overdue,
      }));
    }

    // 3) Everything else (incl. satisfaction) goes through the generic renderer.
    if ((REPORTS_PDF_TYPES as ReadonlyArray<string>).includes(type)) {
      const bytes = await renderReportsPdf(
        type as ReportType,
        data,
        { name: orgName },
        { openInvoices: openInvoicesExtra },
      );
      const pdfFilename = filename.replace(".csv", ".pdf");
      return new NextResponse(bytes as unknown as BodyInit, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${pdfFilename}"`,
          "cache-control": "no-store",
        },
      });
    }
    // Unrecognised PDF type — fall through to CSV with a heads-up.
    body = `# PDF for "${type}" is not yet available; CSV below.\n\n${body}`;
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

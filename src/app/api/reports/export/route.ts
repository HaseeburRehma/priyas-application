import { NextResponse, type NextRequest } from "next/server";
import { loadReports, type ReportRange } from "@/lib/api/reports";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";

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

  // Minimal CSV builder. Real PDF rendering is the next iteration.
  let body = "";
  let filename = `priya-report-${type}-${range}.csv`;

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
    // Stub — return CSV for now but with a friendly note.
    body = `Note: PDF export coming next. CSV below.\n\n${body}`;
    filename = filename.replace(".csv", ".txt");
    return new NextResponse(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

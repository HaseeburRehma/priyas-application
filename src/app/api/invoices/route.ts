import { NextResponse, type NextRequest } from "next/server";
import { loadInvoicesList } from "@/lib/api/invoices";
import type { InvoiceStatus } from "@/lib/api/invoices.types";

const STATUSES: ReadonlyArray<InvoiceStatus | "all"> = [
  "all",
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sort = (url.searchParams.get("sort") as "issue_date" | "total" | "client") ?? "issue_date";
  const direction = (url.searchParams.get("direction") as "asc" | "desc") ?? "desc";

  const status = STATUSES.includes(statusRaw as InvoiceStatus | "all")
    ? (statusRaw as InvoiceStatus | "all")
    : "all";
  const format = url.searchParams.get("format");

  try {
    // CSV export. Same shape the InvoicesPage Export button expects:
    // grab everything matching the active filter, no pagination.
    if (format === "csv") {
      const result = await loadInvoicesList({
        q,
        status,
        page: 1,
        pageSize: 5000,
        sort,
        direction,
      });
      const headers = [
        "invoice_number",
        "client",
        "status",
        "issue_date",
        "due_date",
        "total_eur",
        "days_overdue",
        "lexware_id",
      ];
      const csv = [
        headers.join(","),
        ...result.rows.map((r) =>
          [
            r.invoice_number,
            csvEscape(r.client_name),
            r.status,
            r.issue_date,
            r.due_date ?? "",
            (r.total_cents / 100).toFixed(2),
            r.days_overdue ?? "",
            r.lexware_id ?? "",
          ].join(","),
        ),
      ].join("\n");
      const today = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="invoices-${today}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const result = await loadInvoicesList({ q, status, page, pageSize, sort, direction });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_invoices_failed" },
      { status: 500 },
    );
  }
}

function csvEscape(s: string): string {
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

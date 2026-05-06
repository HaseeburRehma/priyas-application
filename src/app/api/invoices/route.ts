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

  try {
    const result = await loadInvoicesList({ q, status, page, pageSize, sort, direction });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_invoices_failed" },
      { status: 500 },
    );
  }
}

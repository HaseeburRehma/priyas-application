import { NextResponse } from "next/server";
import { loadInvoicesList } from "@/lib/api/invoices";
import type { InvoiceStatus } from "@/lib/api/invoices.types";
import { v1Guard, v1ListResponse, v1ErrorResponse } from "@/lib/api/v1-respond";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlyArray<InvoiceStatus | "all"> = [
  "all",
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
];

const VALID_SORTS = ["issue_date", "total", "client"] as const;
type InvoiceSort = (typeof VALID_SORTS)[number];

export async function GET(request: Request) {
  const guard = await v1Guard(request, "read:invoices");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "25") || 25),
  );
  const sortRaw = url.searchParams.get("sort") ?? "issue_date";
  const sort: InvoiceSort = VALID_SORTS.includes(sortRaw as InvoiceSort)
    ? (sortRaw as InvoiceSort)
    : "issue_date";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") === "asc"
      ? "asc"
      : "desc";
  const status = VALID_STATUSES.includes(statusRaw as InvoiceStatus | "all")
    ? (statusRaw as InvoiceStatus | "all")
    : "all";

  try {
    const result = await loadInvoicesList({
      q,
      status,
      page,
      pageSize,
      sort,
      direction,
    });
    return v1ListResponse(result.rows, { page, pageSize, total: result.total });
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_invoices_failed",
    );
  }
}

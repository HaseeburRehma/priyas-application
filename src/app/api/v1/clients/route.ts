import { NextResponse } from "next/server";
import { loadClientsList } from "@/lib/api/clients";
import type {
  ClientCustomerType,
  ClientsSortField,
} from "@/lib/api/clients.types";
import { v1Guard, v1ListResponse, v1ErrorResponse } from "@/lib/api/v1-respond";

export const dynamic = "force-dynamic";

const VALID_SORTS: ReadonlyArray<ClientsSortField> = ["name", "contract_start"];
const VALID_TYPES: ReadonlyArray<ClientCustomerType | "all"> = [
  "all",
  "residential",
  "commercial",
  "alltagshilfe",
];

/**
 * GET /api/v1/clients
 * Lists clients in the caller's organisation. Bearer-authenticated;
 * requires the `read:clients` scope.
 */
export async function GET(request: Request) {
  const guard = await v1Guard(request, "read:clients");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const typeRaw = url.searchParams.get("type") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "25") || 25),
  );
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: ClientsSortField = VALID_SORTS.includes(
    sortRaw as ClientsSortField,
  )
    ? (sortRaw as ClientsSortField)
    : "name";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") === "desc"
      ? "desc"
      : "asc";
  const type = VALID_TYPES.includes(typeRaw as ClientCustomerType | "all")
    ? (typeRaw as ClientCustomerType | "all")
    : "all";

  try {
    const result = await loadClientsList({
      q,
      type,
      page,
      pageSize,
      sort,
      direction,
    });
    return v1ListResponse(result.rows, { page, pageSize, total: result.total });
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_clients_failed",
    );
  }
}

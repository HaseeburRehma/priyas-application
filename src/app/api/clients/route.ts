import { NextResponse, type NextRequest } from "next/server";
import { loadClientsList, type ClientCustomerType } from "@/lib/api/clients";

/**
 * GET /api/clients?q=&type=&page=&pageSize=&sort=&direction=
 * Returns the paginated client table. RLS keeps it scoped to the caller.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const typeRaw = url.searchParams.get("type") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sort = (url.searchParams.get("sort") ?? "name") as
    | "name"
    | "properties"
    | "contract_start";
  const direction = (url.searchParams.get("direction") ?? "asc") as
    | "asc"
    | "desc";

  const validTypes: ReadonlyArray<ClientCustomerType | "all"> = [
    "all",
    "residential",
    "commercial",
    "alltagshilfe",
  ];
  const type = validTypes.includes(typeRaw as ClientCustomerType | "all")
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
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_clients_failed" },
      { status: 500 },
    );
  }
}

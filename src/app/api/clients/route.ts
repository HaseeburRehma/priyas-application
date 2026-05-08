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

  const format = url.searchParams.get("format");

  try {
    // CSV export: ignore pagination, return *all* matching clients in
    // one document. The Export button on /clients calls this endpoint
    // with `?format=csv` so managers can drop the list into Excel.
    if (format === "csv") {
      const result = await loadClientsList({
        q,
        type,
        page: 1,
        pageSize: 5000, // generous cap; the list is rarely larger
        sort,
        direction,
      });
      const headers = [
        "name",
        "type",
        "email",
        "phone",
        "properties",
        "status",
        "contract_start",
      ];
      const csv = [
        headers.join(","),
        ...result.rows.map((r) =>
          [
            csvEscape(r.display_name),
            r.customer_type,
            csvEscape(r.email ?? ""),
            csvEscape(r.phone ?? ""),
            r.property_count,
            r.status,
            r.contract_start ?? "",
          ].join(","),
        ),
      ].join("\n");
      const today = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="clients-${today}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

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

function csvEscape(s: string): string {
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

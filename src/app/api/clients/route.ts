import { NextResponse, type NextRequest } from "next/server";
import { loadClientsList, type ClientCustomerType } from "@/lib/api/clients";
import type { ClientsSortField } from "@/lib/api/clients.types";

const VALID_SORTS: ReadonlyArray<ClientsSortField> = ["name", "contract_start"];

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
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: ClientsSortField = VALID_SORTS.includes(
    sortRaw as ClientsSortField,
  )
    ? (sortRaw as ClientsSortField)
    : "name";
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

  // Bulk-export selection support: `?ids=uuid1,uuid2,...` restricts
  // the result set. Applies to both the JSON list and the CSV export.
  const idsRaw = url.searchParams.get("ids");
  const ids =
    idsRaw && idsRaw.trim().length > 0
      ? idsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

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
        ids,
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
          "content-disposition": `attachment; filename="priya-clients-${today}.csv"`,
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
      ids,
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
  // SECURITY: when an exported cell starts with =, +, -, @, \t or \r,
  // Excel / Google Sheets interpret it as a formula on import — which
  // lets an attacker who can write to e.g. a client name run code on
  // any analyst's machine that opens the CSV. Prefix with a single
  // quote to neutralise the formula before applying the standard
  // quoting rules.
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}

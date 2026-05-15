import { NextResponse, type NextRequest } from "next/server";
import { loadPropertiesList } from "@/lib/api/properties";
import type {
  PropertiesSortField,
  PropertyKind,
  PropertyStatus,
} from "@/lib/api/properties.types";

const VALID_SORTS: ReadonlyArray<PropertiesSortField> = ["name", "client"];

const VALID_KINDS: ReadonlyArray<PropertyKind | "all"> = [
  "all",
  "office",
  "retail",
  "residential",
  "medical",
  "industrial",
  "other",
];
const VALID_STATUSES: ReadonlyArray<PropertyStatus | "all"> = [
  "all",
  "active",
  "onboarding",
  "attention",
  "paused",
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const kindRaw = url.searchParams.get("kind") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: PropertiesSortField = VALID_SORTS.includes(
    sortRaw as PropertiesSortField,
  )
    ? (sortRaw as PropertiesSortField)
    : "name";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") ?? "asc";

  const kind = VALID_KINDS.includes(kindRaw as PropertyKind | "all")
    ? (kindRaw as PropertyKind | "all")
    : "all";
  const status = VALID_STATUSES.includes(statusRaw as PropertyStatus | "all")
    ? (statusRaw as PropertyStatus | "all")
    : "all";

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

  const format = url.searchParams.get("format");

  try {
    if (format === "csv") {
      const result = await loadPropertiesList({
        q,
        kind,
        status,
        page: 1,
        pageSize: 5000,
        sort,
        direction,
        ids,
      });
      const headers = [
        "name",
        "address",
        "type",
        "client",
        "assignments_per_week",
        "status",
        "team_lead",
      ];
      const csv = [
        headers.join(","),
        ...result.rows.map((r) =>
          [
            csvEscape(r.name),
            csvEscape(r.address),
            r.kind,
            csvEscape(r.client_name),
            r.assignments_per_week,
            r.status,
            csvEscape(r.team_lead_name ?? ""),
          ].join(","),
        ),
      ].join("\n");
      const today = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="priya-properties-${today}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const result = await loadPropertiesList({
      q,
      kind,
      status,
      page,
      pageSize,
      sort,
      direction,
      ids,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_properties_failed" },
      { status: 500 },
    );
  }
}

function csvEscape(s: string): string {
  // SECURITY: defuse Excel / Google Sheets formula injection by
  // prefixing leading =, +, -, @, \t, \r with a single quote.
  let out = s;
  if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }
  if (!/[",\n]/.test(out)) return out;
  return `"${out.replace(/"/g, '""')}"`;
}

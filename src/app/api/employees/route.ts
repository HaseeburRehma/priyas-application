import { NextResponse, type NextRequest } from "next/server";
import { loadEmployeesList } from "@/lib/api/employees";
import type {
  EmployeeRoleChip,
  EmployeesSortField,
  EmployeeStatus,
} from "@/lib/api/employees.types";

const ROLES: ReadonlyArray<EmployeeRoleChip | "all"> = [
  "all",
  "pm",
  "field",
  "trainee",
];
const STATUSES: ReadonlyArray<EmployeeStatus | "all"> = [
  "all",
  "active",
  "on_leave",
  "inactive",
];
const VALID_SORTS: ReadonlyArray<EmployeesSortField> = ["name", "status"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const roleRaw = url.searchParams.get("role") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: EmployeesSortField = VALID_SORTS.includes(
    sortRaw as EmployeesSortField,
  )
    ? (sortRaw as EmployeesSortField)
    : "name";
  const direction = (url.searchParams.get("direction") as "asc" | "desc") ?? "asc";

  const role = ROLES.includes(roleRaw as EmployeeRoleChip | "all")
    ? (roleRaw as EmployeeRoleChip | "all")
    : "all";
  const status = STATUSES.includes(statusRaw as EmployeeStatus | "all")
    ? (statusRaw as EmployeeStatus | "all")
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
    if (format === "csv") {
      const result = await loadEmployeesList({
        q,
        role,
        status,
        page: 1,
        pageSize: 5000,
        sort,
        direction,
        ids,
      });
      const headers = [
        "name",
        "email",
        "phone",
        "role",
        "status",
        "hours_this_week",
        "weekly_target",
        "vacation_used",
        "vacation_total",
      ];
      const csv = [
        headers.join(","),
        ...result.rows.map((r) =>
          [
            csvEscape(r.full_name),
            csvEscape(r.email ?? ""),
            csvEscape(r.phone ?? ""),
            r.role_chip,
            r.status,
            r.hours_this_week,
            r.weekly_target,
            r.vacation_used,
            r.vacation_total,
          ].join(","),
        ),
      ].join("\n");
      const today = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="priya-employees-${today}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const result = await loadEmployeesList({
      q,
      role,
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
      { error: err instanceof Error ? err.message : "load_employees_failed" },
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

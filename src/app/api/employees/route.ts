import { NextResponse, type NextRequest } from "next/server";
import { loadEmployeesList } from "@/lib/api/employees";
import type {
  EmployeeRoleChip,
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const roleRaw = url.searchParams.get("role") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const sort = (url.searchParams.get("sort") as "name" | "hours" | "status") ?? "name";
  const direction = (url.searchParams.get("direction") as "asc" | "desc") ?? "asc";

  const role = ROLES.includes(roleRaw as EmployeeRoleChip | "all")
    ? (roleRaw as EmployeeRoleChip | "all")
    : "all";
  const status = STATUSES.includes(statusRaw as EmployeeStatus | "all")
    ? (statusRaw as EmployeeStatus | "all")
    : "all";

  try {
    const result = await loadEmployeesList({
      q,
      role,
      status,
      page,
      pageSize,
      sort,
      direction,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "load_employees_failed" },
      { status: 500 },
    );
  }
}

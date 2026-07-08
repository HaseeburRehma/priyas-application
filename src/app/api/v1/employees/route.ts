import { NextResponse } from "next/server";
import { loadEmployeesList } from "@/lib/api/employees";
import type {
  EmployeeRoleChip,
  EmployeeStatus,
  EmployeesSortField,
} from "@/lib/api/employees.types";
import { v1Guard, v1ListResponse, v1ErrorResponse } from "@/lib/api/v1-respond";
import { getServiceClient } from "@/lib/api/v1-auth";

export const dynamic = "force-dynamic";

const VALID_SORTS: ReadonlyArray<EmployeesSortField> = ["name", "status"];
const VALID_ROLES: ReadonlyArray<EmployeeRoleChip | "all"> = [
  "all",
  "pm",
  "field",
  "trainee",
];
const VALID_STATUSES: ReadonlyArray<EmployeeStatus | "all"> = [
  "all",
  "active",
  "on_leave",
  "inactive",
];

export async function GET(request: Request) {
  const guard = await v1Guard(request, "read:employees");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const roleRaw = url.searchParams.get("role") ?? "all";
  const statusRaw = url.searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "25") || 25),
  );
  const sortRaw = url.searchParams.get("sort") ?? "name";
  const sort: EmployeesSortField = VALID_SORTS.includes(
    sortRaw as EmployeesSortField,
  )
    ? (sortRaw as EmployeesSortField)
    : "name";
  const direction =
    (url.searchParams.get("direction") as "asc" | "desc") === "desc"
      ? "desc"
      : "asc";
  const role = VALID_ROLES.includes(roleRaw as EmployeeRoleChip | "all")
    ? (roleRaw as EmployeeRoleChip | "all")
    : "all";
  const status = VALID_STATUSES.includes(statusRaw as EmployeeStatus | "all")
    ? (statusRaw as EmployeeStatus | "all")
    : "all";

  // See v1/clients/route.ts for why this must be explicit rather than an
  // `?? undefined` fallback to the unscoped session-client default.
  const serviceClient = getServiceClient();
  if (!serviceClient) return v1ErrorResponse(503, "v1_api_not_configured");

  try {
    const result = await loadEmployeesList(
      { q, role, status, page, pageSize, sort, direction },
      { supabase: serviceClient, orgId: guard.orgId },
    );
    return v1ListResponse(result.rows, { page, pageSize, total: result.total });
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_employees_failed",
    );
  }
}

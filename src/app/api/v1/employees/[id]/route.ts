import { NextResponse } from "next/server";
import { loadEmployeeDetail } from "@/lib/api/employees";
import { v1Guard, v1ItemResponse, v1ErrorResponse } from "@/lib/api/v1-respond";
import { getServiceClient, hasScope } from "@/lib/api/v1-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/employees/{id} — returns the full `EmployeeDetail` shape
 * (auth_role, weekly_hours, upcoming_shifts, recent_time_entries, etc.).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const guard = await v1Guard(request, "read:employees");
  if (guard instanceof NextResponse) return guard;

  const serviceClient = getServiceClient();
  if (!serviceClient) return v1ErrorResponse(503, "v1_api_not_configured");

  try {
    const { id } = await Promise.resolve(context.params);
    const detail = await loadEmployeeDetail(id, {
      supabase: serviceClient,
      orgId: guard.orgId,
    });
    if (!detail) return v1ErrorResponse(404, "employee_not_found");
    // hourly_rate_eur is compensation data — only include it when the key
    // was explicitly granted the extra scope, not just general employee
    // read access. See the read:employees:compensation doc comment.
    if (!hasScope(guard, "read:employees:compensation")) {
      const { hourly_rate_eur: _hourly_rate_eur, ...rest } = detail;
      return v1ItemResponse(rest);
    }
    return v1ItemResponse(detail);
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_employee_failed",
    );
  }
}

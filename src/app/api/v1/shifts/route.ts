import { NextResponse } from "next/server";
import { loadScheduleRange } from "@/lib/api/schedule";
import { v1Guard, v1ListResponse, v1ErrorResponse } from "@/lib/api/v1-respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/shifts?from=ISO8601&to=ISO8601
 *
 * Returns every shift starting within the inclusive date range. `from`
 * and `to` MUST be ISO8601 strings; integrations are expected to pass
 * UTC instants. Pagination is flat — clients should narrow the window
 * (e.g. 31-day chunks) rather than paginate within a window.
 */
export async function GET(request: Request) {
  const guard = await v1Guard(request, "read:shifts");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!fromRaw || !toRaw) {
    return v1ErrorResponse(400, "missing_from_or_to");
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return v1ErrorResponse(400, "invalid_date_range");
  }
  if (from.getTime() > to.getTime()) {
    return v1ErrorResponse(400, "from_after_to");
  }
  // Hard cap to keep responses bounded.
  const MAX_DAYS = 92;
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (spanDays > MAX_DAYS) {
    return v1ErrorResponse(400, `range_too_large:${MAX_DAYS}_days_max`);
  }

  try {
    const week = await loadScheduleRange(from, to);
    // Date-range endpoints aren't paginated — clients narrow `from`/`to`
    // instead. Report the full count in both `pageSize` and `total` so
    // `totalPages === 1` (or 0 when empty).
    const count = week.events.length;
    return v1ListResponse(week.events, {
      page: 1,
      pageSize: Math.max(1, count),
      total: count,
    });
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_shifts_failed",
    );
  }
}

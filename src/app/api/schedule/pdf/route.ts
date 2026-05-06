import { NextResponse } from "next/server";
import { format, getISOWeek } from "date-fns";
import { loadScheduleWeek } from "@/lib/api/schedule";
import { renderSchedulePdf } from "@/lib/pdf/schedule-pdf";
import { canReachRoute } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

/** GET /api/schedule/pdf?date=YYYY-MM-DD — PDF of one week. */
export async function GET(request: Request) {
  if (!(await canReachRoute("schedule"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const anchor = dateParam ? new Date(dateParam) : new Date();
  const week = await loadScheduleWeek(anchor);
  const bytes = await renderSchedulePdf(week);

  const filename = `schedule-${format(anchor, "yyyy")}-W${String(getISOWeek(anchor)).padStart(2, "0")}.pdf`;
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

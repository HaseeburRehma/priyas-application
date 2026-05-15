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
  // Validate the date param before it flows into loadScheduleWeek —
  // `new Date("anything-garbage")` happily returns an Invalid Date object
  // that crashes deep inside the SQL date range builder with a confusing
  // error. 400 here gives the client a clear hint.
  let anchor: Date;
  if (dateParam) {
    const d = new Date(dateParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    anchor = d;
  } else {
    anchor = new Date();
  }
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

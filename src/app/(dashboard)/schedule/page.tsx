import type { Metadata } from "next";
import {
  endOfMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  addMonths,
} from "date-fns";
import { loadScheduleRange, loadScheduleWeek } from "@/lib/api/schedule";
import type { ScheduleWeek } from "@/lib/api/schedule";
import { SchedulePage } from "@/components/schedule/SchedulePage";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Einsatzplan" };
export const dynamic = "force-dynamic";

type ScheduleView = "day" | "week" | "month" | "list";
type SearchParams = { date?: string; view?: string };

function asView(v: string | undefined): ScheduleView {
  return v === "day" || v === "week" || v === "month" || v === "list"
    ? v
    : "week";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const anchor = sp.date ? new Date(sp.date) : new Date();
  const view = asView(sp.view);

  // Range for non-week views — Day = [anchor, anchor],
  // Month = full month padded to its grid (prev/next month tails included),
  // List = ±60 days centered on the anchor so the list shows a meaningful
  //        history + lookahead window without unbounded queries.
  let dataPromise: Promise<ScheduleWeek>;
  if (view === "day") {
    const dayStart = new Date(anchor);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(anchor);
    dayEnd.setHours(23, 59, 59, 999);
    dataPromise = loadScheduleRange(dayStart, dayEnd);
  } else if (view === "month") {
    // Pad the visible grid to whole Mon..Sun weeks so the calendar shows
    // greyed-out trailing days from prev/next month (standard convention).
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    dataPromise = loadScheduleRange(gridStart, gridEnd);
  } else if (view === "list") {
    const from = subMonths(anchor, 2);
    const to = addMonths(anchor, 2);
    dataPromise = loadScheduleRange(from, to);
  } else {
    dataPromise = loadScheduleWeek(anchor);
  }

  const [week, { role, userId }] = await Promise.all([
    dataPromise,
    getCurrentRole(),
  ]);

  // Resolve the viewer's *employee* row (CheckInButton gates on
  // `event.employee_id === viewerEmployeeId`, which lives in
  // `employees`, not `profiles`). Admins/dispatchers may not have an
  // employees row at all — that's fine, they don't see CheckIn.
  let viewerEmployeeId: string | null = null;
  if (userId) {
    const supabase = await createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: empRow } = await ((supabase.from("employees") as any))
      .select("id")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    viewerEmployeeId =
      (empRow as { id: string } | null)?.id ?? null;
  }

  return (
    <SchedulePage
      week={week}
      view={view}
      anchorIso={anchor.toISOString()}
      viewerRole={role}
      viewerEmployeeId={viewerEmployeeId}
    />
  );
}

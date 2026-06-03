import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadReports, type ReportRange } from "@/lib/api/reports";
import { can,
  getCurrentRole,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { ReportsPageHead } from "@/components/reports/ReportsPageHead";
import { ReportKpis } from "@/components/reports/ReportKpis";
import { RevenueChart } from "@/components/reports/RevenueChart";
import { HoursDonut } from "@/components/reports/HoursDonut";
import { ReportLibrary } from "@/components/reports/ReportLibrary";
import { NextPlannedRuns } from "@/components/reports/NextPlannedRuns";
import { LastExports } from "@/components/reports/LastExports";
import { LexwareMonthlyPanel } from "@/components/reports/LexwareMonthlyPanel";
import { loadLastMonthlyRun } from "@/app/actions/lexware-monthly-invoices";

export const metadata: Metadata = { title: "Berichte" };
export const dynamic = "force-dynamic";

const VALID: ReportRange[] = ["30d", "Q", "YTD", "12mo"];

type SearchParams = { range?: string };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Reports are dispatcher+admin only (managers + project managers).
  if (!(await can("report.alltagshilfe.view"))) redirect(routes.dashboard);

  const sp = await searchParams;
  const range: ReportRange = VALID.includes(sp.range as ReportRange)
    ? (sp.range as ReportRange)
    : "YTD";
  const data = await loadReports(range);
  const { role } = await getCurrentRole();
  const isAdmin = role === "admin";
  const lastRun = isAdmin ? await loadLastMonthlyRun() : null;

  return (
    <>
      <ReportsPageHead
        range={data.range}
        rangeStart={data.rangeStart}
        rangeEnd={data.rangeEnd}
      />
      <ReportKpis kpis={data.kpis} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <RevenueChart months={data.revenueSeries} />
        <HoursDonut
          hoursByService={data.hoursByService}
          totalHours={data.totalHours}
          rangeLabel={data.range}
          billingRatePct={data.billingRate}
          averageRateEur={data.averageRate}
        />
      </div>
      {isAdmin && <LexwareMonthlyPanel lastRun={lastRun} />}
      <ReportLibrary />
      {/*
        The next-runs strip + last-exports table mirror the prototype's
        "Next planned races" and "Last exports" sections. Both render
        with static illustrative data today; they swap to live data once
        the `report_schedules` and `export_runs` tables ship.
      */}
      <NextPlannedRuns />
      <LastExports />
    </>
  );
}

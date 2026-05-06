import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadReports, type ReportRange } from "@/lib/api/reports";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { ReportsPageHead } from "@/components/reports/ReportsPageHead";
import { ReportKpis } from "@/components/reports/ReportKpis";
import { RevenueChart } from "@/components/reports/RevenueChart";
import { HoursDonut } from "@/components/reports/HoursDonut";
import { ReportLibrary } from "@/components/reports/ReportLibrary";

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
  try {
    await requirePermission("report.alltagshilfe.view");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }

  const sp = await searchParams;
  const range: ReportRange = VALID.includes(sp.range as ReportRange)
    ? (sp.range as ReportRange)
    : "YTD";
  const data = await loadReports(range);

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
      <ReportLibrary />
    </>
  );
}

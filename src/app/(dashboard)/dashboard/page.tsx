import type { Metadata } from "next";
import { loadDashboardData } from "@/lib/api/dashboard";
import { loadMySelf } from "@/lib/api/my-self";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { TodayShifts } from "@/components/dashboard/TodayShifts";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { TeamUtilization } from "@/components/dashboard/TeamUtilization";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { MySelfPanel } from "@/components/dashboard/MySelfPanel";
import { InvoiceKpiPanel } from "@/components/dashboard/InvoiceKpiPanel";
import { loadInvoicesSummary } from "@/lib/api/invoices";
import { loadAgingReport } from "@/lib/api/invoice-aging";
import { can } from "@/lib/rbac/permissions";

export const metadata: Metadata = { title: "Übersicht" };
export const dynamic = "force-dynamic";

/**
 * Dashboard — pixel-faithful conversion of 02-dashboard.html, wired to live
 * Supabase data via the loader in src/lib/api/dashboard.ts. Server-rendered
 * to keep the initial paint fast; everything inside is plain RSC except the
 * QuickActions links.
 */
export default async function DashboardPage() {
  // Two parallel loads:
  //   - org-level dashboard data (KPIs, today's shifts, charts)
  //   - the caller's own self-service data (only present when their
  //     auth profile has a linked employees row).
  const [data, mySelf, canReadInvoices] = await Promise.all([
    loadDashboardData(),
    loadMySelf(),
    can("invoice.read"),
  ]);
  const [invoiceSummary, aging] = canReadInvoices
    ? await Promise.all([loadInvoicesSummary(), loadAgingReport()])
    : [null, null];

  return (
    <>
      <PageHead greetingName={data.greetingName} />

      {mySelf && (
        <div className="mb-6">
          <MySelfPanel data={mySelf} />
        </div>
      )}

      <KpiGrid kpis={data.kpis} />

      {/* Main grid: chart (2/3) + today's shifts (1/3) on desktop, stacked
          below 1024px to match the prototype's media query. */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <WeeklyChart data={data.chart} />
        <TodayShifts
          shifts={data.todayShifts}
          pendingCount={data.kpis.todayShifts.pendingCheckins}
        />
      </div>

      {invoiceSummary && aging && (
        <div className="mb-6">
          <InvoiceKpiPanel summary={invoiceSummary} aging={aging.totals} />
        </div>
      )}

      {/* Secondary grid: activity feed + (team utilization stacked over
          quick actions). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RecentActivity items={data.activities} />
        <div className="flex flex-col gap-5">
          <TeamUtilization team={data.teamLoad} />
          <QuickActions />
        </div>
      </div>
    </>
  );
}

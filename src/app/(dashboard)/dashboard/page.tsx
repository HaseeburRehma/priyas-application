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
 * Dashboard — server-rendered from live Supabase data.
 *
 * Access model: the org-wide overview (client / property / invoice KPIs,
 * team utilization, cross-employee activity feed) is management-only.
 * Field staff (`employee` role) see a personal-scope dashboard: their
 * own hours / vacation / training + their own upcoming shifts. Nothing
 * else, because "how many active clients" and "how much is unpaid"
 * are business KPIs they don't need — and "team utilization" leaks
 * colleagues' hours, which is PII.
 *
 * `time.read_all` is the natural gate — it already means "can see
 * cross-employee data" (used by time-tracking + report screens), so
 * reusing it here keeps the RBAC surface small.
 */
export default async function DashboardPage() {
  const [mySelf, canSeeOrgOverview, canReadInvoices, canCreateClient] =
    await Promise.all([
      loadMySelf(),
      can("time.read_all"),
      can("invoice.read"),
      can("client.create"),
    ]);

  // Only pay for the org-wide loader when the caller can actually see
  // its contents. Field staff skip the query entirely — cheaper AND
  // means a compromised employee session can never surface org KPIs
  // by tampering with the client bundle.
  const data = canSeeOrgOverview ? await loadDashboardData() : null;
  const [invoiceSummary, aging] = canReadInvoices
    ? await Promise.all([loadInvoicesSummary(), loadAgingReport()])
    : [null, null];

  // Personal-scope name for the greeting: prefer the caller's own
  // profile name, fall back to the org loader when available, then to
  // a neutral placeholder.
  const greetingName =
    mySelf?.full_name ?? data?.greetingName ?? "";

  return (
    <>
      <PageHead
        greetingName={greetingName}
        canCreateClient={canCreateClient}
      />

      {mySelf && (
        <div className="mb-6">
          <MySelfPanel data={mySelf} />
        </div>
      )}

      {/* Everything below is org-scope. Field staff never sees it. */}
      {canSeeOrgOverview && data && (
        <>
          <KpiGrid kpis={data.kpis} />

          {/* Main grid: chart (2/3) + today's shifts (1/3) on desktop,
              stacked below 1024px to match the prototype's media
              query. */}
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

          {/* Secondary grid: activity feed + (team utilization stacked
              over quick actions). */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <RecentActivity items={data.activities} />
            <div className="flex flex-col gap-5">
              <TeamUtilization team={data.teamLoad} />
              <QuickActions />
            </div>
          </div>
        </>
      )}
    </>
  );
}

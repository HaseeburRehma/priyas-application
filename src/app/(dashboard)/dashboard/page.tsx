import type { Metadata } from "next";
import { Suspense } from "react";
import { loadDashboardData } from "@/lib/api/dashboard";
import { loadMySelf } from "@/lib/api/my-self";
import { loadPmWidget } from "@/lib/api/pm-widget";
import { PageHead } from "@/components/dashboard/PageHead";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { TodayShifts } from "@/components/dashboard/TodayShifts";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { TeamUtilization } from "@/components/dashboard/TeamUtilization";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { MySelfPanel } from "@/components/dashboard/MySelfPanel";
import { MyFilesAndNotesWidget } from "@/components/dashboard/MyFilesAndNotesWidget";
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
 * Rendering strategy: the header + personal panel gate on cached auth
 * only (one round-trip, primed by the layout) and paint immediately.
 * The three heavy sections — PM widget, org overview, invoice KPIs —
 * each own an async server component wrapped in `<Suspense>` so they
 * stream in independently. A slow invoice query no longer blocks the
 * KPI grid; a slow chart no longer blocks the PM widget. Skeletons
 * hold shape so the layout doesn't jump when a section arrives.
 */
export default async function DashboardPage() {
  const [mySelf, canSeeOrgOverview, canReadInvoices, canCreateClient] =
    await Promise.all([
      loadMySelf(),
      can("time.read_all"),
      can("invoice.read"),
      can("client.create"),
    ]);

  const greetingName = mySelf?.full_name ?? "";

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

      {/* Feature-update #19: PM "My Files & Notes" widget — sits ABOVE
       *  the KPI grid so it's the first thing a manager sees on
       *  every dashboard visit. Client explicitly asked for it to be
       *  "at the top, not buried in a submenu". Its loader runs in
       *  parallel with the KPI grid via streaming. */}
      {canSeeOrgOverview && (
        <Suspense fallback={<WidgetSkeleton height={220} />}>
          <PmWidgetSection />
        </Suspense>
      )}

      {/* Org overview — KPI grid + weekly chart + today's shifts +
       *  activity + team utilization. All fed by the same loader so
       *  they stream in as one section, but the section as a whole
       *  no longer blocks the PM widget above or the invoice panel
       *  below. */}
      {canSeeOrgOverview && (
        <Suspense fallback={<OrgOverviewSkeleton />}>
          <OrgOverviewSection />
        </Suspense>
      )}

      {/* Invoice KPIs live at the bottom of the fold — safe to stream
       *  in last so the eye-catching numbers up top land first. */}
      {canReadInvoices && (
        <Suspense fallback={<WidgetSkeleton height={220} className="mb-6" />}>
          <InvoicePanelSection />
        </Suspense>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Streaming sections — each one owns its own loader chain so React
 * Server Components can flush them independently as data arrives.
 * ──────────────────────────────────────────────────────────────── */

async function PmWidgetSection() {
  const pmWidget = await loadPmWidget();
  return (
    <MyFilesAndNotesWidget notes={pmWidget.notes} files={pmWidget.files} />
  );
}

async function OrgOverviewSection() {
  const data = await loadDashboardData();
  return (
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
  );
}

async function InvoicePanelSection() {
  const [invoiceSummary, aging] = await Promise.all([
    loadInvoicesSummary(),
    loadAgingReport(),
  ]);
  if (!invoiceSummary || !aging) return null;
  return (
    <div className="mb-6">
      <InvoiceKpiPanel summary={invoiceSummary} aging={aging.totals} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Skeletons — shape-preserving placeholders that keep the page
 * layout stable while each section streams in.
 * ──────────────────────────────────────────────────────────────── */

function WidgetSkeleton({
  height,
  className = "",
}: {
  height: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={
        "mb-6 animate-pulse rounded-lg border border-neutral-100 bg-white " +
        className
      }
      style={{ minHeight: height }}
    />
  );
}

function OrgOverviewSkeleton() {
  return (
    <>
      <div
        aria-hidden
        className="mb-6 grid animate-pulse grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-lg border border-neutral-100 bg-white"
          />
        ))}
      </div>
      <div
        aria-hidden
        className="mb-6 grid animate-pulse grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]"
      >
        <div className="h-[320px] rounded-lg border border-neutral-100 bg-white" />
        <div className="h-[320px] rounded-lg border border-neutral-100 bg-white" />
      </div>
    </>
  );
}

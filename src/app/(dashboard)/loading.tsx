import {
  PageHeadSkeleton,
  KpiStripSkeleton,
  TableSkeleton,
} from "@/components/shared/Skeleton";

/**
 * Group-level fallback for every /(dashboard)/** route that doesn't
 * define its own loading.tsx. Renders instantly on click so the user
 * sees "the page is on its way" instead of the previous page sitting
 * frozen while the server component fetches.
 *
 * Individual routes override this file with a more shape-accurate
 * skeleton where it matters (dashboard, clients, invoices, schedule).
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeadSkeleton />
      <KpiStripSkeleton />
      <TableSkeleton rows={7} />
    </div>
  );
}

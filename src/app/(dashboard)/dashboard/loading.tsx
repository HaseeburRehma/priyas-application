import {
  Skeleton,
  PageHeadSkeleton,
  KpiStripSkeleton,
} from "@/components/shared/Skeleton";

/**
 * Dashboard skeleton — mirrors the real page: greeting + MySelfPanel
 * card + PM widget + KPI strip + chart+shifts row + activity+team row.
 * The real page also has three internal <Suspense> boundaries, but
 * this file fires FIRST on every click, before the server component
 * begins streaming, so the frame settles instantly.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeadSkeleton />

      {/* MySelfPanel */}
      <div className="mb-6">
        <Skeleton className="h-[180px] w-full rounded-lg bg-white" />
      </div>

      {/* PM widget */}
      <Skeleton className="mb-6 h-[220px] w-full rounded-lg bg-white" />

      <KpiStripSkeleton />

      {/* Chart + today's shifts */}
      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[320px] rounded-lg bg-white" />
        <Skeleton className="h-[320px] rounded-lg bg-white" />
      </div>

      {/* Activity + team */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Skeleton className="h-[280px] rounded-lg bg-white" />
        <Skeleton className="h-[280px] rounded-lg bg-white" />
      </div>
    </div>
  );
}

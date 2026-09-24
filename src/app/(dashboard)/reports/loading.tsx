import {
  Skeleton,
  PageHeadSkeleton,
  KpiStripSkeleton,
} from "@/components/shared/Skeleton";

/**
 * Reports skeleton — KPI strip on top, revenue chart + hours donut in
 * the middle row, then the report library card and Lexware monthly
 * panel. Matches the real page's grid so the transition into data is
 * unnoticeable.
 */
export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeadSkeleton />
      <KpiStripSkeleton />

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[320px] rounded-lg bg-white" />
        <Skeleton className="h-[320px] rounded-lg bg-white" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Skeleton className="h-[240px] rounded-lg bg-white" />
        <Skeleton className="h-[240px] rounded-lg bg-white" />
      </div>

      <Skeleton className="h-[200px] rounded-lg bg-white" />
    </div>
  );
}

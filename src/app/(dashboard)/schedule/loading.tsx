import { Skeleton, PageHeadSkeleton } from "@/components/shared/Skeleton";

/**
 * Schedule skeleton — 7-column week grid with time-of-day rows. The
 * real SchedulePage takes several server round-trips (range + week +
 * dispatcher permissions), which is why the click-to-paint was
 * particularly bad here before this fallback existed.
 */
export default function ScheduleLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeadSkeleton />

      {/* Week navigator */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-6 w-52" />
        <Skeleton className="ml-auto h-9 w-28 rounded-md" />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* 7-day grid */}
      <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-neutral-100 bg-neutral-50">
          <div className="border-r border-neutral-100 px-2 py-3" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="border-r border-neutral-100 px-3 py-3 last:border-r-0"
            >
              <Skeleton className="mb-1 h-3 w-8" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, r) => (
          <div
            key={r}
            className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-neutral-100 last:border-b-0"
          >
            <div className="flex items-center justify-end border-r border-neutral-100 px-3 py-4">
              <Skeleton className="h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, c) => (
              <div
                key={c}
                className="min-h-[64px] border-r border-neutral-100 p-2 last:border-r-0"
              >
                {(r + c) % 3 === 0 && (
                  <Skeleton className="h-full w-full rounded-sm bg-primary-100" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils/cn";

/**
 * Shape-preserving placeholder blocks. Composed by every route's
 * loading.tsx so the click-to-paint gap on navigation is filled with
 * something the reader can parse ("a table is coming") instead of a
 * blank frame. All sizes match the real components' final dimensions
 * to keep the layout from shifting when data arrives.
 *
 * `animate-pulse` gives the shimmer; we deliberately avoid the fancier
 * gradient-swipe animation because it costs a repainting layer and
 * defeats the "cheap and instant" purpose of a skeleton.
 */
export function Skeleton({
  className = "",
  as: Tag = "div",
}: {
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  return (
    <Tag
      aria-hidden
      className={cn(
        "animate-pulse rounded-sm bg-neutral-200/70",
        className,
      )}
    />
  );
}

/** Header strip: title + subtitle + action button on the right. */
export function PageHeadSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
    </div>
  );
}

/** 4-tile KPI strip — matches every summary strip in the app. */
export function KpiStripSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-[104px] animate-pulse rounded-lg border border-neutral-100 bg-white"
        />
      ))}
    </div>
  );
}

/** Row-of-chips filter strip. */
export function FilterChipsSkeleton() {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
  );
}

/**
 * Table skeleton — header row + `rows` body rows. Column widths
 * roughly match the real table so the shimmer reads as "table
 * incoming" rather than "generic rectangle".
 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_88px] gap-4 border-b border-neutral-100 bg-neutral-50 px-5 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid grid-cols-[1.4fr_1fr_1fr_1fr_88px] items-center gap-4 border-b border-neutral-100 px-5 py-4 last:border-b-0"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="ml-auto h-4 w-6" />
        </div>
      ))}
    </div>
  );
}

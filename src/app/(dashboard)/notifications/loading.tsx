import { Skeleton, PageHeadSkeleton } from "@/components/shared/Skeleton";

/**
 * Notifications skeleton — grouped-by-day list. Repeats a
 * "day-header + rows" pattern that matches the real page's structure.
 */
export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-6">
      <PageHeadSkeleton />

      {Array.from({ length: 3 }).map((_, g) => (
        <section key={g} className="mb-6">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4 last:border-b-0"
              >
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

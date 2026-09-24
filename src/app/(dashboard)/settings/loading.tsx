import { Skeleton, PageHeadSkeleton } from "@/components/shared/Skeleton";

/**
 * Settings skeleton — sidebar nav + main form panel. The real page
 * paints a two-column grid; we mirror the widths so the settings
 * nav does not jump 240px sideways when the server component
 * hydrates.
 */
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeadSkeleton />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className={
                "h-9 rounded-md " + (i === 0 ? "bg-primary-100" : "")
              }
            />
          ))}
        </nav>

        {/* Panel */}
        <div className="rounded-lg border border-neutral-100 bg-white p-6">
          <Skeleton className="mb-2 h-6 w-48" />
          <Skeleton className="mb-6 h-4 w-72" />

          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

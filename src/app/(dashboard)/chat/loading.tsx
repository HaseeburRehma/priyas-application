import { Skeleton } from "@/components/shared/Skeleton";

/**
 * Chat skeleton — split-pane layout: channel list on the left, thread
 * on the right. Matches the real ChatPage grid so the moment the
 * server component swaps in there is zero visual jump.
 */
export default function ChatLoading() {
  return (
    <div className="grid h-[calc(100vh-64px)] grid-cols-[280px_1fr] gap-0">
      {/* Channel list */}
      <div className="border-r border-neutral-100 bg-white">
        <div className="border-b border-neutral-100 p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-sm px-3 py-2.5"
            >
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-col bg-tertiary-200">
        <div className="flex items-center gap-3 border-b border-neutral-100 bg-white px-6 py-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}
            >
              <Skeleton
                className="h-14 rounded-lg bg-white"
                {...({ style: { width: `${180 + ((i * 47) % 220)}px` } } as {
                  style: { width: string };
                })}
              />
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-100 bg-white p-4">
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

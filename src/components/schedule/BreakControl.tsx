"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import {
  breakAction,
  getShiftLifecycleAction,
} from "@/app/actions/time-entries";

/**
 * Pause start / end button rendered alongside `<CheckInButton />`
 * inside the schedule shift card. The control fetches its own state
 * on mount via `getShiftLifecycleAction` so it shows the right label
 * ("Start break" vs "End break") without forcing the parent loader to
 * thread break-state through.
 *
 * State machine, mirrored from the server action:
 *   1. Not yet checked in → component renders nothing.
 *   2. Checked in, no open break → "Pause starten" button (warning tone).
 *   3. Currently on a break → "Pause beenden" button (success tone), and
 *      a "Auf Pause seit HH:mm" hint underneath.
 *   4. Already checked out → component renders nothing.
 *
 * Both actions are rate-limited server-side.
 */
export function BreakControl({ shiftId }: { shiftId: string }) {
  const t = useTranslations("schedule.break");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(true);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState<Date | null>(null);

  // Fetch the lifecycle state once on mount. We don't poll — the
  // `router.refresh()` after each click re-renders this component,
  // which re-runs the effect and reflects the new state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getShiftLifecycleAction(shiftId);
      if (cancelled) return;
      if (r.ok) {
        setCheckedIn(r.data.checkedIn);
        setCheckedOut(r.data.checkedOut);
        setOnBreak(r.data.onBreak);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  // Live break-timer: when on a break, count up from the moment the
  // local state flipped. The exact start timestamp isn't fetched
  // separately — when the click handler succeeds we capture
  // `Date.now()` so the UI shows real elapsed time without an
  // extra round-trip.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!onBreak) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [onBreak]);

  if (loading) {
    return (
      <div className="h-9 animate-pulse rounded-md bg-neutral-100" />
    );
  }
  if (!checkedIn || checkedOut) {
    // Nothing to show — the CheckInButton handles those states.
    return null;
  }

  async function fire(kind: "break_start" | "break_end") {
    start(async () => {
      const r = await breakAction({ shift_id: shiftId, kind });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (kind === "break_start") {
        setOnBreak(true);
        setBreakStartedAt(new Date());
        toast.success(t("startedToast"));
      } else {
        setOnBreak(false);
        setBreakStartedAt(null);
        toast.success(t("endedToast"));
      }
      // Refresh the parent so any computed totals (hours-this-week,
      // payroll preview) update.
      router.refresh();
    });
  }

  const elapsed = breakStartedAt
    ? formatElapsed(Date.now() - breakStartedAt.getTime())
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      {onBreak ? (
        <button
          type="button"
          onClick={() => fire("break_end")}
          disabled={pending}
          className={cn(
            "btn w-full bg-success-500 text-white hover:bg-success-700",
            pending && "opacity-80",
          )}
          style={{ minHeight: 48, fontSize: 14 }}
        >
          {pending ? "…" : t("endLabel")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fire("break_start")}
          disabled={pending}
          className={cn(
            "btn w-full bg-warning-500 text-white hover:bg-warning-700",
            pending && "opacity-80",
          )}
          style={{ minHeight: 48, fontSize: 14 }}
        >
          {pending ? "…" : t("startLabel")}
        </button>
      )}
      <span className="text-center text-[11px] text-neutral-500">
        {onBreak
          ? elapsed
            ? t("onBreakWithTimer", { elapsed })
            : t("onBreak")
          : t("hint")}
      </span>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

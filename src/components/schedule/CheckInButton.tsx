"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import {
  checkInAction,
  completeShiftAction,
} from "@/app/actions/time-entries";

type Props = {
  shiftId: string;
  /** ISO timestamp; we use it to know whether to show "Check in" or
   *  "Check out" by default. */
  startsAt: string;
  endsAt: string;
  /** Most-recent kind already recorded for this shift, if any. Drives the
   *  default action: undefined → check_in, "check_in" → check_out, both → done. */
  lastEntryKind: "check_in" | "check_out" | null;
  /** Set when the staff member has marked the shift complete. */
  completed: boolean;
};

type Pos = {
  latitude: number;
  longitude: number;
  accuracy_m: number;
};

const GEOLOCATION_TIMEOUT_MS = 15_000;

function getCurrentPosition(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy_m: p.coords.accuracy,
        }),
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: 0,
      },
    );
  });
}

export function CheckInButton({
  shiftId,
  startsAt,
  endsAt,
  lastEntryKind,
  completed,
}: Props) {
  const t = useTranslations("schedule.checkin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);

  const isCheckedIn = lastEntryKind === "check_in";
  const isCheckedOut = lastEntryKind === "check_out";

  // Decide which mode the big button is in.
  const mode: "check_in" | "check_out" | "complete" | "done" = completed
    ? "done"
    : isCheckedOut
      ? "complete"
      : isCheckedIn
        ? "check_out"
        : "check_in";

  async function handleCheckIn(kind: "check_in" | "check_out") {
    setLocating(true);
    let pos: Pos;
    try {
      pos = await getCurrentPosition();
    } catch {
      toast.error(t("locationDenied"));
      setLocating(false);
      return;
    }
    setLocating(false);
    start(async () => {
      const r = await checkInAction({
        shift_id: shiftId,
        kind,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy_m: pos.accuracy_m,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        kind === "check_in"
          ? t("checkedIn", { default: "Checked in." })
          : t("checkedOut", { default: "Checked out." }),
      );
      router.refresh();
    });
  }

  function handleComplete() {
    start(async () => {
      const r = await completeShiftAction(shiftId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("completed"));
      router.refresh();
    });
  }

  const busy = pending || locating;
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const now = Date.now();
  const inWindow = now >= startMs - 30 * 60_000 && now <= endMs + 60 * 60_000;

  // Pick label + colour by mode.
  const config: Record<
    typeof mode,
    { label: string; sublabel: string; cls: string; onClick: () => void }
  > = {
    check_in: {
      label: t("checkInLabel"),
      sublabel: inWindow ? t("nowInRange") : t("notInWindow"),
      cls: "btn--primary",
      onClick: () => handleCheckIn("check_in"),
    },
    check_out: {
      label: t("checkOutLabel"),
      sublabel: t("checkedInAlready"),
      cls: "btn--tertiary",
      onClick: () => handleCheckIn("check_out"),
    },
    complete: {
      label: t("markCompleteLabel"),
      sublabel: t("checkedOutAlready"),
      cls: "btn--primary",
      onClick: handleComplete,
    },
    done: {
      label: t("doneLabel"),
      sublabel: "",
      cls: "btn--ghost border border-success-300 text-success-700",
      onClick: () => undefined,
    },
  };

  const c = config[mode];

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={c.onClick}
        disabled={busy || mode === "done"}
        className={cn(
          "btn w-full",
          c.cls,
          (busy || mode === "done") && "opacity-80",
        )}
        style={{ minHeight: 56, fontSize: 14 }}
      >
        {locating
          ? t("locating")
          : pending
            ? "…"
            : c.label}
      </button>
      {c.sublabel && (
        <span className="text-center text-[11px] text-neutral-500">
          {c.sublabel}
        </span>
      )}
    </div>
  );
}

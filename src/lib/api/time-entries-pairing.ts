import "server-only";

/**
 * Shared check-in/check-out pairing for `time_entries`.
 *
 * The table stores one row per clock event (`kind: "check_in" | "check_out"
 * | "break_start" | "break_end"`, `occurred_at`) — this has been the shape
 * since migration `20260504_000018_time_entries.sql` redesigned it. Several
 * older readers (dashboard/reports/alltagshilfe/employee-detail KPIs) still
 * queried the table's original one-row-per-shift columns
 * (`check_in_at`/`check_out_at`/`break_minutes`), which `checkInAction` has
 * never populated since that redesign — those readers were silently
 * computing zero hours for every real check-in.
 *
 * This mirrors the pairing already used correctly in
 * `src/app/actions/shift-billing.ts` / `src/lib/api/shift-billing.ts` and
 * `src/app/api/reports/working-time/route.ts`. It intentionally does not
 * subtract break time — none of those canonical readers do either; break
 * duration would need to come from summing `break_start`/`break_end` pairs
 * separately, which is out of scope here.
 */

export type TimeEntryEventRow = {
  shift_id: string | null;
  employee_id: string | null;
  kind: string;
  occurred_at: string;
};

export type PairedTimeEntry = {
  shift_id: string | null;
  employee_id: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

/**
 * Group raw check_in/check_out event rows into one paired record per
 * (shift_id, employee_id). Rows with any other `kind` (break_start/
 * break_end) are ignored. A pair with only a check-in (still on shift) or
 * only a check-out (shouldn't happen, but data can be messy) still comes
 * back with the other side `null` — callers already handle that by
 * skipping records with no `check_out_at` when computing hours.
 */
export function pairCheckInOutEvents(
  rows: ReadonlyArray<TimeEntryEventRow>,
): PairedTimeEntry[] {
  const buckets = new Map<string, PairedTimeEntry>();
  for (const r of rows) {
    if (r.kind !== "check_in" && r.kind !== "check_out") continue;
    const key = `${r.shift_id ?? "?"}|${r.employee_id ?? "?"}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        shift_id: r.shift_id,
        employee_id: r.employee_id,
        check_in_at: null,
        check_out_at: null,
      };
      buckets.set(key, b);
    }
    if (r.kind === "check_in") b.check_in_at = r.occurred_at;
    else b.check_out_at = r.occurred_at;
  }
  return Array.from(buckets.values());
}

/** Hours between a pair's check-in and check-out, or 0 if incomplete. */
export function pairedHours(pair: PairedTimeEntry): number {
  if (!pair.check_in_at || !pair.check_out_at) return 0;
  const ms =
    new Date(pair.check_out_at).getTime() - new Date(pair.check_in_at).getTime();
  return Math.max(0, ms / 3_600_000);
}

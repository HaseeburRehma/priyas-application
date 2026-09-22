/**
 * Feature-update #18 (mobile write side) · Cleaning-supply flags.
 *
 * Field staff can end a shift and tap "Reinigungsmittel melden" to
 * record whether the customer still has enough supplies for next
 * time. The PM sees the result on the client's detail page
 * (`SupplyFlagsCard`) — the web write UI is deliberately absent so
 * only the person on-site can flip the flag.
 *
 * Inserts go through the outbox so an out-of-range end-of-shift
 * flag still lands after the phone reconnects.
 */

import { enqueue, drain, type OutboxAction } from "@/lib/outbox";
import { getSupabase } from "@/lib/supabase";

export type CreateSupplyFlagInput = {
  orgId: string;
  employeeId: string;
  propertyId: string;
  suppliesOk: boolean;
  note: string | null;
};

export async function createSupplyFlag(
  input: CreateSupplyFlagInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();

  // Dedupe on employee + property + supplies_ok + minute-truncated
  // timestamp — same recipe the time_entry/damage outbox actions use.
  // Minute granularity is fine: if the user taps twice inside 60s we
  // treat it as the same submission.
  const iso = new Date().toISOString();
  const minute = iso.slice(0, 16); // YYYY-MM-DDTHH:MM
  const dedupe = `supply:${input.employeeId}:${input.propertyId}:${
    input.suppliesOk ? "ok" : "missing"
  }:${minute}`;

  const row = {
    org_id: input.orgId,
    property_id: input.propertyId,
    reported_by: input.employeeId,
    supplies_ok: input.suppliesOk,
    note: input.note,
    reported_at: iso,
  };

  // Fast path: try the insert now. On failure (offline, timeout),
  // fall back to the outbox and try again on next foreground.
  try {
    const { error } = await supabase.from("supply_flags").insert(row);
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: true }; // dedupe on retry
    // Fall through to queue on transient errors
    const action: OutboxAction = {
      kind: "supply_flag_create",
      dedupe_key: dedupe,
      row,
    };
    await enqueue(action);
    // Best-effort second attempt through the outbox drain — if we
    // just briefly lost the connection between our online-checks the
    // drain may succeed and the queued entry disappears.
    void drain().catch(() => {});
    return { ok: true };
  } catch {
    const action: OutboxAction = {
      kind: "supply_flag_create",
      dedupe_key: dedupe,
      row,
    };
    await enqueue(action);
    return { ok: true };
  }
}

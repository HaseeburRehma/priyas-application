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
 *
 * The `supply_flags` table requires `client_id`, which the mobile
 * screen only knows via the picked property. We resolve it here in
 * one small round-trip so the caller doesn't have to fan-out the
 * lookup — cached properties in the picker query would also work,
 * but this keeps the module standalone and avoids react-query
 * coupling in the outbox drain path (which has no cache).
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

  // Resolve the client_id from the picked property. RLS ensures the
  // caller can only read properties in their org, so an invalid id
  // here just returns no row and the insert is aborted with a clear
  // error rather than queued into the outbox forever.
  const { data: prop } = await supabase
    .from("properties")
    .select("client_id")
    .eq("id", input.propertyId)
    .maybeSingle();
  const clientId = (prop as { client_id: string } | null)?.client_id ?? null;
  if (!clientId) {
    return { ok: false, error: "property_not_found_or_no_client" };
  }

  // Dedupe on employee + property + supplies_ok + minute-truncated
  // timestamp — same recipe the time_entry/damage outbox actions use.
  // Minute granularity is fine: if the user taps twice inside 60s we
  // treat it as the same submission.
  const iso = new Date().toISOString();
  const minute = iso.slice(0, 16); // YYYY-MM-DDTHH:MM
  const dedupe = `supply:${input.employeeId}:${input.propertyId}:${
    input.suppliesOk ? "ok" : "missing"
  }:${minute}`;

  // Row shape matches migration 20260921_000062 — client_id required,
  // `created_at` defaults to NOW() server-side (no `reported_at`
  // column exists), and `resolved` defaults to false.
  const row = {
    org_id: input.orgId,
    client_id: clientId,
    property_id: input.propertyId,
    reported_by: input.employeeId,
    supplies_ok: input.suppliesOk,
    note: input.note,
  };

  // Fast path: try the insert now. On failure (offline, timeout),
  // fall back to the outbox and try again on next foreground.
  try {
    const { error } = await supabase.from("supply_flags").insert(row);
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: true }; // dedupe on retry
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

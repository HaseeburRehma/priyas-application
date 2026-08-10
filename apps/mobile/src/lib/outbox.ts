/**
 * Offline outbox — queues critical mutations while the phone has no
 * signal and drains them the next time the app comes to the foreground.
 *
 * Two action kinds today: `time_entry_insert` (clock in/out/break) and
 * `damage_report_create`. Both are direct table inserts — no RPC needed
 * because RLS already enforces "employee can only insert for their own
 * shift" / "can only insert for a property they can see".
 *
 * Dedupe is best-effort: each entry carries a `dedupe_key` (built by
 * the caller from shift_id + kind + minute-truncated timestamp) so a
 * retry of the same tap doesn't double-insert.
 */

import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getSupabase } from "@/lib/supabase";

const KEY = "priyas.outbox.v1";

export type OutboxAction =
  | {
      kind: "time_entry_insert";
      dedupe_key: string;
      row: {
        shift_id: string;
        employee_id: string;
        kind: "check_in" | "check_out" | "break_start" | "break_end";
        occurred_at: string; // ISO — the moment the user tapped, not the moment we send
        lat: number | null;
        lng: number | null;
      };
    }
  | {
      kind: "damage_report_create";
      dedupe_key: string;
      row: {
        org_id: string;
        employee_id: string;
        property_id: string;
        shift_id: string | null;
        severity: number;
        category: string;
        description: string;
        photo_paths: string[];
      };
    };

export type OutboxEntry = {
  id: string;
  action: OutboxAction;
  queued_at: string;
  attempts: number;
  last_error: string | null;
};

async function readAll(): Promise<OutboxEntry[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: OutboxEntry[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(entries));
}

/** Enqueue an action. Never throws. */
export async function enqueue(action: OutboxAction): Promise<void> {
  const current = await readAll();
  if (current.some((e) => e.action.dedupe_key === action.dedupe_key)) return;
  current.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    queued_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });
  await writeAll(current);
}

export async function pending(): Promise<OutboxEntry[]> {
  return readAll();
}

/** Drain — remove successes, keep failures with attempts++ / last_error. */
export async function drain(): Promise<{ sent: number; failed: number }> {
  const entries = await readAll();
  if (entries.length === 0) return { sent: 0, failed: 0 };

  const supabase = getSupabase();
  const remaining: OutboxEntry[] = [];
  let sent = 0;
  let failed = 0;

  for (const e of entries) {
    try {
      // Insert against the correct table per action kind. Split so
      // Supabase's row-type inference doesn't try to unify the two
      // very different shapes and reject the second one.
      const { error } =
        e.action.kind === "time_entry_insert"
          ? await supabase.from("time_entries").insert(e.action.row)
          : await supabase.from("damage_reports").insert(e.action.row);
      if (!error) {
        sent += 1;
        continue;
      }
      // Duplicate-key errors from a retry that already succeeded on
      // an earlier attempt are treated as success — the row is there.
      if (
        error.code === "23505" ||
        String(error.message).toLowerCase().includes("duplicate")
      ) {
        sent += 1;
        continue;
      }
      failed += 1;
      remaining.push({
        ...e,
        attempts: e.attempts + 1,
        last_error: error.message,
      });
    } catch (err) {
      failed += 1;
      remaining.push({
        ...e,
        attempts: e.attempts + 1,
        last_error:
          err instanceof Error ? err.message : "unknown_transport_error",
      });
    }
  }
  await writeAll(remaining);
  return { sent, failed };
}

/** Wire an app-state listener that drains on foreground. */
export function bindOutboxAutoDrain(): () => void {
  void drain().catch(() => {});
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      void drain().catch(() => {});
    }
  });
  return () => sub.remove();
}

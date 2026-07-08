import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PendingBillingShift = {
  id: string;
  startsAt: string;
  endsAt: string;
  scheduledMinutes: number;
  actualMinutes: number | null;
  clientId: string;
  clientName: string;
  propertyName: string;
  employeeName: string | null;
};

/**
 * Completed shifts still sitting in `billing_status = 'pending'` — the
 * queue the "Freigabe für Abrechnung" page works through. Mirrors the
 * check-in/check-out aggregation in `loadWeekSchedule()` (schedule.ts) so
 * the previewed hours match what the employee actually logged.
 */
export async function loadPendingBillingShifts(): Promise<PendingBillingShift[]> {
  const supabase = await createSupabaseServerClient();
  // Single-level `!inner` join (property_id -> properties), matching the
  // proven pattern in invoice-draft.ts's prepareDraftForRange — avoids an
  // unverified double-nested `!inner` embed for the client relation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("shifts") as any))
    .select(
      `id, starts_at, ends_at,
       property:properties!inner ( id, name, client_id ),
       employee:employees ( full_name )`,
    )
    .eq("status", "completed")
    .eq("billing_status", "pending")
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw error;

  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    property: { id: string; name: string; client_id: string } | null;
    employee: { full_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const clientIds = Array.from(
    new Set(rows.map((r) => r.property?.client_id).filter((id): id is string => Boolean(id))),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clientRows } = await ((supabase.from("clients") as any))
    .select("id, display_name")
    .in("id", clientIds);
  const clientNameById = new Map(
    ((clientRows ?? []) as Array<{ id: string; display_name: string }>).map((c) => [c.id, c.display_name]),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entryRows } = await ((supabase.from("time_entries") as any))
    .select("shift_id, kind, occurred_at")
    .in("shift_id", rows.map((r) => r.id))
    .in("kind", ["check_in", "check_out"]);
  type EntryRow = { shift_id: string; kind: string; occurred_at: string };
  const byShift = new Map<string, { in?: number; out?: number }>();
  for (const e of (entryRows ?? []) as EntryRow[]) {
    const p = byShift.get(e.shift_id) ?? {};
    const t = new Date(e.occurred_at).getTime();
    if (e.kind === "check_in") p.in = t;
    if (e.kind === "check_out") p.out = t;
    byShift.set(e.shift_id, p);
  }

  return rows
    .filter((r) => r.property?.client_id && clientNameById.has(r.property.client_id))
    .map((r) => {
      const pair = byShift.get(r.id);
      const actualMinutes =
        pair?.in != null && pair?.out != null
          ? Math.round((pair.out - pair.in) / 60_000)
          : null;
      return {
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        scheduledMinutes: Math.round(
          (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60_000,
        ),
        actualMinutes,
        clientId: r.property!.client_id,
        clientName: clientNameById.get(r.property!.client_id)!,
        propertyName: r.property!.name,
        employeeName: r.employee?.full_name ?? null,
      };
    });
}

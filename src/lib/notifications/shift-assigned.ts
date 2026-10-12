import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emitNotification } from "@/lib/notifications/emit";

/**
 * Tell field staff they've been put on a shift — in-app notification +
 * push (browser and phone) + WhatsApp when the org has the "shift
 * change" toggle on.
 *
 * Called after a shift is created with an employee, reassigned to a new
 * employee, or bulk-imported. Several shifts for the same person (CSV
 * import) collapse into one summary so nobody gets thirty pushes.
 * Shifts that already ended are skipped (back-filled history), as is the
 * person doing the assigning. Best-effort: never throws.
 */

const TZ = "Europe/Berlin";
const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

type ShiftRow = {
  id: string;
  org_id: string;
  starts_at: string;
  ends_at: string;
  employee: { profile_id: string | null } | null;
  property: {
    name: string | null;
    address_line1: string | null;
    city: string | null;
  } | null;
};

export async function notifyShiftAssigned(
  shiftIds: string[],
  opts: {
    /** Profile id of whoever assigned the shift — they aren't notified. */
    actorId?: string | null;
    /** See `emitNotification` — needed outside a cookie session. */
    client?: SupabaseClient;
  } = {},
): Promise<void> {
  const ids = Array.from(new Set(shiftIds.filter(Boolean)));
  if (ids.length === 0) return;
  try {
    const supabase = (opts.client ??
      (await createSupabaseServerClient())) as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("shifts")
      .select(
        `id, org_id, starts_at, ends_at,
         employee:employees ( profile_id ),
         property:properties ( name, address_line1, city )`,
      )
      .in("id", ids)
      .is("deleted_at", null)
      .gt("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[notifications] shift lookup failed", error.message);
      return;
    }

    const byProfile = new Map<string, ShiftRow[]>();
    for (const s of (data ?? []) as unknown as ShiftRow[]) {
      const profileId = s.employee?.profile_id;
      if (!profileId || profileId === opts.actorId) continue;
      const list = byProfile.get(profileId) ?? [];
      list.push(s);
      byProfile.set(profileId, list);
    }

    await Promise.all(
      Array.from(byProfile, ([profileId, shifts]) =>
        emitNotification(
          { user_id: profileId, org_id: shifts[0]!.org_id, push: true, ...messageFor(shifts) },
          opts.client,
        ),
      ),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notifications] shift-assigned failed", err);
  }
}

function messageFor(shifts: ShiftRow[]): {
  category: "shift_assigned";
  title: string;
  body: string;
  link_url: string;
} {
  const first = shifts[0]!;
  const start = new Date(first.starts_at);
  if (shifts.length > 1) {
    return {
      category: "shift_assigned",
      title: `${shifts.length} neue Einsätze geplant`,
      body: `Ab ${dayFmt.format(start)} – alle Details im Einsatzplan.`,
      link_url: "/schedule",
    };
  }
  const place = first.property?.name?.trim() || "Einsatz";
  const address = [first.property?.address_line1, first.property?.city]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  const when = `${dayFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(
    new Date(first.ends_at),
  )} Uhr`;
  return {
    category: "shift_assigned",
    title: `Neuer Einsatz: ${place}`,
    // The property name is often the address already — don't repeat it.
    body: address && !place.includes(address) ? `${when} · ${address}` : when,
    link_url: `/schedule?shift=${first.id}`,
  };
}

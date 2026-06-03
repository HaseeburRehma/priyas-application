import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * One physical (or digital) credential issued to one employee for one
 * property. Multiple keys per property × employee are allowed (door key +
 * alarm fob, for example) — the unique constraint sits at the row, not at
 * the pair, because real-world key registers track each item separately.
 */
export type PropertyKeyRow = {
  id: string;
  property_id: string;
  employee_id: string;
  employee_name: string;
  key_label: string;
  issued_at: string;          // ISO date
  returned_at: string | null; // null while the key is still out
  notes: string | null;
  is_active: boolean;         // = returned_at IS NULL
};

export async function loadPropertyKeys(
  propertyId: string,
): Promise<PropertyKeyRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("property_keys")
    .select(
      `id, property_id, employee_id, key_label, issued_at, returned_at, notes,
       employee:employees ( id, full_name )`,
    )
    .eq("property_id", propertyId)
    // Active first, then most recent returns.
    .order("returned_at", { ascending: true, nullsFirst: true })
    .order("issued_at", { ascending: false });

  type DbRow = {
    id: string;
    property_id: string;
    employee_id: string;
    key_label: string;
    issued_at: string;
    returned_at: string | null;
    notes: string | null;
    employee: { id: string; full_name: string } | null;
  };
  return ((data ?? []) as unknown as DbRow[]).map((r) => ({
    id: r.id,
    property_id: r.property_id,
    employee_id: r.employee_id,
    employee_name: r.employee?.full_name ?? "—",
    key_label: r.key_label,
    issued_at: r.issued_at,
    returned_at: r.returned_at,
    notes: r.notes,
    is_active: r.returned_at == null,
  }));
}

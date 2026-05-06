import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DamageCategory = "normal" | "note" | "problem" | "damage";

export type DamageReport = {
  id: string;
  property_id: string;
  property_name: string | null;
  shift_id: string | null;
  employee_id: string | null;
  employee_name: string | null;
  severity: number;
  category: DamageCategory;
  description: string;
  photo_paths: string[];
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

export async function loadDamageReportsForProperty(
  propertyId: string,
): Promise<DamageReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("damage_reports")
    .select(
      `id, property_id, shift_id, employee_id, severity, category,
       description, photo_paths, resolved, resolved_at, created_at,
       property:properties ( id, name ),
       employee:employees ( id, full_name )`,
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    property_id: string;
    shift_id: string | null;
    employee_id: string | null;
    severity: number;
    category: DamageCategory;
    description: string;
    photo_paths: string[];
    resolved: boolean;
    resolved_at: string | null;
    created_at: string;
    property: { id: string; name: string } | null;
    employee: { id: string; full_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    property_name: r.property?.name ?? null,
    shift_id: r.shift_id,
    employee_id: r.employee_id,
    employee_name: r.employee?.full_name ?? null,
    severity: r.severity,
    category: r.category,
    description: r.description,
    photo_paths: r.photo_paths ?? [],
    resolved: r.resolved,
    resolved_at: r.resolved_at,
    created_at: r.created_at,
  }));
}

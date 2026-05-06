import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PropertyClosure = {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  reason:
    | "public_holiday"
    | "tenant_closed"
    | "renovation"
    | "weather"
    | "other";
  notes: string | null;
  created_at: string;
};

export async function loadClosuresForProperty(
  propertyId: string,
): Promise<PropertyClosure[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("property_closures")
    .select("id, property_id, start_date, end_date, reason, notes, created_at")
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false })
    .limit(50);
  return (data ?? []) as PropertyClosure[];
}

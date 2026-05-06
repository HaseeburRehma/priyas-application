import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShiftOptionsResponse = {
  properties: { id: string; name: string; client_name: string }[];
  employees: { id: string; full_name: string; status: string }[];
};

/**
 * GET /api/shifts/options — fetches the property + employee picker data
 * for the "Plan shift" modal. RLS keeps these scoped to the org.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const [propsRes, empsRes] = await Promise.all([
    supabase
      .from("properties")
      .select(
        `id, name,
         client:clients ( display_name )`,
      )
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500),
    supabase
      .from("employees")
      .select("id, full_name, status")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(500),
  ]);

  type PropRow = {
    id: string;
    name: string;
    client: { display_name: string } | null;
  };
  const properties = ((propsRes.data ?? []) as unknown as PropRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    client_name: p.client?.display_name ?? "—",
  }));
  const employees = (empsRes.data ?? []) as Array<{
    id: string;
    full_name: string;
    status: string;
  }>;

  const body: ShiftOptionsResponse = { properties, employees };
  return NextResponse.json(body);
}

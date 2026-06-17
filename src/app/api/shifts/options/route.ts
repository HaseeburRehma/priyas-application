import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShiftOptionsResponse = {
  properties: { id: string; name: string; client_name: string; client_customer_type: string }[];
  employees: { id: string; full_name: string; status: string; service_type: "priya" | "alltagshilfe" | "both" }[];
};

/**
 * GET /api/shifts/options — fetches property + employee picker data for
 * the "Plan shift" modal. RLS keeps results scoped to the org.
 *
 * NOTE: service_type is omitted from the employee select until migration
 * 20260616_000049_employees_service_type is pushed to the remote DB.
 * All employees default to "both" until then.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [propsRes, empsRes] = await Promise.all([
    supabase
      .from("properties")
      .select(
        `id, name,
         client:clients ( display_name, customer_type )`,
      )
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("employees").select("id, full_name, status") as any)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(500),
  ]);

  type PropRow = {
    id: string;
    name: string;
    client: { display_name: string; customer_type: string } | null;
  };
  const properties = ((propsRes.data ?? []) as unknown as PropRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    client_name: p.client?.display_name ?? "—",
    client_customer_type: p.client?.customer_type ?? "commercial",
  }));
  const employees = (
    (empsRes.data ?? []) as Array<{
      id: string;
      full_name: string;
      status: string;
    }>
  ).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    status: e.status,
    service_type: "both" as "priya" | "alltagshilfe" | "both",
  }));

  const body: ShiftOptionsResponse = { properties, employees };
  return NextResponse.json(body);
}

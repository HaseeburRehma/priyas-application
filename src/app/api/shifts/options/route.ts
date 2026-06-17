import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShiftOptionsResponse = {
  properties: { id: string; name: string; client_name: string; client_customer_type: string }[];
  employees: { id: string; full_name: string; status: string; service_type: "priya" | "alltagshilfe" | "both" }[];
};

/**
 * GET /api/shifts/options — fetches the property + employee picker data
 * for the "Plan shift" modal. Includes service_type per employee and
 * client_customer_type per property so the dialog can filter staff to
 * only those qualified for the selected shift's service line.
 * RLS keeps these scoped to the org.
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
    supabase
      .from("employees")
      .select("id, full_name, status, service_type")
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
      service_type: "priya" | "alltagshilfe" | "both" | null;
    }>
  ).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    status: e.status,
    service_type: (e.service_type ?? "both") as "priya" | "alltagshilfe" | "both",
  }));

  const body: ShiftOptionsResponse = { properties, employees };
  return NextResponse.json(body);
}

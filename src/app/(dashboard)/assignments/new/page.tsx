import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewAssignmentForm } from "@/components/assignments/NewAssignmentForm";

export const metadata: Metadata = { title: "Neuer Auftrag · Priya's" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await can("property.update"))) redirect(routes.assignments);

  const supabase = await createSupabaseServerClient();

  const [clientsRes, propertiesRes, employeesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name")
      .is("deleted_at", null)
      .eq("archived", false)
      .order("display_name", { ascending: true })
      .limit(500),
    supabase
      .from("properties")
      .select("id, name, client_id")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500),
    supabase
      .from("employees")
      .select("id, full_name")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(200),
  ]);

  const clients = (clientsRes.data ?? []) as {
    id: string;
    display_name: string;
  }[];
  const properties = (propertiesRes.data ?? []) as {
    id: string;
    name: string;
    client_id: string;
  }[];
  const employees = (employeesRes.data ?? []) as {
    id: string;
    full_name: string;
  }[];

  return (
    <NewAssignmentForm
      clients={clients}
      properties={properties}
      employees={employees}
    />
  );
}

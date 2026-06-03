import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";
import { PropertyForm } from "@/components/properties/PropertyForm";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await can("property.create"))) redirect(routes.properties);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clients")
    .select("id, display_name")
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .limit(500);
  const clients = (data ?? []) as { id: string; display_name: string }[];

  return <PropertyForm mode="create" clients={clients} />;
}

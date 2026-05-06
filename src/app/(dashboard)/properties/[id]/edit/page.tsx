import { redirect, notFound } from "next/navigation";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";
import { PropertyForm } from "@/components/properties/PropertyForm";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  try {
    await requirePermission("property.update");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.property(id));
    throw err;
  }

  const supabase = await createSupabaseServerClient();
  const [propertyRes, clientsRes] = await Promise.all([
    supabase
      .from("properties")
      .select(
        `id, client_id, name, address_line1, address_line2, postal_code, city, country,
         size_sqm, notes, floor, building_section, access_code,
         allergies, restricted_areas, safety_regulations`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id, display_name")
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(500),
  ]);

  const property = propertyRes.data as
    | {
        id: string;
        client_id: string;
        name: string;
        address_line1: string;
        address_line2: string | null;
        postal_code: string;
        city: string;
        country: string;
        size_sqm: number | null;
        notes: string | null;
        floor: string | null;
        building_section: string | null;
        access_code: string | null;
        allergies: string | null;
        restricted_areas: string | null;
        safety_regulations: string | null;
      }
    | null;
  if (!property) notFound();

  const clients = (clientsRes.data ?? []) as { id: string; display_name: string }[];

  return (
    <PropertyForm
      mode="edit"
      clients={clients}
      initial={property}
    />
  );
}

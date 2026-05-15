import type { Metadata } from "next";
import { loadPropertiesSummary } from "@/lib/api/properties";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { PropertiesPageHead } from "@/components/properties/PropertiesPageHead";
import { PropertiesSummaryStrip } from "@/components/properties/PropertiesSummary";
import { PropertiesPageClient } from "@/components/properties/PropertiesPageClient";

export const metadata: Metadata = { title: "Objekte" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRoute("properties");
  const [summary, canCreate, canDelete, canUpdate] = await Promise.all([
    loadPropertiesSummary(),
    can("property.create"),
    can("property.delete"),
    can("property.update"),
  ]);
  return (
    <>
      <PropertiesPageHead canCreate={canCreate} />
      <PropertiesSummaryStrip summary={summary} />
      <PropertiesPageClient canDelete={canDelete} canUpdate={canUpdate} />
    </>
  );
}

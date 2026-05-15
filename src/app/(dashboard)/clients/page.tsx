import type { Metadata } from "next";
import { loadClientsSummary } from "@/lib/api/clients";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { ClientsPageHead } from "@/components/clients/ClientsPageHead";
import { ClientsSummaryStrip } from "@/components/clients/ClientsSummary";
import { ClientsPageClient } from "@/components/clients/ClientsPageClient";

export const metadata: Metadata = { title: "Kunden" };
export const dynamic = "force-dynamic";

/**
 * /clients — pixel-faithful conversion of 03-clients-list.html.
 *
 * Server Component:
 *   - Renders the breadcrumb + page-head (no interactive state).
 *   - Loads the summary KPI strip (one round-trip).
 *
 * Client Component (ClientsPageClient):
 *   - Owns search/filter/sort/pagination.
 *   - Fetches the table via /api/clients with TanStack Query.
 */
export default async function ClientsPage() {
  await requireRoute("clients");
  const [summary, canArchive] = await Promise.all([
    loadClientsSummary(),
    can("client.archive"),
  ]);
  return (
    <>
      <ClientsPageHead />
      <ClientsSummaryStrip summary={summary} />
      <ClientsPageClient canArchive={canArchive} />
    </>
  );
}

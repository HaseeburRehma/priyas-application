import type { Metadata } from "next";
import { Suspense } from "react";
import { loadClientsSummary } from "@/lib/api/clients";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { ClientsPageHead } from "@/components/clients/ClientsPageHead";
import { ClientsSummaryStrip } from "@/components/clients/ClientsSummary";
import { ClientsPageClient } from "@/components/clients/ClientsPageClient";
import { KpiStripSkeleton, TableSkeleton } from "@/components/shared/Skeleton";

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
  return (
    <>
      <ClientsPageHead />
      <Suspense fallback={<KpiStripSkeleton />}>
        <ClientsSummarySection />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <ClientsTableSection />
      </Suspense>
    </>
  );
}

async function ClientsSummarySection() {
  const summary = await loadClientsSummary();
  return <ClientsSummaryStrip summary={summary} />;
}

async function ClientsTableSection() {
  const canArchive = await can("client.archive");
  return <ClientsPageClient canArchive={canArchive} />;
}

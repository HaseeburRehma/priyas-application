import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadClientDetail } from "@/lib/api/clients";
import { loadContactsForClient } from "@/lib/api/client-contacts";
import { loadClientDocuments } from "@/lib/api/client-documents";
import { loadClientSupplyFlags } from "@/lib/api/supply-flags";
import { loadAlltagshilfeBudget } from "@/lib/api/invoices";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { ContactsCard } from "@/components/clients/ContactsCard";
import { DocumentsCard } from "@/components/clients/DocumentsCard";
import { SupplyFlagsCard } from "@/components/clients/SupplyFlagsCard";
import { AlltagshilfeBudgetCard } from "@/components/invoices/AlltagshilfeBudgetCard";
import { can, requireRoute } from "@/lib/rbac/permissions";

export const metadata: Metadata = { title: "Kundendetails" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireRoute("client");
  const { id } = await params;
  const [detail, contacts, documents, supplyFlags, canUpdate, canArchive, canResolveSupplies] =
    await Promise.all([
      loadClientDetail(id),
      loadContactsForClient(id),
      loadClientDocuments(id),
      // Feature-update #18 (web PM view): recent cleaning-supply flags.
      loadClientSupplyFlags(id),
      can("client.update"),
      can("client.archive"),
      // Reuses the damage-resolve permission — same audience (PMs).
      can("damage.resolve"),
    ]);
  if (!detail) notFound();

  // For Alltagshilfe clients, fetch the current-year budget row so we can
  // surface the usage tracker right under the main detail card.
  const budget =
    detail.customer_type === "alltagshilfe"
      ? await loadAlltagshilfeBudget(detail.id)
      : null;

  return (
    <>
      <ClientDetail
        detail={detail}
        canUpdate={canUpdate}
        canArchive={canArchive}
      />
      {budget && (
        <div className="mt-5">
          <AlltagshilfeBudgetCard budget={budget} />
        </div>
      )}
      <div className="mt-5">
        <ContactsCard
          clientId={detail.id}
          contacts={contacts}
          canEdit={canUpdate}
        />
      </div>
      {/* id="client-documents" is the anchor target for the Documents
       *  tab in ClientDetail (feature-update #5/#7). The Tab's <a href>
       *  scrolls the browser here; no client-side JS or extra routing
       *  required. scroll-mt keeps the section clear of the fixed
       *  header when scrolled to. */}
      <div id="client-documents" className="mt-5 scroll-mt-24">
        <DocumentsCard
          clientId={detail.id}
          documents={documents}
          canEdit={canUpdate}
        />
      </div>

      {/* Feature-update #18 (web PM view): supply-flag history + a
       *  "Erledigt" button on missing-supply rows. Field-staff-side
       *  write UI lives in the mobile app (ships in a follow-up
       *  commit); the table + RLS already accept inserts from any
       *  signed-in org member. */}
      <SupplyFlagsCard
        clientId={detail.id}
        flags={supplyFlags}
        canResolve={canResolveSupplies}
      />
    </>
  );
}

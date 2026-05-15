import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadClientDetail } from "@/lib/api/clients";
import { loadContactsForClient } from "@/lib/api/client-contacts";
import { loadAlltagshilfeBudget } from "@/lib/api/invoices";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { ContactsCard } from "@/components/clients/ContactsCard";
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
  const [detail, contacts, canUpdate, canArchive] = await Promise.all([
    loadClientDetail(id),
    loadContactsForClient(id),
    can("client.update"),
    can("client.archive"),
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
    </>
  );
}

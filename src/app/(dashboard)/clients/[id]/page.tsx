import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadClientDetail } from "@/lib/api/clients";
import { loadContactsForClient } from "@/lib/api/client-contacts";
import { ClientDetail } from "@/components/clients/ClientDetail";
import { ContactsCard } from "@/components/clients/ContactsCard";
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

  return (
    <>
      <ClientDetail
        detail={detail}
        canUpdate={canUpdate}
        canArchive={canArchive}
      />
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

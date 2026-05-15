import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadClientDetail } from "@/lib/api/clients";
import { EditClientForm } from "@/components/clients/EditClientForm";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Kunde bearbeiten" };
export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * /clients/[id]/edit — server component that gates rendering on the
 * `client.update` permission, loads the same `ClientDetail` shape used by
 * the detail page, then hands off to the client-side `EditClientForm`.
 */
export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireRoute("client");
  const { id } = await params;
  const [detail, canUpdate] = await Promise.all([
    loadClientDetail(id),
    can("client.update"),
  ]);
  if (!detail) notFound();
  // Permission-gated: users without `client.update` get bounced back to the
  // detail view rather than seeing a form they can't submit.
  if (!canUpdate) redirect(routes.client(id));

  return <EditClientForm detail={detail} />;
}

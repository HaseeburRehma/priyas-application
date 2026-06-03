import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadStatement } from "@/lib/api/statement";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { ClientStatement } from "@/components/statement/ClientStatement";

export const metadata: Metadata = { title: "Statement" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  if (!(await can("invoice.read"))) redirect(routes.dashboard);
  const data = await loadStatement(id);
  if (!data) notFound();
  return <ClientStatement data={data} />;
}

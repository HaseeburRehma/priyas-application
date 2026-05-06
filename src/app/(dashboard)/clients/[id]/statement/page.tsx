import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadStatement } from "@/lib/api/statement";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
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
  try {
    await requirePermission("invoice.read");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  const data = await loadStatement(id);
  if (!data) notFound();
  return <ClientStatement data={data} />;
}

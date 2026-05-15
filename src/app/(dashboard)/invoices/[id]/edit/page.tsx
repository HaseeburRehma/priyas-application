import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadInvoiceDetail } from "@/lib/api/invoices";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { DraftEditor } from "@/components/invoices/DraftEditor";

export const metadata: Metadata = { title: "Rechnung bearbeiten" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    await requirePermission("invoice.update");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.invoices);
    throw err;
  }
  const detail = await loadInvoiceDetail(id);
  if (!detail) notFound();
  if (detail.status !== "draft") redirect(routes.invoice(id));
  return <DraftEditor detail={detail} />;
}

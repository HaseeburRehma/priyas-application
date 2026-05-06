import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadInvoiceDetail } from "@/lib/api/invoices";
import { can, requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";

export const metadata: Metadata = { title: "Rechnung" };
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
  const detail = await loadInvoiceDetail(id);
  if (!detail) notFound();
  const [canSend, canMarkPaid, canLexware] = await Promise.all([
    can("invoice.send"),
    can("invoice.mark_paid"),
    can("invoice.lexware_sync"),
  ]);
  return (
    <InvoiceDetail
      detail={detail}
      canSend={canSend}
      canMarkPaid={canMarkPaid}
      canLexware={canLexware}
    />
  );
}

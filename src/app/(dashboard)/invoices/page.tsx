import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadInvoicesSummary } from "@/lib/api/invoices";
import { can, requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { InvoicesPage } from "@/components/invoices/InvoicesPage";

export const metadata: Metadata = { title: "Rechnungen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("invoice.read");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  const [summary, canCreate] = await Promise.all([
    loadInvoicesSummary(),
    can("invoice.create"),
  ]);
  return <InvoicesPage summary={summary} canCreate={canCreate} />;
}

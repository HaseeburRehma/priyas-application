import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadInvoicesSummary } from "@/lib/api/invoices";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { InvoicesPage } from "@/components/invoices/InvoicesPage";
import { TableSkeleton } from "@/components/shared/Skeleton";

export const metadata: Metadata = { title: "Rechnungen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await can("invoice.read"))) redirect(routes.dashboard);
  return (
    <Suspense fallback={<TableSkeleton />}>
      <InvoicesSection />
    </Suspense>
  );
}

async function InvoicesSection() {
  const [summary, canCreate, canSync] = await Promise.all([
    loadInvoicesSummary(),
    can("invoice.create"),
    can("invoice.lexware_sync"),
  ]);
  return <InvoicesPage summary={summary} canCreate={canCreate} canSync={canSync} />;
}

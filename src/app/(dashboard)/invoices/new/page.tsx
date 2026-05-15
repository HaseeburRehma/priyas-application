import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { NewInvoiceWizard } from "@/components/invoices/NewInvoiceWizard";

export const metadata: Metadata = { title: "Neue Rechnung" };
export const dynamic = "force-dynamic";

type ClientOption = {
  id: string;
  display_name: string;
  customer_type: "residential" | "commercial" | "alltagshilfe";
  email: string | null;
  billing_email: string | null;
};

export default async function Page() {
  try {
    await requirePermission("invoice.create");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.invoices);
    throw err;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clients")
    .select("id, display_name, customer_type, email, billing_email")
    .is("deleted_at", null)
    .eq("archived", false)
    .order("display_name", { ascending: true });
  const clients = (data ?? []) as ClientOption[];
  return <NewInvoiceWizard clients={clients} />;
}

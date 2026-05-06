import { NextResponse } from "next/server";
import { loadInvoiceDetail } from "@/lib/api/invoices";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("invoice.read");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof PermissionError ? err.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const invoice = await loadInvoiceDetail(id);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Pull org details from settings + organisations.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;

  let orgName = "Priya's Reinigungsservice";
  let orgVatId: string | null = null;
  let orgAddress: string | null = null;
  let orgEmail: string | null = null;
  if (orgId) {
    const [{ data: orgRow }, { data: settingsRow }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      supabase.from("settings").select("data").eq("org_id", orgId).maybeSingle(),
    ]);
    if (orgRow) orgName = (orgRow as { name: string }).name;
    type SettingsData = {
      data: {
        company?: {
          legalName?: string;
          vatId?: string;
          address?: string;
          supportEmail?: string;
        };
      } | null;
    };
    const company = (settingsRow as SettingsData | null)?.data?.company;
    if (company?.legalName) orgName = company.legalName;
    if (company?.vatId) orgVatId = company.vatId;
    if (company?.address) orgAddress = company.address;
    if (company?.supportEmail) orgEmail = company.supportEmail;
  }

  const bytes = await renderInvoicePdf(invoice, {
    name: orgName,
    vat_id: orgVatId,
    address: orgAddress,
    email: orgEmail,
  });

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

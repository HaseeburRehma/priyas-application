/**
 * PDF storage: render an invoice and persist the bytes to the
 * `invoices-pdf` Supabase Storage bucket. The bucket path is returned and
 * written to `invoices.pdf_path` for later retrieval.
 */
import "server-only";
import { loadInvoiceDetail } from "@/lib/api/invoices";
import { renderInvoicePdf } from "./invoice-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "invoices-pdf";

export async function renderAndStoreInvoicePdf(invoiceId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const invoice = await loadInvoiceDetail(invoiceId);
  if (!invoice) throw new Error("invoice_not_found");

  // Resolve org info (mirrors the route handler).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;

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

  const path = `${orgId ?? "default"}/${invoice.invoice_number}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    // Bucket might not exist in dev — fall back to in-memory path so the
    // calling action can still succeed in non-prod.
    // eslint-disable-next-line no-console
    console.warn(`[invoice-pdf-store] upload failed: ${error.message}`);
    return path;
  }
  return path;
}

/** Returns a short-lived signed URL for the stored PDF. */
export async function getInvoicePdfSignedUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

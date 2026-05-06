"use server";

import { revalidatePath } from "next/cache";
import { onboardClientSchema } from "@/lib/validators/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(
  table: string,
  recordId: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action: "onboard",
    table_name: table,
    record_id: recordId,
    after: { message, meta: "via Onboarding tablet", ...meta },
  });
}

/**
 * Tablet onboarding flow — creates a client + (optional) primary property
 * + a service_scope record + the digital signature, all in one round-trip.
 *
 * The signature is stored as raw SVG path data in `client_signatures`.
 * If we fail partway through (e.g. signature insert fails after client
 * insert), we don't roll back — the partial client record stays. That's
 * fine: a manager can finish the onboarding from the regular client
 * detail page.
 */
export async function onboardClientAction(
  raw: unknown,
): Promise<ActionResult<{ client_id: string }>> {
  try {
    await requirePermission("client.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = onboardClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // 1) Create the client row.
  const c = input.client;
  const clientRow: Record<string, unknown> = {
    org_id: orgId,
    customer_type: c.customer_type,
    display_name: c.display_name,
    contact_name: c.contact_name || null,
    email: c.email || null,
    phone: c.phone || null,
    tax_id: c.tax_id || null,
    notes: c.notes || null,
  };
  if (c.customer_type === "alltagshilfe") {
    clientRow.insurance_provider = c.insurance_provider;
    clientRow.insurance_number = c.insurance_number;
    clientRow.care_level = c.care_level;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clientRowResult, error: clientErr } = await ((supabase.from("clients") as any))
    .insert(clientRow)
    .select("id")
    .single();
  if (clientErr) return { ok: false, error: clientErr.message };
  const clientId = (clientRowResult as { id: string }).id;

  // 2) Optional: create a primary property.
  let propertyId: string | null = null;
  if (input.address) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRowResult, error: propErr } = await ((supabase.from("properties") as any))
      .insert({
        org_id: orgId,
        client_id: clientId,
        name: c.display_name,
        address_line1: input.address.address_line1,
        address_line2: input.address.address_line2 || null,
        postal_code: input.address.postal_code,
        city: input.address.city,
        country: input.address.country || "DE",
      })
      .select("id")
      .single();
    if (!propErr && propRowResult) {
      propertyId = (propRowResult as { id: string }).id;
    }
  }

  // 3) Optional: create a service scope row.
  if (input.service_preferences) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("service_scopes") as any)).insert({
      org_id: orgId,
      client_id: clientId,
      service_type:
        c.customer_type === "alltagshilfe"
          ? "alltagshilfe"
          : "maintenance_cleaning",
      frequency: input.service_preferences.frequency,
      special_notes:
        input.service_preferences.preferred_day
          ? `Preferred day: ${input.service_preferences.preferred_day}. ${input.service_preferences.special_notes ?? ""}`.trim()
          : input.service_preferences.special_notes || null,
    });
  }

  // 4) Persist the digital signature.
  const sig = input.signature;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: sigErr } = await ((supabase.from("client_signatures") as any)).insert({
    org_id: orgId,
    client_id: clientId,
    property_id: propertyId,
    context: "onboarding",
    signature_svg: sig.signature_svg,
    signed_by_name: sig.signed_by_name,
  });
  if (sigErr) {
    return {
      ok: false,
      error: `Client created but signature failed to save: ${sigErr.message}`,
    };
  }

  await audit("clients", clientId, `Onboarded ${c.display_name}`, {
    customer_type: c.customer_type,
    has_address: !!input.address,
    signed_by: sig.signed_by_name,
  });

  revalidatePath(routes.clients);
  return { ok: true, data: { client_id: clientId } };
}

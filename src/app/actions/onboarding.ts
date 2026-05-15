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
): Promise<
  ActionResult<{
    client_id: string;
    property_id: string | null;
    org_id: string;
    /** True when all four inserts succeeded; false when one or more
     *  optional rows (property / service_scope) silently skipped. */
    complete: boolean;
  }>
> {
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

  // Compensation tracker: rows we've inserted so far. If a later step
  // fails, we soft-delete (set deleted_at = now()) them in REVERSE order:
  //   signature → service_scope → property → client
  // so child rows don't outlive their parents in the audit log. Soft-delete
  // (vs hard-delete) preserves the audit trail; RLS / list queries filter
  // `deleted_at is null` so users never see the orphans.
  const compensations: Array<{ table: string; id: string }> = [];
  let serviceScopeId: string | null = null;
  let signatureId: string | null = null;

  // Best-effort compensation. `clients` and `properties` have `deleted_at`,
  // so they soft-delete cleanly. `service_scopes` and `client_signatures`
  // don't — for those the soft-delete update fails (no column) and we fall
  // back to a hard-delete since the row never saw daylight anyway.
  const softDelete = async (table: string, id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((supabase.from(table) as any))
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ((supabase.from(table) as any)).delete().eq("id", id);
      }
    } catch {
      // Last-ditch: even compensation failed. We still surface the original
      // error to the caller so they know the flow didn't finish.
    }
  };
  const rollback = async () => {
    // Reverse order — children first.
    for (let i = compensations.length - 1; i >= 0; i--) {
      const c = compensations[i]!;
      await softDelete(c.table, c.id);
    }
  };

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
  compensations.push({ table: "clients", id: clientId });

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
      compensations.push({ table: "properties", id: propertyId });
    }
  }

  // 3) Optional: create a service scope row.
  if (input.service_preferences) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: scopeRow, error: scopeErr } = await ((supabase.from("service_scopes") as any))
      .insert({
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
      })
      .select("id")
      .single();
    if (scopeErr) {
      await rollback();
      return {
        ok: false,
        error: `Onboarding rolled back: service scope failed (${scopeErr.message})`,
      };
    }
    serviceScopeId = (scopeRow as { id: string } | null)?.id ?? null;
    if (serviceScopeId) {
      compensations.push({ table: "service_scopes", id: serviceScopeId });
    }
  }

  // 4) Persist the digital signature.
  const sig = input.signature;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sigRow, error: sigErr } = await ((supabase.from("client_signatures") as any))
    .insert({
      org_id: orgId,
      client_id: clientId,
      property_id: propertyId,
      context: "onboarding",
      signature_svg: sig.signature_svg,
      signed_by_name: sig.signed_by_name,
    })
    .select("id")
    .single();
  if (sigErr) {
    // Compensate: roll back client + property + service_scope so we don't
    // leak rows the UI can never finish.
    await rollback();
    return {
      ok: false,
      error: `Onboarding rolled back: signature failed (${sigErr.message})`,
    };
  }
  signatureId = (sigRow as { id: string } | null)?.id ?? null;
  if (signatureId) {
    compensations.push({ table: "client_signatures", id: signatureId });
  }

  await audit("clients", clientId, `Onboarded ${c.display_name}`, {
    customer_type: c.customer_type,
    has_address: !!input.address,
    signed_by: sig.signed_by_name,
  });

  // Spec §4.10 — automatic team notification on tablet onboarding.
  // Mirrors createClientAction's notifyNewClient(): fan out an in-app +
  // push notification to every admin/dispatcher in the org. Best-effort —
  // failures are swallowed so the onboarding flow always returns success
  // once the DB rows are in place.
  await notifyNewClientFromOnboarding(orgId, clientId, c.display_name).catch(
    () => {},
  );

  revalidatePath(routes.clients);
  // `complete` = the signature landed (the only non-optional step that can
  // still fail). Property is optional by design; if the caller supplied an
  // address and we have a propertyId, that part is also complete.
  const complete =
    signatureId !== null &&
    (input.address ? propertyId !== null : true) &&
    (input.service_preferences ? serviceScopeId !== null : true);
  return {
    ok: true,
    data: {
      client_id: clientId,
      property_id: propertyId,
      org_id: orgId,
      complete,
    },
  };
}

async function notifyNewClientFromOnboarding(
  orgId: string,
  clientId: string,
  clientName: string,
) {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("profiles") as any))
    .select("id")
    .eq("org_id", orgId)
    .in("role", ["admin", "dispatcher"]);
  const recipients = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (recipients.length === 0) return;

  const { emitNotification } = await import("@/lib/notifications/emit");
  await Promise.all(
    recipients.map((user_id) =>
      emitNotification({
        user_id,
        org_id: orgId,
        category: "new_client",
        title: `Neuer Kunde (Tablet-Onboarding): ${clientName}`,
        body: "Wurde gerade vor Ort angelegt.",
        link_url: `/clients/${clientId}`,
        push: true,
      }),
    ),
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
} from "@/lib/validators/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Helper: write an audit-log entry. Best-effort — never blocks the action. */
async function audit(
  action: string,
  table: string,
  recordId: string | null,
  before: unknown,
  after: unknown,
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
    action,
    table_name: table,
    record_id: recordId,
    before: before ?? null,
    after: after ?? null,
  });
}

/* ============================================================================
 * createClient — only admin / dispatcher.
 * ========================================================================== */
export async function createClientAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("client.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("write", "client.create");
  if (rl) return { ok: false, error: rl };

  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
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

  // Build row with type-specific fields.
  const insertRow: Record<string, unknown> = {
    org_id: orgId,
    customer_type: input.customer_type,
    display_name: input.display_name,
    contact_name: input.contact_name || null,
    email: input.email || null,
    phone: input.phone || null,
    tax_id: input.tax_id || null,
    notes: input.notes || null,
  };
  if (input.customer_type === "alltagshilfe") {
    insertRow.insurance_provider = input.insurance_provider;
    insertRow.insurance_number = input.insurance_number;
    insertRow.care_level = input.care_level;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("clients") as any))
    .insert(insertRow)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const newId = (data as { id: string }).id;
  await audit("create", "clients", newId, null, {
    message: `<strong>${input.display_name}</strong> wurde als neuer Kunde angelegt.`,
    meta: "via WebApp",
    customer_type: input.customer_type,
  });

  // Fan out a notification to every dispatcher + admin in the org.
  // Best-effort: failures are swallowed (logged inside emitNotification).
  await notifyNewClient(orgId, newId, input.display_name).catch(() => {});

  revalidatePath(routes.clients);
  revalidatePath(routes.dashboard);
  return { ok: true, data: { id: newId } };
}

/** Fan out a "new client" notification to every dispatcher + admin in the org. */
async function notifyNewClient(
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
        title: `Neuer Kunde: ${clientName}`,
        body: "Wurde gerade im System angelegt.",
        link_url: `/clients/${clientId}`,
        push: true,
      }),
    ),
  );
}

/* ============================================================================
 * updateClient — only admin / dispatcher.
 * ========================================================================== */
export async function updateClientAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("client.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = updateClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  const updateRow: Record<string, unknown> = {
    display_name: input.display_name,
    contact_name: input.contact_name || null,
    email: input.email || null,
    phone: input.phone || null,
    tax_id: input.tax_id || null,
    notes: input.notes || null,
  };
  if (input.customer_type === "alltagshilfe") {
    updateRow.insurance_provider = input.insurance_provider;
    updateRow.insurance_number = input.insurance_number;
    updateRow.care_level = input.care_level;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("clients") as any))
    .update(updateRow)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await audit("update", "clients", input.id, null, {
    message: `Kunde <strong>${input.display_name}</strong> aktualisiert.`,
    meta: "via WebApp",
  });

  revalidatePath(routes.client(input.id));
  revalidatePath(routes.clients);
  return { ok: true, data: { id: input.id } };
}

/* ============================================================================
 * archiveClient — admin only. Sets `archived = true`. Does not delete.
 * ========================================================================== */
export async function archiveClientAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("client.archive");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("clients") as any))
    .update({ archived: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await audit("archive", "clients", id, null, {
    message: "Kunde archiviert.",
    meta: "via WebApp",
  });

  revalidatePath(routes.clients);
  return { ok: true, data: { id } };
}

/* ============================================================================
 * createAndRedirect — used by the create-client form to redirect after save.
 * ========================================================================== */
export async function createClientAndRedirect(
  raw: CreateClientInput,
): Promise<void> {
  const result = await createClientAction(raw);
  if (!result.ok) throw new Error(result.error);
  redirect(routes.client(result.data.id));
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { getCachedUser } from "@/lib/api/current-user";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
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
    table_name: "property_keys",
    record_id: recordId,
    after: { message },
  });
}

const IssueSchema = z.object({
  propertyId: z.string().uuid(),
  employeeId: z.string().uuid(),
  keyLabel: z.string().min(1).max(80),
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Issue a new key to a staff member. */
export async function issueKeyAction(
  input: z.infer<typeof IssueSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  // Resolve org_id from the target property so we don't trust the client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRow } = await ((supabase.from("properties") as any))
    .select("org_id")
    .eq("id", parsed.data.propertyId)
    .maybeSingle();
  const orgId = (propRow as { org_id: string } | null)?.org_id;
  if (!orgId) return { ok: false, error: "property_not_found" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ins, error } = await ((supabase.from("property_keys") as any))
    .insert({
      org_id: orgId,
      property_id: parsed.data.propertyId,
      employee_id: parsed.data.employeeId,
      key_label: parsed.data.keyLabel.trim(),
      issued_at: parsed.data.issuedAt ?? new Date().toISOString().slice(0, 10),
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !ins) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  const id = (ins as { id: string }).id;
  await audit("issue_key", id, `Schlüssel "${parsed.data.keyLabel}" ausgegeben.`);
  revalidatePath(routes.property(parsed.data.propertyId));
  return { ok: true, data: { id } };
}

/** Mark a key returned. Doesn't delete the row — keeps the audit trail. */
export async function returnKeyAction(
  keyId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await ((supabase.from("property_keys") as any))
    .update({ returned_at: new Date().toISOString().slice(0, 10) })
    .eq("id", keyId)
    .is("returned_at", null)
    .select("id, property_id");
  if (error) return { ok: false, error: error.message };
  const rows = Array.isArray(updated) ? updated.length : 0;
  if (rows === 0) {
    return { ok: false, error: "Schlüssel ist bereits zurückgegeben." };
  }
  const propId = (updated as Array<{ property_id: string }>)[0]?.property_id;
  await audit("return_key", keyId, "Schlüssel zurückgenommen.");
  if (propId) revalidatePath(routes.property(propId));
  return { ok: true, data: { id: keyId } };
}

/** Permanent delete for typos/corrections. Admin-only. */
export async function deleteKeyAction(
  keyId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.delete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await ((supabase.from("property_keys") as any))
    .select("property_id")
    .eq("id", keyId)
    .maybeSingle();
  const propId = (row as { property_id: string } | null)?.property_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("property_keys") as any))
    .delete()
    .eq("id", keyId);
  if (error) return { ok: false, error: error.message };
  await audit("delete_key", keyId, "Schlüssel-Eintrag gelöscht.");
  if (propId) revalidatePath(routes.property(propId));
  return { ok: true, data: { id: keyId } };
}

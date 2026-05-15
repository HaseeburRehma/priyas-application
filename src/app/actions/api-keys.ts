"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { hashApiKey } from "@/lib/api/v1-auth";
import { V1_SCOPES, type V1Scope } from "@/lib/api/v1-scopes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type CreateInput = {
  name: string;
  scopes: V1Scope[];
  expires_at?: string | null;
};

type ApiKeyListRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

/**
 * Mint a new API key for the current organisation. Admin-only.
 *
 * Returns the FULL plaintext key exactly once — the caller MUST persist
 * it on their side immediately. We only store the SHA-256 hash plus a
 * short display prefix; we cannot recover the key after this call.
 */
export async function createApiKeyAction(
  input: CreateInput,
): Promise<ActionResult<{ id: string; key: string; prefix: string }>> {
  const { userId, orgId, role } = await getCurrentRole();
  if (!userId || !orgId) {
    return { ok: false, error: "not_signed_in" };
  }
  if (role !== "admin") {
    return { ok: false, error: "admin_only" };
  }

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "name_required" };
  if (name.length > 80) return { ok: false, error: "name_too_long" };

  const scopes = Array.isArray(input.scopes) ? input.scopes : [];
  for (const s of scopes) {
    if (!V1_SCOPES.includes(s as V1Scope)) {
      return { ok: false, error: `invalid_scope:${s}` };
    }
  }

  // Generate key material — 32 bytes of entropy is more than enough.
  const secret = randomBytes(32).toString("hex");
  const fullKey = `pk_live_${secret}`;
  // `prefix` is the first 8 chars for display, e.g. "pk_live_".
  const prefix = fullKey.slice(0, 8);
  const hash = hashApiKey(fullKey);

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("api_keys") as any))
    .insert({
      org_id: orgId,
      name,
      prefix,
      hash,
      scopes,
      expires_at: input.expires_at ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  const row = data as { id: string };

  revalidatePath("/settings/api-keys");
  return { ok: true, data: { id: row.id, key: fullKey, prefix } };
}

/**
 * Mark an API key as revoked. Idempotent — calling on an already-revoked
 * key is a no-op. Admin-only.
 */
export async function revokeApiKeyAction(
  id: string,
): Promise<ActionResult> {
  const { userId, orgId, role } = await getCurrentRole();
  if (!userId || !orgId) {
    return { ok: false, error: "not_signed_in" };
  }
  if (role !== "admin") {
    return { ok: false, error: "admin_only" };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: "id_required" };
  }

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("api_keys") as any))
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings/api-keys");
  return { ok: true, data: undefined };
}

/**
 * Server-only: list keys in the current org for the settings table.
 * Never includes hash or raw key. Admin-only — non-admins get `[]`.
 */
export async function listApiKeysAction(): Promise<ApiKeyListRow[]> {
  const { orgId, role } = await getCurrentRole();
  if (!orgId || role !== "admin") return [];

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("api_keys") as any))
    .select(
      "id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at",
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as ApiKeyListRow[];
}

export type { ApiKeyListRow };

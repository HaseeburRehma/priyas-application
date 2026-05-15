import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";

/**
 * Authentication context for an external `/api/v1` request. Surfaced by
 * `authenticateApiKey()` and passed to v1 route handlers.
 */
export type V1AuthContext = {
  orgId: string;
  keyId: string;
  scopes: string[];
};

export type V1AuthError = { error: string; status: number };

/**
 * SHA-256 a string and return its lowercase hex digest. Matches the hash
 * format persisted in `api_keys.hash` (see migration 000029).
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

/**
 * Lazy service-role client. v1 requests carry no user session, so we
 * authenticate by looking up the key hash with a service-role connection.
 * RLS is therefore bypassed — the auth helper itself enforces revoke /
 * expiry checks before returning a context.
 */
function getServiceClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

type ApiKeyRow = {
  id: string;
  org_id: string;
  scopes: string[] | null;
  revoked_at: string | null;
  expires_at: string | null;
};

/**
 * Authenticate an incoming v1 request by `Authorization: Bearer pk_...`.
 *
 *   - Returns a {@link V1AuthContext} when the key is valid, active and
 *     not expired.
 *   - Returns `{ error, status }` otherwise.
 *
 * Also fires off a best-effort `last_used_at` update — the request
 * doesn't wait for it.
 */
export async function authenticateApiKey(
  req: Request,
): Promise<V1AuthContext | V1AuthError> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) {
    return { error: "missing_authorization_header", status: 401 };
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { error: "malformed_authorization_header", status: 401 };
  }
  const rawKey = match[1]?.trim() ?? "";
  if (rawKey.length < 16) {
    return { error: "invalid_api_key", status: 401 };
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return { error: "v1_api_not_configured", status: 503 };
  }

  const hash = hashApiKey(rawKey);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, scopes, revoked_at, expires_at")
    .eq("hash", hash)
    .maybeSingle();

  if (error) {
    return { error: "auth_lookup_failed", status: 500 };
  }
  const row = (data ?? null) as ApiKeyRow | null;
  if (!row) {
    return { error: "invalid_api_key", status: 401 };
  }
  if (row.revoked_at) {
    return { error: "api_key_revoked", status: 401 };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { error: "api_key_expired", status: 401 };
  }

  // Fire-and-forget last_used_at update. Errors are swallowed — they don't
  // block the legitimate request.
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    orgId: row.org_id,
    keyId: row.id,
    scopes: row.scopes ?? [],
  };
}

/**
 * Returns true when the given context's scopes include the requested
 * capability. Scope strings follow the `verb:resource` convention,
 * e.g. `read:clients`, `write:invoices`.
 */
export function hasScope(ctx: V1AuthContext, required: string): boolean {
  return ctx.scopes.includes(required);
}

/**
 * Convenience: assert that a context is fully formed AND has the given
 * scope, returning a JSON-friendly error object when it isn't.
 */
export function requireScope(
  ctx: V1AuthContext,
  required: string,
): V1AuthError | null {
  if (!hasScope(ctx, required)) {
    return { error: `missing_scope:${required}`, status: 403 };
  }
  return null;
}

/** Narrowing helper for callers. */
export function isAuthError(
  v: V1AuthContext | V1AuthError,
): v is V1AuthError {
  return (v as V1AuthError).error !== undefined && typeof (v as V1AuthError).status === "number";
}

// Scope vocabulary lives in `v1-scopes.ts` so it can be imported by
// client components (which can't reach into a `server-only` module).
// Re-exported here for backwards compatibility with existing imports.
export { V1_SCOPES, type V1Scope } from "./v1-scopes";

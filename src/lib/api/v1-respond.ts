import "server-only";
import { NextResponse } from "next/server";
import {
  authenticateApiKey,
  isAuthError,
  requireScope,
  type V1AuthContext,
} from "./v1-auth";
import { consumeV1Token } from "./v1-rate-limit";

/** Stable list envelope used by every v1 collection endpoint. */
export type V1ListEnvelope<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

/** Stable single-resource envelope. */
export type V1ItemEnvelope<T> = {
  data: T;
};

const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "private, no-store",
};

/**
 * Build a list response with the canonical envelope and no-store cache
 * headers.
 */
export function v1ListResponse<T>(
  rows: T[],
  pagination: { page: number; pageSize: number; total: number },
  init?: { extraHeaders?: Record<string, string> },
): NextResponse {
  const totalPages =
    pagination.total === 0
      ? 0
      : Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const body: V1ListEnvelope<T> = {
    data: rows,
    pagination: { ...pagination, totalPages },
  };
  return NextResponse.json(body, {
    headers: { ...NO_STORE_HEADERS, ...(init?.extraHeaders ?? {}) },
  });
}

/** Build a single-item response. */
export function v1ItemResponse<T>(
  item: T,
  init?: { extraHeaders?: Record<string, string> },
): NextResponse {
  const body: V1ItemEnvelope<T> = { data: item };
  return NextResponse.json(body, {
    headers: { ...NO_STORE_HEADERS, ...(init?.extraHeaders ?? {}) },
  });
}

/** JSON error response in the documented `{ error, code? }` shape. */
export function v1ErrorResponse(
  status: number,
  error: string,
  init?: { extraHeaders?: Record<string, string> },
): NextResponse {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { ...NO_STORE_HEADERS, ...(init?.extraHeaders ?? {}) },
    },
  );
}

/**
 * Run the full pre-flight for a v1 handler: bearer-auth, scope check,
 * rate limiting. Returns either a ready-made `NextResponse` (error case)
 * or the auth context (success).
 *
 * Usage:
 *   const ctx = await v1Guard(request, "read:clients");
 *   if (ctx instanceof NextResponse) return ctx;
 *   // ctx is V1AuthContext here.
 */
export async function v1Guard(
  request: Request,
  scope: string,
): Promise<V1AuthContext | NextResponse> {
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return v1ErrorResponse(auth.status, auth.error);
  }
  const scopeErr = requireScope(auth, scope);
  if (scopeErr) {
    return v1ErrorResponse(scopeErr.status, scopeErr.error);
  }
  const rl = consumeV1Token(auth.keyId);
  if (!rl.ok) {
    return v1ErrorResponse(429, "rate_limited", {
      extraHeaders: { "retry-after": String(rl.retryAfterSeconds) },
    });
  }
  return auth;
}

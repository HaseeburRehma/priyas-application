import "server-only";

import { consumeAsync } from "@/lib/rate-limit/limiter";

/**
 * Per-API-key rate limit for the `/api/v1` surface: 60 requests / 60 s.
 *
 * Delegates to the shared `consumeAsync()` limiter (src/lib/rate-limit/
 * limiter.ts), which uses Upstash Redis when UPSTASH_REDIS_REST_URL /
 * _TOKEN are configured and falls back to an in-memory sliding window
 * otherwise. This used to be its own bespoke in-process token bucket,
 * which meant the limit was only ever enforced per Node process — on a
 * serverless deployment (the app's stated Vercel target) concurrent
 * requests routinely land on different warm instances, each with its own
 * bucket, so the documented 60 req/min limit (also published in
 * openapi.json's RateLimited response doc) was trivially exceeded by
 * ordinary request fan-out, not just an attacker.
 */

/** Maximum requests per window. */
const MAX_REQUESTS = 60;
/** Window length in milliseconds (1 minute). */
const WINDOW_MS = 60_000;

export type V1RateLimitResult = {
  ok: boolean;
  /** Tokens left after this attempt (0 when `ok: false`). */
  remaining: number;
  /** Seconds the caller should wait before retrying — for the Retry-After header. */
  retryAfterSeconds: number;
};

/**
 * Consume one token for `keyId`. Returns `ok: false` when the bucket is
 * empty; the handler should respond with HTTP 429 and `Retry-After`.
 */
export async function consumeV1Token(keyId: string): Promise<V1RateLimitResult> {
  const result = await consumeAsync(`v1:${keyId}`, {
    max: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  });
  return {
    ok: result.ok,
    remaining: result.remaining,
    retryAfterSeconds: result.ok
      ? 0
      : Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
  };
}

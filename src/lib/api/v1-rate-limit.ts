import "server-only";

/**
 * Minimal in-process token bucket per API key for the `/api/v1` surface.
 *
 * Limits: 60 requests / 60 s per key. On exceedance the helper returns
 * an `ok: false` result along with the seconds remaining until the
 * bucket refills enough to admit another request, so the route handler
 * can set `Retry-After`.
 *
 * TODO: migrate to Upstash Redis when v1 traffic scales out of a single
 * Node process — the existing `src/lib/rate-limit/limiter.ts` already
 * has a Redis-backed `consumeAsync()` that we should reuse here.
 */

type Bucket = {
  /** Tokens currently available. */
  tokens: number;
  /** Last refill timestamp (ms). */
  lastRefillMs: number;
};

const buckets = new Map<string, Bucket>();

/** Maximum requests per window. */
const MAX_REQUESTS = 60;
/** Window length in milliseconds (1 minute). */
const WINDOW_MS = 60_000;
/** Refill rate in tokens per millisecond. */
const REFILL_PER_MS = MAX_REQUESTS / WINDOW_MS;

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
export function consumeV1Token(keyId: string): V1RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(keyId);
  if (!bucket) {
    bucket = { tokens: MAX_REQUESTS, lastRefillMs: now };
    buckets.set(keyId, bucket);
  }
  // Refill since the last hit.
  const elapsed = now - bucket.lastRefillMs;
  if (elapsed > 0) {
    bucket.tokens = Math.min(
      MAX_REQUESTS,
      bucket.tokens + elapsed * REFILL_PER_MS,
    );
    bucket.lastRefillMs = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: 0,
    };
  }

  // Bucket exhausted. Compute seconds until at least one token refills.
  const msUntilOne = (1 - bucket.tokens) / REFILL_PER_MS;
  const retryAfterSeconds = Math.max(1, Math.ceil(msUntilOne / 1000));
  return { ok: false, remaining: 0, retryAfterSeconds };
}

/** Test-only — clear all buckets. */
export function __resetV1RateLimit(): void {
  buckets.clear();
}

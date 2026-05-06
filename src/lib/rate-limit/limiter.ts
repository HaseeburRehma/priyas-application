import "server-only";

/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed by a string the caller provides (typically `${userId}:${action}` or
 * `${ip}:${action}` for unauthenticated routes). Counts are kept in a
 * Map<key, number[]> of millisecond timestamps; on each call we drop
 * entries older than the window and reject when count >= max.
 *
 * This is the right level for a single Node process — for production with
 * multiple replicas, swap the backing store to Redis (Upstash) without
 * changing the call sites.
 */
type Bucket = number[];
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Maximum number of permitted hits within the window. */
  max: number;
  /** Sliding-window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Try to consume one slot for `key`. Returns `{ ok: true, remaining }` on
 * success, `{ ok: false, retryAfterMs }` on overflow.
 */
export function consume(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - options.windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = [];
    buckets.set(key, bucket);
  }
  // Drop expired timestamps in place.
  while (bucket.length > 0 && bucket[0]! < cutoff) bucket.shift();

  if (bucket.length >= options.max) {
    const oldest = bucket[0]!;
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + options.windowMs - now),
    };
  }
  bucket.push(now);
  return { ok: true, remaining: options.max - bucket.length, retryAfterMs: 0 };
}

/** Drop a key — useful from tests. */
export function reset(key?: string) {
  if (key) buckets.delete(key);
  else buckets.clear();
}

/* ---------------------------------------------------------------------------
 * Sensible defaults — call these from server actions / route handlers.
 * ------------------------------------------------------------------------- */

export const LIMITS = {
  /** Login form: 10 attempts per 5 minutes per email. */
  login: { max: 10, windowMs: 5 * 60_000 },
  /** Generic write actions: 60 per minute per user. */
  write: { max: 60, windowMs: 60_000 },
  /** Heavy actions (PDF, Lexware sync): 10 per minute per user. */
  heavy: { max: 10, windowMs: 60_000 },
} as const;

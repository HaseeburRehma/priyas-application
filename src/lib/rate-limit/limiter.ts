import "server-only";

/**
 * Two-tier rate limiter.
 *
 * Tier 1 (production): Upstash Redis via REST API — globally consistent
 * across multi-replica deployments. Activated when both
 *   UPSTASH_REDIS_REST_URL  and  UPSTASH_REDIS_REST_TOKEN
 * are configured. Uses the fixed-window INCR + PEXPIRE pattern, which
 * is good enough for our use case (login throttling, write rate caps)
 * and avoids the round-trip cost of a sliding window.
 *
 * Tier 2 (fallback): in-memory sliding-window — fine for a single Node
 * process (local dev, single-replica self-host). The in-memory map
 * simply won't be shared between replicas, which is acceptable for
 * dev / staging.
 *
 * The two backends share one signature so call sites — `consume(key, opts)`
 * — never have to know which is active. We export both `consume` (sync,
 * memory-backed; back-compat with existing call sites) and `consumeAsync`
 * (Promise-returning, picks Redis when configured).
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

/* ---------------------------------------------------------------------- */
/* In-memory sliding window (dev / single-replica)                        */
/* ---------------------------------------------------------------------- */

/**
 * Sync in-memory consume. Kept for back-compat with existing call sites
 * that don't yet await rate-limit checks.
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

/* ---------------------------------------------------------------------- */
/* Upstash Redis (production / multi-replica)                             */
/* ---------------------------------------------------------------------- */

type UpstashConfig = { baseUrl: string; token: string };

function getUpstashConfig(): UpstashConfig | null {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

/**
 * Run a single Redis command via the Upstash REST API. We POST a JSON
 * array — `["INCR", key]` — and parse the result. On any error we throw,
 * letting `consumeAsync` decide whether to fall back to in-memory.
 */
async function upstashCmd(
  cfg: UpstashConfig,
  args: ReadonlyArray<string | number>,
): Promise<unknown> {
  const res = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Upstash ${args[0]} -> ${res.status}`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

/**
 * Pipeline a sequence of commands in one request — INCR + PEXPIRE in our
 * case. Upstash's `/pipeline` endpoint takes an array of commands and
 * returns an array of results.
 */
async function upstashPipeline(
  cfg: UpstashConfig,
  cmds: ReadonlyArray<ReadonlyArray<string | number>>,
): Promise<Array<{ result?: unknown; error?: string }>> {
  const res = await fetch(`${cfg.baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Upstash pipeline -> ${res.status}`);
  }
  return res.json();
}

async function consumeRedis(
  cfg: UpstashConfig,
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  // Fixed-window: bucket key includes the current window start so the
  // count auto-resets at the boundary.
  const now = Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const bucketKey = `rl:${key}:${windowStart}`;

  // Pipeline INCR + PEXPIRE so the window TTL is applied atomically with
  // the first hit. We compute remaining TTL on the client side from the
  // window length, avoiding a separate PTTL round-trip.
  const results = await upstashPipeline(cfg, [
    ["INCR", bucketKey],
    ["PEXPIRE", bucketKey, options.windowMs],
  ]);
  const incr = results[0]?.result;
  const count = typeof incr === "number" ? incr : Number(incr ?? 0);

  if (count > options.max) {
    const retryAfterMs = windowStart + options.windowMs - now;
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }
  return {
    ok: true,
    remaining: Math.max(0, options.max - count),
    retryAfterMs: 0,
  };
}

/**
 * Async consume that auto-picks the Redis backend when Upstash env is
 * configured, in-memory otherwise. New call sites should prefer this.
 *
 * If the Redis call fails (Upstash unreachable, token invalid), we log
 * once and fall back to the in-memory limiter so an Upstash outage
 * never lock-fails our app — a slight under-counting across replicas
 * is preferable to refusing all writes.
 */
let redisFailureLogged = false;
export async function consumeAsync(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const cfg = getUpstashConfig();
  if (cfg) {
    try {
      return await consumeRedis(cfg, key, options);
    } catch (err) {
      if (!redisFailureLogged) {
        redisFailureLogged = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[rate-limit] Upstash unreachable, falling back to in-memory:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return consume(key, options);
}

// Re-export the cmd helper for tests (not used at runtime).
export const __test_internals = { upstashCmd };

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

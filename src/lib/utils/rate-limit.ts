import "server-only";

type RateLimitEntry = {
  tokens: number;
  lastRefill: number;
};

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - 120_000;
  for (const [key, entry] of store) {
    if (entry.lastRefill < cutoff) store.delete(key);
  }
}

export type RateLimitConfig = {
  maxTokens: number;
  refillRate: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  api: { maxTokens: 60, refillRate: 60, windowMs: 60_000 } as RateLimitConfig,
  auth: { maxTokens: 10, refillRate: 10, windowMs: 60_000 } as RateLimitConfig,
} as const;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  cleanup();
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { tokens: config.maxTokens, lastRefill: now };
    store.set(key, entry);
  }

  const elapsed = now - entry.lastRefill;
  const refill = Math.floor(
    (elapsed / config.windowMs) * config.refillRate,
  );
  if (refill > 0) {
    entry.tokens = Math.min(config.maxTokens, entry.tokens + refill);
    entry.lastRefill = now;
  }

  if (entry.tokens > 0) {
    entry.tokens -= 1;
    return { allowed: true, remaining: entry.tokens };
  }

  const msPerToken = config.windowMs / config.refillRate;
  return { allowed: false, retryAfterMs: Math.ceil(msPerToken) };
}

export function rateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig,
): Record<string, string> {
  if (result.allowed) {
    return {
      "X-RateLimit-Limit": String(config.maxTokens),
      "X-RateLimit-Remaining": String(result.remaining),
    };
  }
  return {
    "X-RateLimit-Limit": String(config.maxTokens),
    "X-RateLimit-Remaining": "0",
    "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
  };
}

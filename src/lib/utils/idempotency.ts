import "server-only";

type CachedResult = {
  result: unknown;
  expiresAt: number;
};

const store = new Map<string, CachedResult>();

const TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

export async function withIdempotency<T>(
  key: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn();

  cleanup();
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result as T;
  }

  const result = await fn();
  store.set(key, { result, expiresAt: Date.now() + TTL_MS });
  return result;
}

import "server-only";

export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = (performance.now() - start).toFixed(1);
    if (process.env.NODE_ENV === "development" || Number(ms) > 500) {
      console.log(`[perf] ${label}: ${ms}ms`);
    }
  }
}

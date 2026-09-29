export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5_000,
    shouldRetry = () => true,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) * jitter,
        maxDelayMs,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

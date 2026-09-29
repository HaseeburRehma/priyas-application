type CircuitState = "closed" | "open" | "half_open";

type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailure = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure >= this.resetTimeoutMs) {
        this.state = "half_open";
      } else {
        throw new CircuitOpenError(this.resetTimeoutMs);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures += 1;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }
}

export class CircuitOpenError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Circuit breaker is open — retry after ${retryAfterMs}ms`);
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

// A fixed-window rate limiter for the provider-token exchange (POST /auth/session). It runs before the
// Authorization header is read, so a flood of attempts never reaches the identity provider. The state is
// process-local: a restart resets it, which is acceptable for the single-instance owner-only BFF.
const WINDOW_MS = 60_000;

interface Window {
  readonly start: number;
  readonly count: number;
}

export class SignInRateLimiter {
  private windows: ReadonlyMap<string, Window> = new Map();

  constructor(
    private readonly now: () => number,
    private readonly limitPerMinute: number,
  ) {}

  /** True when this attempt is within the key's current window and is counted; false when refused. */
  tryAcquire(key: string): boolean {
    const at = this.now();
    const next = new Map<string, Window>();
    // Sweep windows that have ended so the map is bounded by the keys seen in the last minute.
    for (const [existingKey, window] of this.windows) {
      if (at - window.start < WINDOW_MS) next.set(existingKey, window);
    }
    const current = next.get(key);
    const allowed = current === undefined || current.count < this.limitPerMinute;
    if (current === undefined) next.set(key, { start: at, count: 1 });
    else if (allowed) next.set(key, { start: current.start, count: current.count + 1 });
    this.windows = next;
    return allowed;
  }

  /** Number of tracked keys (for tests). */
  size(): number {
    return this.windows.size;
  }
}

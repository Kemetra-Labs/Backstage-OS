// A fixed-window limiter for the evidence write routes (BACK-172 G2), the same design as auth/sign-in-rate-limiter.ts
// but with a hard cap on tracked keys. Keyed per workspace, principal and action. Process-local: a restart resets
// it, which is acceptable for the single-instance BFF. Windows that have ended are swept on every call, so the
// map holds only keys seen in the last minute; at the cap a NEW key is refused (fail closed) and never stored.
const WINDOW_MS = 60_000;
export const WRITE_LIMIT_PER_MINUTE = 30;
const MAX_KEYS = 10_000;

interface Window {
  readonly start: number;
  readonly count: number;
}

export type WriteAction = 'decision.create' | 'note.create' | 'investigation.create';

export const writeLimitKey = (workspaceId: string, userId: string, action: WriteAction | string): string => `${workspaceId}:${userId}:${action}`;

export class WriteRateLimiter {
  private windows: ReadonlyMap<string, Window> = new Map();

  constructor(
    private readonly now: () => number,
    private readonly limitPerMinute: number = WRITE_LIMIT_PER_MINUTE,
    private readonly maxKeys: number = MAX_KEYS,
  ) {}

  /** True when this write is within the key's current window and is counted; false when refused. */
  tryAcquire(key: string): boolean {
    const at = this.now();
    const next = new Map<string, Window>();
    for (const [existingKey, window] of this.windows) {
      if (at - window.start < WINDOW_MS) next.set(existingKey, window);
    }
    const current = next.get(key);
    let allowed: boolean;
    if (current === undefined) {
      allowed = next.size < this.maxKeys;
      if (allowed) next.set(key, { start: at, count: 1 });
    } else {
      allowed = current.count < this.limitPerMinute;
      if (allowed) next.set(key, { start: current.start, count: current.count + 1 });
    }
    this.windows = next;
    return allowed;
  }

  /** Number of tracked keys (for tests). */
  size(): number {
    return this.windows.size;
  }
}

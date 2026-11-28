// BACK-154: how many cognition memory reads may run at once. The per-user rate limit bounds reads per minute,
// not reads in flight; this bounds those, below the app pool of 10 connections, so cognition can never take
// every connection. Past the cap a read is refused at once (fail closed), never queued.

/** Cognition reads allowed in flight across the process. */
export const COGNITION_READS_IN_FLIGHT = 4;

export class ReadSlots {
  private used = 0;

  constructor(private readonly max: number) {
    if (!Number.isSafeInteger(max) || max < 1) throw new RangeError('read slots: invalid max');
  }

  get inFlight(): number {
    return this.used;
  }

  /** Takes a slot if one is free. Every true must be paired with exactly one release(). */
  tryAcquire(): boolean {
    if (this.used >= this.max) return false;
    this.used++;
    return true;
  }

  release(): void {
    if (this.used > 0) this.used--;
  }
}

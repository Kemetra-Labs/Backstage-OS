// The session in the app (BACK-51 P2, owner decision D3 (b), 2026-11-26). Live mode only: in the default build nothing creates
// a SessionStore, so the fixture demo makes no request. With src/live/reads.ts, the only module allowed to import the request
// module (src/live/live.guard.test.ts).
//
// The app is signed in only from a 200 of GET /api/auth/me naming the owner role. 401 and 404 are the same on purpose, so both
// read as signed out; a network or gateway failure reads as unavailable, never as signed in. The subject id the server returns
// is never kept: the app only needs to know that the owner is signed in.
//
// A panel read that fails not_found cannot tell an expired session from a hidden case. The store re-checks /auth/me, but only
// while it believes it is signed in, and one check at a time: a 200 means the case is hidden or missing (nothing else changes),
// a not_found means the session ended. Drafts (P3's unsent decision) live here, above every screen, in memory only, so they
// survive the session ending and the sign-in that follows. An explicit sign-out clears them: a shared machine keeps nothing.
import { apiRequest, SESSION_CHECK_PATH, type Fetcher } from './http';

/**
 * The sign-in page (D3(a)): a path of the app itself, not an /api/ path, so a reverse proxy must serve the app's index.html for it.
 * Live mode only (src/live/signInFlow.ts isSignInRoute); the Descope magic link returns here with a token in the query.
 */
export const SIGN_IN_PATH = '/sign-in';
const SIGN_OUT_PATH = '/api/auth/session';

/**
 * checking: the first check is in flight. ended: the owner was signed in and a later check said not_found. unavailable: the
 * server could not be reached, so the state is unknown. error: any other answer, including a malformed 200.
 */
export type SessionStatus = 'checking' | 'signedIn' | 'signedOut' | 'ended' | 'unavailable' | 'error';

export interface SessionSnapshot {
  readonly status: SessionStatus;
  /** Increases each time the status becomes signedIn, so live panels read again after a (re-)sign-in. */
  readonly generation: number;
  /** The last sign-out did not reach the server: the session may still be live. */
  readonly signOutFailed: boolean;
}

type CheckResult = 'signedIn' | 'signedOut' | 'unavailable' | 'error';

/**
 * The key a live panel reads under. It changes on a (re-)sign-in (generation) and when the session is signed out or ended, so the
 * panel drops what it held, shows loading, and reads again: after sign-out or expiry no panel keeps the owner's data on screen.
 * An unreachable server changes nothing (it did not say the session is gone). null session = fixture mode: the plain key.
 */
export function liveReadKey(key: string, s: SessionSnapshot | null): string {
  if (s === null) return key;
  return `${key}#${s.generation}${s.status === 'signedOut' || s.status === 'ended' ? '#out' : ''}`;
}

const isOwner = (body: unknown): boolean => {
  const user = typeof body === 'object' && body !== null ? (body as { user?: unknown }).user : undefined;
  return typeof user === 'object' && user !== null && (user as { role?: unknown }).role === 'owner';
};

/** GET /api/auth/me. null when aborted. */
export async function checkSession(signal?: AbortSignal, fetcher?: Fetcher): Promise<CheckResult | null> {
  const r = await apiRequest(SESSION_CHECK_PATH, { signal, fetcher });
  if (r.ok) return isOwner(r.body) ? 'signedIn' : 'error';
  if (r.aborted) return null;
  if (r.failure === 'not_found') return 'signedOut';
  return r.failure === 'unavailable' ? 'unavailable' : 'error';
}

export class SessionStore {
  private snapshot: SessionSnapshot = { status: 'checking', generation: 0, signOutFailed: false };
  private readonly listeners = new Set<() => void>();
  private readonly drafts = new Map<string, unknown>();
  private inflight: Promise<void> | null = null;
  /** Bumped by an explicit sign-out: a check that started before it must not apply its answer. */
  private epoch = 0;
  /** The owner was signed in at some point since the last explicit sign-out: a later not_found is an ended session. */
  private hadSession = false;

  constructor(private readonly fetcher?: Fetcher) {}

  /** For useSyncExternalStore. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  /** The first check, on app start. */
  start(): Promise<void> {
    return this.recheck();
  }

  /** Check GET /api/auth/me now (start, "Check again", or after a panel's not_found). Concurrent calls share one request. */
  recheck(): Promise<void> {
    if (this.inflight === null) {
      const p: Promise<void> = this.runCheck().finally(() => { if (this.inflight === p) this.inflight = null; });
      this.inflight = p;
    }
    return this.inflight;
  }

  /** A live read failed not_found. Only a signed-in session is re-checked: before that, signed out is already the answer. */
  reportNotFound(): void {
    if (this.snapshot.status === 'signedIn') void this.recheck();
  }

  /**
   * DELETE /api/auth/session. The server answers a refused request (for example a foreign Origin) with the same uniform 404 as an
   * already-expired session, so a not_found is signed out only when GET /api/auth/me also says so; any other answer to that
   * re-check (the owner, unavailable, error) is a failed sign-out: never claim signed out without proof.
   */
  async signOut(): Promise<void> {
    const r = await apiRequest(SIGN_OUT_PATH, { method: 'DELETE', fetcher: this.fetcher });
    const ended = r.ok || (r.failure === 'not_found' && (await checkSession(undefined, this.fetcher)) === 'signedOut');
    if (ended) {
      this.epoch += 1;
      this.inflight = null;
      this.hadSession = false;
      this.drafts.clear();
      this.set({ status: 'signedOut', signOutFailed: false });
    } else {
      this.set({ signOutFailed: true });
    }
  }

  getDraft<T>(key: string): T | undefined {
    return this.drafts.get(key) as T | undefined;
  }

  /** undefined removes the draft. */
  setDraft<T>(key: string, value: T | undefined): void {
    if (value === undefined) this.drafts.delete(key);
    else this.drafts.set(key, value);
  }

  private async runCheck(): Promise<void> {
    const epoch = this.epoch;
    const result = await checkSession(undefined, this.fetcher);
    if (result === null || epoch !== this.epoch) return;
    const was = this.snapshot.status;
    if (result === 'signedIn') {
      this.hadSession = true;
      if (was !== 'signedIn') this.set({ status: 'signedIn', generation: this.snapshot.generation + 1, signOutFailed: false });
      return;
    }
    if (result === 'signedOut') {
      this.set({ status: this.hadSession ? 'ended' : 'signedOut', signOutFailed: false });
      return;
    }
    this.set({ status: result });
  }

  private set(patch: Partial<SessionSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const s = this.snapshot;
    if (next.status === s.status && next.generation === s.generation && next.signOutFailed === s.signOutFailed) return;
    this.snapshot = next;
    for (const fn of [...this.listeners]) fn();
  }
}

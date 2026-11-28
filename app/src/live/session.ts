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
//
// BACK-127 (SEC-02). Locked: the owner was signed in and the session is now ended, unverifiable (unavailable, error) or a sign-out
// did not reach the server. Panels drop their data (liveReadKey), drafts are hidden (useSessionDraft) and the owner is told in
// words. The store also keeps the user id of the last successful check, in memory only and never in the snapshot: a different id
// clears every draft. On return to the tab (visible, online) it re-checks through the read-only /auth/session-state, at most once
// a minute and never on a timer, so the check cannot extend the server's idle window.
import { apiRequest, SESSION_CHECK_PATH, SESSION_STATE_PATH, type Fetcher } from './http';
import type { LiveRead } from './reads';

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
  /**
   * Derived, never stored outside memory: the owner was signed in since the last explicit sign-out and the session is now ended,
   * unavailable or unreadable, or the last sign-out failed. Nothing protected may be on screen while it is true.
   */
  readonly locked: boolean;
}

type CheckResult = 'signedIn' | 'signedOut' | 'unavailable' | 'error';

/**
 * The key a live panel reads under. It changes on a (re-)sign-in (generation) and when the session is signed out or ended, so the
 * panel drops what it held, shows loading, and reads again: after sign-out or expiry no panel keeps the owner's data on screen.
 * A locked session (was signed in, now unverifiable or a failed sign-out) has its own key too, so nothing stays on screen that the
 * server can no longer vouch for; before any sign-in an unreachable server changes nothing. null session = fixture mode: the plain key.
 */
export function liveReadKey(key: string, s: SessionSnapshot | null): string {
  if (s === null) return key;
  return `${key}#${s.generation}${s.status === 'signedOut' || s.status === 'ended' ? '#out' : ''}${s.locked ? '#locked' : ''}`;
}

/** The owner's user id, or null: a 200 without the owner role and a string id is not a sign-in (it reads as an error). */
const ownerOf = (body: unknown): { readonly id: string } | null => {
  const user = typeof body === 'object' && body !== null ? (body as { user?: unknown }).user : undefined;
  if (typeof user !== 'object' || user === null || (user as { role?: unknown }).role !== 'owner') return null;
  const id = (user as { id?: unknown }).id;
  return typeof id === 'string' && id !== '' ? { id } : null;
};

interface Checked {
  readonly result: CheckResult;
  /** The user id of a successful check (null otherwise). Held only in a private field of the store: see SessionStore. */
  readonly userId: string | null;
}

async function readCheck(path: string, signal?: AbortSignal, fetcher?: Fetcher): Promise<Checked | null> {
  const r = await apiRequest(path, { signal, fetcher });
  if (r.ok) {
    const owner = ownerOf(r.body);
    return owner ? { result: 'signedIn', userId: owner.id } : { result: 'error', userId: null };
  }
  // Aborted, or rate limited (429): no answer. The caller keeps the state it has.
  if (r.aborted || r.failure === 'rate_limited') return null;
  if (r.failure === 'not_found') return { result: 'signedOut', userId: null };
  return { result: r.failure === 'unavailable' ? 'unavailable' : 'error', userId: null };
}

/** GET /api/auth/me. null when aborted. */
export async function checkSession(signal?: AbortSignal, fetcher?: Fetcher): Promise<CheckResult | null> {
  return (await readCheck(SESSION_CHECK_PATH, signal, fetcher))?.result ?? null;
}

/** The least time between two return-to-tab checks (BACK-127 E(a)). */
export const REVALIDATE_MIN_MS = 60_000;

/**
 * Re-check the session when the owner comes back: the tab becomes visible, or the browser is back online. Never on a timer. The
 * store applies its own floor, so a burst of events makes one request. Returns the cleanup. The targets are injected for tests.
 */
export function listenForReturn(
  store: { revalidate(): Promise<void> },
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onVisible = () => { if (doc.visibilityState === 'visible') void store.revalidate(); };
  const onOnline = () => { void store.revalidate(); };
  doc.addEventListener('visibilitychange', onVisible);
  win.addEventListener('online', onOnline);
  return () => {
    doc.removeEventListener('visibilitychange', onVisible);
    win.removeEventListener('online', onOnline);
  };
}

export class SessionStore {
  private snapshot: SessionSnapshot = { status: 'checking', generation: 0, signOutFailed: false, locked: false };
  private readonly listeners = new Set<() => void>();
  private readonly drafts = new Map<string, unknown>();
  private inflight: Promise<void> | null = null;
  /** Bumped by an explicit sign-out: a check that started before it must not apply its answer. */
  private epoch = 0;
  /** The owner was signed in at some point since the last explicit sign-out: a later not_found is an ended session. */
  private hadSession = false;
  /** The user id of the last successful check: memory only, never in the snapshot, storage or a log. A different id clears the drafts. */
  private identity: string | null = null;
  /** When the last check that got an answer finished, on the monotonic clock (null: none yet). Start and manual checks count too. */
  private lastAnsweredAt: number | null = null;

  /** `now` is monotonic (performance.now) by default, so a change of the system clock cannot move the revalidate floor. */
  constructor(
    private readonly fetcher?: Fetcher,
    private readonly now: () => number = () => performance.now(),
  ) {}

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
    return this.check(SESSION_CHECK_PATH);
  }

  /**
   * The check on return to the tab (BACK-127 E(a)): GET /api/auth/session-state, which does not extend the server's idle window.
   * At most one answered check per REVALIDATE_MIN_MS (start and manual checks count), never on a timer, and it joins a check
   * already in flight. Nothing to do for an owner who never signed in: there is nothing to protect.
   */
  revalidate(): Promise<void> {
    if (this.inflight !== null) return this.inflight;
    if (!this.hadSession) return Promise.resolve();
    if (this.lastAnsweredAt !== null && this.now() - this.lastAnsweredAt < REVALIDATE_MIN_MS) return Promise.resolve();
    return this.check(SESSION_STATE_PATH);
  }

  private check(path: string): Promise<void> {
    if (this.inflight === null) {
      const p: Promise<void> = this.runCheck(path).finally(() => { if (this.inflight === p) this.inflight = null; });
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
      this.identity = null;
      this.drafts.clear();
      this.set({ status: 'signedOut', signOutFailed: false });
    } else {
      // BACK-127 F: the owner asked to sign out, so the drafts go either way; the screen stays locked until the server confirms.
      // Only a confirmed sign-out clears the failure: no later check does (I1).
      this.drafts.clear();
      if (this.hadSession) this.set({ signOutFailed: true });
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

  private async runCheck(path: string): Promise<void> {
    const epoch = this.epoch;
    const checked = await readCheck(path, undefined, this.fetcher);
    if (checked === null || epoch !== this.epoch) return;
    this.lastAnsweredAt = this.now();
    const { result } = checked;
    const was = this.snapshot.status;
    if (result === 'signedIn' && checked.userId !== null) {
      // A different user id means another person is behind this session: their drafts go, and the generation moves so every panel
      // drops the previous user's records, before anything renders.
      const changed = this.identity !== null && this.identity !== checked.userId;
      if (changed) this.drafts.clear();
      this.identity = checked.userId;
      this.hadSession = true;
      if (was !== 'signedIn' || changed) this.set({ status: 'signedIn', generation: this.snapshot.generation + 1 });
      return;
    }
    if (result === 'signedOut') {
      this.set({ status: this.hadSession ? 'ended' : 'signedOut' });
      return;
    }
    this.set({ status: result });
  }

  private set(patch: Partial<Omit<SessionSnapshot, 'locked'>>): void {
    const merged = { ...this.snapshot, ...patch };
    const locked = this.hadSession && (merged.status === 'ended' || merged.status === 'unavailable' || merged.status === 'error' || merged.signOutFailed);
    const next: SessionSnapshot = { ...merged, locked };
    const s = this.snapshot;
    if (next.status === s.status && next.generation === s.generation && next.signOutFailed === s.signOutFailed && next.locked === s.locked) return;
    this.snapshot = next;
    for (const fn of [...this.listeners]) fn();
  }
}

/** A live panel's held answer for `key`, or loading: an answer read under another key (an old generation, or before a lock) is never used. */
export function heldFor<T>(held: { readonly key: string; readonly read: LiveRead<T> } | null, key: string): LiveRead<T> {
  return held !== null && held.key === key ? held.read : { status: 'loading' };
}

/** Whether the owner's records must not be on screen: locked, signed out or ended. Fixture mode (null) never hides. */
export function hidesRecords(s: SessionSnapshot | null): boolean {
  return s !== null && (s.locked || s.status === 'signedOut' || s.status === 'ended');
}

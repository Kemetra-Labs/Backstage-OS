// BACK-51 P2: the session in the app. The fetcher is injected: nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import { checkSession, SIGN_IN_PATH, liveReadKey, listenForReturn, REVALIDATE_MIN_MS, SessionStore, type SessionSnapshot } from './session';

type Reply = readonly [number, string] | 'network';
const OWNER = '{"user":{"id":"00000000-0000-4000-8000-00000000000a","role":"owner"}}';

/** A fetcher that answers each `METHOD path` from a queue (the last answer repeats), recording every call. */
function server(table: Record<string, Reply[]>) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push(key);
    const q = table[key];
    if (!q || q.length === 0) throw new TypeError(`unexpected ${key}`);
    const reply = q.length > 1 ? q.shift()! : q[0]!;
    if (reply === 'network') throw new TypeError('Failed to fetch');
    return new Response(reply[0] === 204 ? null : reply[1], { status: reply[0] });
  });
  return { fetcher, calls };
}

const ME = 'GET /api/auth/me';
const STATE = 'GET /api/auth/session-state';
const OUT = 'DELETE /api/auth/session';

async function started(table: Record<string, Reply[]>) {
  const s = server(table);
  const store = new SessionStore(s.fetcher);
  await store.start();
  return { store, ...s };
}

describe('checkSession', () => {
  it('is signed in only for a 200 naming the owner role', async () => {
    expect(await checkSession(undefined, server({ [ME]: [[200, OWNER]] }).fetcher)).toBe('signedIn');
  });

  it('reads a malformed or non-owner 200 as an error, never as signed in', async () => {
    for (const body of ['{}', '{"user":null}', '{"user":{"id":"x"}}', '{"user":{"role":"admin"}}', '{"user":{"role":"owner"}}', '{"user":{"role":"owner","id":""}}', '{"user":{"role":"owner","id":7}}', '[]', 'null', 'not json', ''])
      expect(await checkSession(undefined, server({ [ME]: [[200, body]] }).fetcher), body).toBe('error');
  });

  it('reads 401 and 404 as signed out, and a network or gateway failure as unavailable', async () => {
    expect(await checkSession(undefined, server({ [ME]: [[401, '']] }).fetcher)).toBe('signedOut');
    expect(await checkSession(undefined, server({ [ME]: [[404, '{"error":{}}']] }).fetcher)).toBe('signedOut');
    expect(await checkSession(undefined, server({ [ME]: ['network'] }).fetcher)).toBe('unavailable');
    expect(await checkSession(undefined, server({ [ME]: [[502, '']] }).fetcher)).toBe('unavailable');
  });

  it('reads any other failure as an error', async () => {
    for (const st of [400, 500]) expect(await checkSession(undefined, server({ [ME]: [[st, '']] }).fetcher), String(st)).toBe('error');
    expect(await checkSession(undefined, server({ [ME]: [[429, '']] }).fetcher)).toBeNull(); // rate limited: no answer
  });

  it('is null when aborted', async () => {
    const c = new AbortController();
    c.abort();
    const f = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    expect(await checkSession(c.signal, f)).toBeNull();
  });

  it('links the sign-in page, a path of the app itself (not an /api/ path)', () => {
    expect(SIGN_IN_PATH).toBe('/sign-in');
  });
});

describe('SessionStore', () => {
  it('starts checking, then follows GET /api/auth/me', async () => {
    const s = server({ [ME]: [[200, OWNER]] });
    const store = new SessionStore(s.fetcher);
    expect(store.getSnapshot()).toEqual({ status: 'checking', generation: 0, signOutFailed: false, locked: false });
    await store.start();
    expect(store.getSnapshot()).toEqual({ status: 'signedIn', generation: 1, signOutFailed: false, locked: false });
    expect(s.calls).toEqual([ME]);
  });

  it('shows signed out, unavailable or error at start, never signed in', async () => {
    expect((await started({ [ME]: [[401, '']] })).store.getSnapshot().status).toBe('signedOut');
    expect((await started({ [ME]: ['network'] })).store.getSnapshot().status).toBe('unavailable');
    expect((await started({ [ME]: [[200, '{}']] })).store.getSnapshot().status).toBe('error');
  });

  it('never shows ended to someone never signed in: a panel 404 before or after the first check is ignored', async () => {
    const s = server({ [ME]: [[404, '']] });
    const store = new SessionStore(s.fetcher);
    store.reportNotFound(); // panel 404 while the first check is in flight
    await store.start();
    store.reportNotFound(); // and after it
    await Promise.resolve();
    expect(store.getSnapshot().status).toBe('signedOut');
    expect(s.calls).toEqual([ME]);
  });

  it('ends the session when a later 404 is confirmed by GET /api/auth/me', async () => {
    const { store, calls } = await started({ [ME]: [[200, OWNER], [401, '']] });
    store.reportNotFound();
    expect(store.getSnapshot().status).toBe('signedIn'); // no flicker while it rechecks
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe('ended'));
    expect(calls).toEqual([ME, ME]);
  });

  it('a 404 with a live session stays signed in (a hidden or missing case reveals nothing more)', async () => {
    const { store, calls } = await started({ [ME]: [[200, OWNER]] });
    const before = store.getSnapshot();
    store.reportNotFound();
    await vi.waitFor(() => expect(calls).toEqual([ME, ME]));
    await Promise.resolve();
    expect(store.getSnapshot()).toBe(before); // same object: nothing changed, panels are not re-read
  });

  it('dedupes concurrent rechecks: two panels that 404 make one call', async () => {
    const { store, calls } = await started({ [ME]: [[200, OWNER], [404, '']] });
    store.reportNotFound();
    store.reportNotFound();
    await Promise.all([store.recheck(), store.recheck()]);
    expect(calls).toEqual([ME, ME]);
    expect(store.getSnapshot().status).toBe('ended');
  });

  it('stays ended until a recheck signs in again, which bumps the generation', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, ''], [404, ''], [200, OWNER]] });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'ended', generation: 1 });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'ended', generation: 1 });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', generation: 2 });
  });

  it('a recheck from signed out that signs in bumps the generation; an unreachable server is never signed in', async () => {
    const { store } = await started({ [ME]: [[401, ''], 'network', [200, OWNER]] });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', generation: 0 });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', generation: 1 });
  });

  it('an unreachable recheck while signed in says unavailable, not ended', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], 'network'] });
    store.reportNotFound();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe('unavailable'));
  });

  it('notifies subscribers on change, and stops after unsubscribe', async () => {
    const s = server({ [ME]: [[200, OWNER], [404, '']] });
    const store = new SessionStore(s.fetcher);
    const fn = vi.fn();
    const off = store.subscribe(fn);
    await store.start();
    expect(fn).toHaveBeenCalledTimes(1); // checking is the initial state, so only signedIn is a change
    off();
    await store.recheck();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('sign-out', () => {
    it('DELETE /api/auth/session, then signed out', async () => {
      const { store, calls } = await started({ [ME]: [[200, OWNER]], [OUT]: [[204, '']] });
      await store.signOut();
      expect(calls).toEqual([ME, OUT]);
      expect(store.getSnapshot()).toMatchObject({ status: 'signedOut', signOutFailed: false });
    });

    it('a session that had already expired (not_found, confirmed by /auth/me) is signed out too', async () => {
      const { store, calls } = await started({ [ME]: [[200, OWNER], [401, '']], [OUT]: [[401, '']] });
      store.setDraft('decision:a', 'unsent');
      await store.signOut();
      expect(calls).toEqual([ME, OUT, ME]);
      expect(store.getSnapshot()).toMatchObject({ status: 'signedOut', signOutFailed: false });
      expect(store.getDraft('decision:a')).toBeUndefined();
    });

    it('a refused sign-out (uniform 404) while /auth/me still names the owner is a failed sign-out', async () => {
      const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: [[404, '{"error":{}}']] });
      store.setDraft('decision:a', 'unsent');
      await store.signOut();
      expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', signOutFailed: true, locked: true });
      expect(store.getDraft('decision:a')).toBeUndefined(); // BACK-127 F: the owner asked to sign out, so drafts go either way
    });

    it('a sign-out 404 whose re-check is unavailable or an error is a failed sign-out, never signed out', async () => {
      for (const reply of ['network', [502, ''], [500, ''], [200, '{}']] as Reply[]) {
        const { store } = await started({ [ME]: [[200, OWNER], reply], [OUT]: [[404, '']] });
        await store.signOut();
        expect(store.getSnapshot(), JSON.stringify(reply)).toMatchObject({ status: 'signedIn', signOutFailed: true });
      }
    });

    it('sign-out that cannot reach the server is not signed out: the cookie may still be live', async () => {
      for (const reply of ['network', [502, ''], [500, '']] as Reply[]) {
        const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: [reply] });
        await store.signOut();
        expect(store.getSnapshot(), JSON.stringify(reply)).toMatchObject({ status: 'signedIn', signOutFailed: true });
      }
    });

    it('a later successful sign-out or sign-in clears the failure', async () => {
      const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: ['network', [204, '']] });
      await store.signOut();
      expect(store.getSnapshot().signOutFailed).toBe(true);
      await store.signOut();
      expect(store.getSnapshot()).toMatchObject({ status: 'signedOut', signOutFailed: false });
    });
  });

  describe('drafts', () => {
    it('are held in memory by key', async () => {
      const { store } = await started({ [ME]: [[200, OWNER]] });
      expect(store.getDraft('decision:a')).toBeUndefined();
      store.setDraft('decision:a', { decision: 'Roll back', rationale: 'عربي' });
      store.setDraft('decision:b', 'x');
      expect(store.getDraft('decision:a')).toEqual({ decision: 'Roll back', rationale: 'عربي' });
      store.setDraft('decision:b', undefined);
      expect(store.getDraft('decision:b')).toBeUndefined();
    });

    it('survive a session that ends and the sign-in that follows', async () => {
      const { store } = await started({ [ME]: [[200, OWNER], [404, ''], [200, OWNER]] });
      store.setDraft('decision:a', 'unsent');
      await store.recheck();
      expect(store.getSnapshot().status).toBe('ended');
      expect(store.getDraft('decision:a')).toBe('unsent');
      await store.recheck();
      expect(store.getSnapshot().status).toBe('signedIn');
      expect(store.getDraft('decision:a')).toBe('unsent');
    });

    it('are cleared by an explicit sign-out (a shared machine keeps nothing), also when the sign-out fails', async () => {
      const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: ['network', [204, '']] });
      store.setDraft('decision:a', 'unsent');
      await store.signOut();
      expect(store.getDraft('decision:a')).toBeUndefined();
      store.setDraft('decision:b', 'typed after the failure');
      await store.signOut();
      expect(store.getDraft('decision:b')).toBeUndefined();
    });
  });
});

describe('liveReadKey (no panel keeps the owner data after the session is gone)', () => {
  const snap = (status: SessionSnapshot['status'], generation = 1, locked = false): SessionSnapshot => ({ status, generation, signOutFailed: false, locked });

  it('is the plain key in fixture mode (no session)', () => {
    expect(liveReadKey('portfolio', null)).toBe('portfolio');
  });

  it('changes when the session signs out or ends, so the held read is dropped and read again', () => {
    const inKey = liveReadKey('portfolio', snap('signedIn'));
    expect(liveReadKey('portfolio', snap('signedOut'))).not.toBe(inKey);
    expect(liveReadKey('portfolio', snap('ended', 1, true))).not.toBe(inKey);
    expect(liveReadKey('portfolio', snap('signedOut'))).toContain('#out');
    expect(liveReadKey('portfolio', snap('ended', 1, true))).toContain('#out');
  });

  it('changes with the generation, so a re-sign-in reads again', () => {
    expect(liveReadKey('portfolio', snap('signedIn', 1))).not.toBe(liveReadKey('portfolio', snap('signedIn', 2)));
  });

  it('unavailable before ever signing in changes nothing (nothing to protect)', () => {
    expect(liveReadKey('portfolio', snap('unavailable'))).toBe(liveReadKey('portfolio', snap('signedIn')));
  });

  it('a locked session (was signed in, now unverifiable) has its own key, so the held read is dropped (BACK-127)', () => {
    const inKey = liveReadKey('portfolio', snap('signedIn'));
    for (const st of ['unavailable', 'error', 'ended'] as const) {
      const k = liveReadKey('portfolio', snap(st, 1, true));
      expect(k, st).not.toBe(inKey);
      expect(k, st).toContain('#locked');
    }
    expect(liveReadKey('portfolio', snap('signedIn', 1, true))).toContain('#locked'); // a failed sign-out
  });

  it('stays distinct per panel key', () => {
    expect(liveReadKey('a', snap('signedIn'))).not.toBe(liveReadKey('b', snap('signedIn')));
  });
});

describe('SessionStore races', () => {
  it('a recheck that was in flight when sign-out finished cannot sign the owner back in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let me = 0;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/auth/me') {
        me += 1;
        if (me === 2) { await gate; return new Response(OWNER, { status: 200 }); } // the stale check, answered after the revoke
        return new Response(OWNER, { status: 200 });
      }
      expect(init?.method).toBe('DELETE');
      return new Response(null, { status: 204 });
    });
    const store = new SessionStore(fetcher);
    await store.start();
    store.reportNotFound(); // second /me, held open
    await store.signOut();
    expect(store.getSnapshot().status).toBe('signedOut');
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getSnapshot()).toMatchObject({ status: 'signedOut' });
  });

  it('keeps saying ended across an unreachable blip', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, ''], 'network', [404, '']] });
    await store.recheck();
    expect(store.getSnapshot().status).toBe('ended');
    await store.recheck();
    expect(store.getSnapshot().status).toBe('unavailable');
    await store.recheck();
    expect(store.getSnapshot().status).toBe('ended');
  });

  it('signed in, then unreachable, then not found reads ended, not never-signed-in', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], 'network', [404, '']] });
    await store.recheck();
    await store.recheck();
    expect(store.getSnapshot().status).toBe('ended');
  });

  it('after an explicit sign-out a later not_found is plain signed out, not ended', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [401, '']], [OUT]: [[204, '']] });
    await store.signOut();
    await store.recheck();
    expect(store.getSnapshot().status).toBe('signedOut');
  });
});

const STATE_PATH = '/api/auth/session-state';
const OTHER = '{"user":{"id":"00000000-0000-4000-8000-0000000000bb","role":"owner"}}';

describe('locked (BACK-127 SEC-02 G1, G5)', () => {
  it('unavailable or error after a sign-in lock; before any sign-in they do not', async () => {
    const before = await started({ [ME]: ['network'] });
    expect(before.store.getSnapshot()).toMatchObject({ status: 'unavailable', locked: false });
    const e0 = await started({ [ME]: [[200, '{}']] });
    expect(e0.store.getSnapshot()).toMatchObject({ status: 'error', locked: false });

    const u = await started({ [ME]: [[200, OWNER], 'network'] });
    await u.store.recheck();
    expect(u.store.getSnapshot()).toMatchObject({ status: 'unavailable', locked: true });
    const e = await started({ [ME]: [[200, OWNER], [200, '{}']] });
    await e.store.recheck();
    expect(e.store.getSnapshot()).toMatchObject({ status: 'error', locked: true });
  });

  it('an ended session is locked, and signed in unlocks with a new generation', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, ''], [200, OWNER]] });
    expect(store.getSnapshot().locked).toBe(false);
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'ended', locked: true });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', generation: 2, locked: false });
  });

  it('the read key changes when the session locks and again when it unlocks', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], 'network', [200, OWNER]] });
    const k0 = liveReadKey('p', store.getSnapshot());
    await store.recheck();
    const k1 = liveReadKey('p', store.getSnapshot());
    await store.recheck();
    const k2 = liveReadKey('p', store.getSnapshot());
    expect(new Set([k0, k1, k2]).size).toBe(3);
  });

  it('a failed sign-out locks (still signedIn, so the server may hold the session) and says so; a later confirmed one unlocks to signed out', async () => {
    const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: ['network', [204, '']] });
    store.setDraft('decision:a', 'unsent');
    await store.signOut();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', signOutFailed: true, locked: true });
    expect(store.getDraft('decision:a')).toBeUndefined();
    await store.signOut();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedOut', signOutFailed: false, locked: false });
  });

  it('a locked store is notified so panels drop their data', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], 'network'] });
    const fn = vi.fn();
    store.subscribe(fn);
    await store.recheck();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('in-memory identity (BACK-127 SEC-02 G3)', () => {
  it('the same identity signing in again keeps the drafts', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, ''], [200, OWNER]] });
    store.setDraft('decision:a', 'unsent');
    await store.recheck();
    await store.recheck();
    expect(store.getDraft('decision:a')).toBe('unsent');
  });

  it('a different user id clears all drafts before listeners hear about the new session', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, ''], [200, OTHER]] });
    store.setDraft('decision:a', 'unsent');
    store.setDraft('decision:b', 'also');
    await store.recheck();
    const seen: Array<unknown> = [];
    store.subscribe(() => seen.push(store.getDraft('decision:a')));
    await store.recheck();
    expect(store.getSnapshot().status).toBe('signedIn');
    expect(store.getDraft('decision:a')).toBeUndefined();
    expect(store.getDraft('decision:b')).toBeUndefined();
    expect(seen).toEqual([undefined]);
  });

  it('a different id on a check that changes nothing else (already signed in) still clears drafts', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [200, OTHER]] });
    store.setDraft('decision:a', 'unsent');
    await store.recheck();
    expect(store.getDraft('decision:a')).toBeUndefined();
  });

  it('is never in a snapshot, in localStorage or in sessionStorage', async () => {
    const ls = new Map<string, string>();
    const mk = () => ({ setItem: (k: string, v: string) => void ls.set(k, v), getItem: (k: string) => ls.get(k) ?? null, removeItem: (k: string) => void ls.delete(k), key: () => null, length: 0, clear: () => ls.clear() });
    vi.stubGlobal('localStorage', mk());
    vi.stubGlobal('sessionStorage', mk());
    try {
      const { store } = await started({ [ME]: [[200, OWNER]] });
      expect(JSON.stringify(store.getSnapshot())).not.toContain('00000000-0000');
      expect(Object.keys(store.getSnapshot()).sort()).toEqual(['generation', 'locked', 'signOutFailed', 'status']);
      expect([...ls.entries()]).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('revalidate on return (BACK-127 SEC-02 G6, owner decision E(a))', () => {
  function clocked(table: Record<string, Reply[]>) {
    const s = server(table);
    let t = 1_000_000;
    const store = new SessionStore(s.fetcher, () => t);
    return { store, advance: (ms: number) => { t += ms; }, ...s };
  }

  it('uses /api/auth/session-state, not /api/auth/me', async () => {
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
    await c.store.start();
    c.advance(REVALIDATE_MIN_MS);
    await c.store.revalidate();
    expect(c.calls).toEqual([ME, STATE]);
    expect(STATE_PATH).toContain('session-state');
  });

  it('at most one request per 60 s, on a fake clock (no real waiting)', async () => {
    expect(REVALIDATE_MIN_MS).toBe(60_000);
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
    await c.store.start();
    await c.store.revalidate(); // the start() check just answered: it counts toward the floor
    expect(c.calls).toEqual([ME]);
    c.advance(REVALIDATE_MIN_MS);
    await c.store.revalidate();
    await c.store.revalidate();
    c.advance(59_999);
    await c.store.revalidate();
    expect(c.calls.filter((x) => x === STATE)).toHaveLength(1);
    c.advance(1);
    await c.store.revalidate();
    expect(c.calls.filter((x) => x === STATE)).toHaveLength(2);
  });

  it('shares the one in-flight check with recheck and with itself', async () => {
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
    await c.store.start();
    c.advance(REVALIDATE_MIN_MS);
    await Promise.all([c.store.revalidate(), c.store.revalidate(), c.store.recheck()]);
    expect(c.calls).toHaveLength(2); // the start, then one shared check
  });

  it('a revalidate that finds the session gone locks it (ended), and an unreachable server locks it (unavailable)', async () => {
    const a = clocked({ [ME]: [[200, OWNER]], [STATE]: [[404, '']] });
    await a.store.start();
    a.advance(REVALIDATE_MIN_MS);
    await a.store.revalidate();
    expect(a.store.getSnapshot()).toMatchObject({ status: 'ended', locked: true });
    const b = clocked({ [ME]: [[200, OWNER]], [STATE]: ['network'] });
    await b.store.start();
    b.advance(REVALIDATE_MIN_MS);
    await b.store.revalidate();
    expect(b.store.getSnapshot()).toMatchObject({ status: 'unavailable', locked: true });
  });

  it('a revalidate naming a different user id clears the drafts', async () => {
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OTHER]] });
    await c.store.start();
    c.store.setDraft('decision:a', 'unsent');
    c.advance(REVALIDATE_MIN_MS);
    await c.store.revalidate();
    expect(c.store.getDraft('decision:a')).toBeUndefined();
  });

  it('starts no timer', async () => {
    vi.useFakeTimers();
    try {
      const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
      await c.store.start();
      c.advance(REVALIDATE_MIN_MS);
      await c.store.revalidate();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('listenForReturn: visible tab or online, once each, and removed on cleanup', () => {
    const handlers: Record<string, Array<() => void>> = {};
    const target = (name: string) => ({
      addEventListener: (ev: string, fn: () => void) => { (handlers[`${name}:${ev}`] ??= []).push(fn); },
      removeEventListener: (ev: string, fn: () => void) => { handlers[`${name}:${ev}`] = (handlers[`${name}:${ev}`] ?? []).filter((x) => x !== fn); },
    });
    const doc = { ...target('doc'), visibilityState: 'hidden' as 'hidden' | 'visible' };
    const win = target('win');
    const store = { revalidate: vi.fn(async () => undefined) };
    const off = listenForReturn(store, doc as never, win as never);
    handlers['doc:visibilitychange']![0]!();
    expect(store.revalidate).not.toHaveBeenCalled(); // hidden
    doc.visibilityState = 'visible';
    handlers['doc:visibilitychange']![0]!();
    handlers['win:online']![0]!();
    expect(store.revalidate).toHaveBeenCalledTimes(2);
    off();
    expect(handlers['doc:visibilitychange']).toHaveLength(0);
    expect(handlers['win:online']).toHaveLength(0);
  });
});

describe('fix round: sign-out failure survives later checks (I1)', () => {
  it('failed sign-out, then unavailable, then signedIn stays locked; a confirmed sign-out unlocks to signed out', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], 'network', [200, OWNER]], [OUT]: ['network', [204, '']] });
    await store.signOut();
    expect(store.getSnapshot()).toMatchObject({ signOutFailed: true, locked: true });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', signOutFailed: true, locked: true });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', signOutFailed: true, locked: true });
    await store.signOut();
    expect(store.getSnapshot()).toMatchObject({ status: 'signedOut', signOutFailed: false, locked: false });
  });

  it('a signed-out check does not clear it either: only a confirmed sign-out does', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [404, '']], [OUT]: ['network', [204, '']] });
    await store.signOut();
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'ended', signOutFailed: true, locked: true });
  });
});

describe('fix round: identity change while signed in (I2)', () => {
  it('clears the drafts, bumps the generation and notifies, with the drafts already gone', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [200, OTHER]] });
    store.setDraft('decision:a', 'unsent');
    const seen: Array<{ draft: unknown; generation: number }> = [];
    store.subscribe(() => seen.push({ draft: store.getDraft('decision:a'), generation: store.getSnapshot().generation }));
    await store.recheck();
    expect(seen).toEqual([{ draft: undefined, generation: 2 }]);
    expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', generation: 2, locked: false });
  });

  it('the same id again changes nothing (no new generation)', async () => {
    const { store } = await started({ [ME]: [[200, OWNER]] });
    const before = store.getSnapshot();
    await store.recheck();
    expect(store.getSnapshot()).toBe(before);
  });

  it('a signedIn answer without a string user id is an error and locks, never signed in', async () => {
    const { store } = await started({ [ME]: [[200, OWNER], [200, '{"user":{"role":"owner"}}']] });
    await store.recheck();
    expect(store.getSnapshot()).toMatchObject({ status: 'error', locked: true });
    const first = await started({ [ME]: [[200, '{"user":{"role":"owner"}}']] });
    expect(first.store.getSnapshot().status).toBe('error');
  });
});

describe('fix round: revalidate floor and rate limit (M1, M5, M6)', () => {
  function clocked(table: Record<string, Reply[]>) {
    const s = server(table);
    let t = 5_000;
    const store = new SessionStore(s.fetcher, () => t);
    return { store, advance: (ms: number) => { t += ms; }, ...s };
  }

  it('a 429 from session-state is no answer: the state stays and the floor is not reset', async () => {
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[429, ''], [200, OWNER]] });
    await c.store.start();
    const before = c.store.getSnapshot();
    c.advance(REVALIDATE_MIN_MS);
    await c.store.revalidate();
    expect(c.store.getSnapshot()).toBe(before);
    await c.store.revalidate(); // the floor was not reset: this one is sent
    expect(c.calls.filter((x) => x === STATE)).toHaveLength(2);
  });

  it('a manual recheck counts toward the floor', async () => {
    const c = clocked({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
    await c.store.start();
    c.advance(REVALIDATE_MIN_MS);
    await c.store.recheck();
    await c.store.revalidate();
    expect(c.calls).toEqual([ME, ME]);
  });

  it('does nothing when the owner was never signed in', async () => {
    const c = clocked({ [ME]: [[401, '']], [STATE]: [[200, OWNER]] });
    await c.store.start();
    c.advance(REVALIDATE_MIN_MS);
    await c.store.revalidate();
    expect(c.calls).toEqual([ME]);
  });

  it('the default clock is monotonic: wall-clock jumps do not move the floor', async () => {
    const s = server({ [ME]: [[200, OWNER]], [STATE]: [[200, OWNER]] });
    const perf = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const wall = vi.spyOn(Date, 'now');
    try {
      const store = new SessionStore(s.fetcher);
      await store.start();
      wall.mockReturnValue(9_999_999_999_999); // the system clock jumps forward
      await store.revalidate();
      expect(s.calls).toEqual([ME]);
      perf.mockReturnValue(1_000 + REVALIDATE_MIN_MS);
      await store.revalidate();
      expect(s.calls).toEqual([ME, STATE]);
    } finally {
      perf.mockRestore();
      wall.mockRestore();
    }
  });
});

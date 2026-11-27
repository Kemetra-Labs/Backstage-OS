// BACK-51 P2: the session in the app. The fetcher is injected: nothing here touches the network.
import { describe, expect, it, vi } from 'vitest';
import { checkSession, LAB_SIGN_IN_PATH, liveReadKey, SessionStore, type SessionSnapshot } from './session';

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
    for (const body of ['{}', '{"user":null}', '{"user":{"id":"x"}}', '{"user":{"role":"admin"}}', '[]', 'null', 'not json', ''])
      expect(await checkSession(undefined, server({ [ME]: [[200, body]] }).fetcher), body).toBe('error');
  });

  it('reads 401 and 404 as signed out, and a network or gateway failure as unavailable', async () => {
    expect(await checkSession(undefined, server({ [ME]: [[401, '']] }).fetcher)).toBe('signedOut');
    expect(await checkSession(undefined, server({ [ME]: [[404, '{"error":{}}']] }).fetcher)).toBe('signedOut');
    expect(await checkSession(undefined, server({ [ME]: ['network'] }).fetcher)).toBe('unavailable');
    expect(await checkSession(undefined, server({ [ME]: [[502, '']] }).fetcher)).toBe('unavailable');
  });

  it('reads any other failure as an error', async () => {
    for (const st of [400, 429, 500]) expect(await checkSession(undefined, server({ [ME]: [[st, '']] }).fetcher), String(st)).toBe('error');
  });

  it('is null when aborted', async () => {
    const c = new AbortController();
    c.abort();
    const f = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    expect(await checkSession(c.signal, f)).toBeNull();
  });

  it('links the lab sign-in through the same-origin proxy', () => {
    expect(LAB_SIGN_IN_PATH).toBe('/api/auth/lab');
  });
});

describe('SessionStore', () => {
  it('starts checking, then follows GET /api/auth/me', async () => {
    const s = server({ [ME]: [[200, OWNER]] });
    const store = new SessionStore(s.fetcher);
    expect(store.getSnapshot()).toEqual({ status: 'checking', generation: 0, signOutFailed: false });
    await store.start();
    expect(store.getSnapshot()).toEqual({ status: 'signedIn', generation: 1, signOutFailed: false });
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
      expect(store.getSnapshot()).toMatchObject({ status: 'signedIn', signOutFailed: true });
      expect(store.getDraft('decision:a')).toBe('unsent');
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

    it('are cleared by an explicit sign-out (a shared machine keeps nothing), but kept when sign-out fails', async () => {
      const { store } = await started({ [ME]: [[200, OWNER]], [OUT]: ['network', [204, '']] });
      store.setDraft('decision:a', 'unsent');
      await store.signOut();
      expect(store.getDraft('decision:a')).toBe('unsent');
      await store.signOut();
      expect(store.getDraft('decision:a')).toBeUndefined();
    });
  });
});

describe('liveReadKey (no panel keeps the owner data after the session is gone)', () => {
  const snap = (status: SessionSnapshot['status'], generation = 1): SessionSnapshot => ({ status, generation, signOutFailed: false });

  it('is the plain key in fixture mode (no session)', () => {
    expect(liveReadKey('portfolio', null)).toBe('portfolio');
  });

  it('changes when the session signs out or ends, so the held read is dropped and read again', () => {
    const inKey = liveReadKey('portfolio', snap('signedIn'));
    expect(liveReadKey('portfolio', snap('signedOut'))).not.toBe(inKey);
    expect(liveReadKey('portfolio', snap('ended'))).not.toBe(inKey);
    expect(liveReadKey('portfolio', snap('ended'))).toBe(liveReadKey('portfolio', snap('signedOut')));
  });

  it('changes with the generation, so a re-sign-in reads again', () => {
    expect(liveReadKey('portfolio', snap('signedIn', 1))).not.toBe(liveReadKey('portfolio', snap('signedIn', 2)));
  });

  it('keeps data through an unreachable blip: the server did not say the session is gone', () => {
    expect(liveReadKey('portfolio', snap('unavailable'))).toBe(liveReadKey('portfolio', snap('signedIn')));
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

// D3(a): the pure parts of the sign-in page (src/live/signInFlow.ts): which view, the once-guarded success handler, the bounded logout
// and the live-only path. No DOM: the component (signInPage.tsx) is a thin shell over these.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedLogout, clearDescopeStorage, DESCOPE_STORAGE_KEYS, descopeLocale, isSignInRoute, loadDescopeComponent, makeExchange, makeSignInEvents, pathWithLang, signInView, SIGN_IN_LOGOUT_MS, SIGN_IN_READY_MS } from './signInFlow';
import { SIGN_IN_PATH } from './session';
import { completeSignIn, type SignInOutcome } from './signIn';

const PROJECT = 'P' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3';
const JWT = 'header.payload.signature';

afterEach(() => vi.useRealTimers());

describe('signInView', () => {
  it('is the flow for a valid project id, carrying the id', () => {
    expect(signInView(PROJECT)).toEqual({ kind: 'flow', projectId: PROJECT });
  });

  it.each([[undefined], [''], ['  '], ['P123'], ['not-a-project-id'], [PROJECT + '!'], ['p' + PROJECT.slice(1)], [`${PROJECT}\n`]])('is unconfigured for %j', (id) => {
    expect(signInView(id)).toEqual({ kind: 'unconfigured' });
  });
});

describe('isSignInRoute', () => {
  it('is the sign-in page only in live mode, on exactly the sign-in path', () => {
    expect(SIGN_IN_PATH).toBe('/sign-in');
    expect(isSignInRoute('/sign-in', true)).toBe(true);
    expect(isSignInRoute('/sign-in/', true)).toBe(true);
  });

  it('is never the sign-in page in the fixture build', () => {
    expect(isSignInRoute('/sign-in', false)).toBe(false);
    expect(isSignInRoute('/sign-in/', false)).toBe(false);
  });

  it.each([['/'], [''], ['/sign-in-now'], ['/sign-in/x'], ['/x/sign-in'], ['/Sign-In'], ['//sign-in']])('does not match %j', (p) => {
    expect(isSignInRoute(p, true)).toBe(false);
  });
});

function harness(outcome: SignInOutcome | Error = 'signedIn') {
  const exchange = vi.fn(async (_jwt: string): Promise<SignInOutcome> => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const onOutcome = vi.fn((_o: SignInOutcome) => undefined);
  const goHome = vi.fn(() => undefined);
  const events = makeSignInEvents({ exchange, onOutcome, goHome });
  return { exchange, onOutcome, goHome, handle: events.onSuccess, fail: events.onError };
}
const event = (detail: unknown) => ({ detail });

describe('makeSignInEvents: success', () => {
  it('exchanges the JWT once, reports the outcome, and goes home only on signedIn', async () => {
    const h = harness('signedIn');
    await h.handle(event({ sessionJwt: JWT }));
    expect(h.exchange).toHaveBeenCalledTimes(1);
    expect(h.exchange).toHaveBeenCalledWith(JWT);
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('signedIn');
    expect(h.goHome).toHaveBeenCalledTimes(1);
  });

  it('exchanges once even when the success event fires twice, in a row or at the same time', async () => {
    const h = harness('signedIn');
    await Promise.all([h.handle(event({ sessionJwt: JWT })), h.handle(event({ sessionJwt: JWT }))]);
    await h.handle(event({ sessionJwt: 'other.jwt.value' }));
    expect(h.exchange).toHaveBeenCalledTimes(1);
    expect(h.exchange).toHaveBeenCalledWith(JWT);
    expect(h.goHome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
  });

  it.each<SignInOutcome>(['refused', 'unavailable'])('on %s reports it and never navigates', async (outcome) => {
    const h = harness(outcome);
    await h.handle(event({ sessionJwt: JWT }));
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith(outcome);
    expect(h.goHome).not.toHaveBeenCalled();
  });

  it('an exchange that throws is a refusal (unknown is never signed in), and still never navigates', async () => {
    const h = harness(new Error(`boom ${JWT}`));
    await h.handle(event({ sessionJwt: JWT }));
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('refused');
    expect(h.goHome).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [{}], [{ sessionJwt: 42 }], [{ sessionJwt: '' }], [{ sessionJwt: null }], ['text'], [{ refreshJwt: JWT }]])('a success with detail %j has no usable JWT: neutral refused, no exchange, never navigates', async (detail) => {
    const h = harness('signedIn');
    await h.handle(event(detail));
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('refused');
    expect(h.goHome).not.toHaveBeenCalled();
  });

  it('a success without a JWT consumes the latch (the page is terminal: refused with Start again), so a later success cannot flip it', async () => {
    const h = harness('signedIn');
    await h.handle({});
    await h.handle(event({ sessionJwt: JWT }));
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.goHome).not.toHaveBeenCalled();
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
  });
});

describe('makeSignInEvents: error', () => {
  it('an error event before any success is unavailable, with no exchange and no navigation', async () => {
    const h = harness('signedIn');
    await h.fail({ detail: { errorCode: 'X', errorDescription: 'secret cause' } });
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('unavailable');
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.goHome).not.toHaveBeenCalled();
  });

  it('an error after a successful exchange does not override signedIn', async () => {
    const h = harness('signedIn');
    await h.handle(event({ sessionJwt: JWT }));
    await h.fail({});
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('signedIn');
    expect(h.goHome).toHaveBeenCalledTimes(1);
  });

  it('an error while the exchange is running does not override its outcome', async () => {
    const h = harness('signedIn');
    const pending = h.handle(event({ sessionJwt: JWT }));
    await h.fail({});
    await pending;
    expect(h.onOutcome).toHaveBeenCalledTimes(1);
    expect(h.onOutcome).toHaveBeenCalledWith('signedIn');
  });

  it('a success after an error still exchanges exactly once', async () => {
    const h = harness('signedIn');
    await h.fail({});
    await Promise.all([h.handle(event({ sessionJwt: JWT })), h.handle(event({ sessionJwt: JWT }))]);
    expect(h.exchange).toHaveBeenCalledTimes(1);
    expect(h.goHome).toHaveBeenCalledTimes(1);
  });
});

describe('pathWithLang', () => {
  it('omits the param for English (the default) and adds lang=ar for Arabic', () => {
    expect(pathWithLang('/', 'en')).toBe('/');
    expect(pathWithLang('/', 'ar')).toBe('/?lang=ar');
    expect(pathWithLang('/sign-in', 'en')).toBe('/sign-in');
    expect(pathWithLang('/sign-in', 'ar')).toBe('/sign-in?lang=ar');
  });

  it('only the typed Lang is interpolated: anything else gives the plain fixed path (no open redirect)', () => {
    expect(pathWithLang('/', 'ar&next=//evil.example' as never)).toBe('/');
    expect(pathWithLang('/', '//evil.example' as never)).toBe('/');
    expect(pathWithLang('/', undefined as never)).toBe('/');
  });
});

describe('boundedLogout', () => {
  it('calls the SDK logout and settles with it when it is quick', async () => {
    const logout = vi.fn(async () => 'done');
    await expect(boundedLogout({ logout }).logout()).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('settles after the bound when the SDK logout never settles', async () => {
    vi.useFakeTimers();
    const sdk = { logout: vi.fn(() => new Promise<never>(() => undefined)) };
    let settled = false;
    void boundedLogout(sdk).logout().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(SIGN_IN_LOGOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('does not throw when logout rejects or throws, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    await expect(boundedLogout({ logout: async () => { throw new Error('x'); } }).logout()).resolves.toBeUndefined();
    await expect(boundedLogout({ logout: () => { throw new Error('y'); } }).logout()).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a short bound, well under a user losing patience', () => {
    expect(SIGN_IN_LOGOUT_MS).toBe(5000);
  });
});

/** A Map-backed Storage stand-in; `throwOnRemove` makes removeItem throw, as a blocked or broken storage can. */
function fakeStorage(initial: Record<string, string>, throwOnRemove = false) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    removeItem: (k: string) => {
      if (throwOnRemove) throw new Error('blocked');
      data.delete(k);
    },
  };
}
const DESCOPE_KEYS = ['DS', 'DSR', 'DSI', 'DSRCN', 'DTD', 'DKD', 'DSLI', 'DSLI_DISABLED', 'dls_last_user_login_id', 'dls_last_user_display_name', 'dls_last_auth', 'dls_last_submitted_login_id'];
const UNRELATED = { theme: 'dark', 'kawalys.draft': 'x', DSX: '1', ds: '1', xDS: '1', dls_ab_testing_id: 'a' };

describe('clearDescopeStorage', () => {
  it('names the persisted keys read from the vendored SDK (web-js-sdk DS, DSR, DSI, DSRCN, DTD, DKD, DSLI; web-component dls_*)', () => {
    expect([...DESCOPE_STORAGE_KEYS].sort()).toEqual([...DESCOPE_KEYS].sort());
  });

  it('removes the Descope keys from both storages and keeps every unrelated key', () => {
    const all = Object.fromEntries(DESCOPE_KEYS.map((k) => [k, 'secret']));
    const local = fakeStorage({ ...all, ...UNRELATED });
    const session = fakeStorage({ DS: 'jwt', DSR: 'jwt', ...UNRELATED });
    clearDescopeStorage([local, session]);
    expect([...local.data.keys()].sort()).toEqual(Object.keys(UNRELATED).sort());
    expect([...session.data.keys()].sort()).toEqual(Object.keys(UNRELATED).sort());
  });

  it('never throws: a storage whose removeItem throws, a missing storage and a hostile one are skipped, and the others are still cleared', () => {
    const broken = fakeStorage({ DS: 'jwt' }, true);
    const ok = fakeStorage({ DS: 'jwt', DSR: 'jwt', theme: 'dark' });
    const hostile = { removeItem: () => { throw new DOMException('denied', 'SecurityError'); } };
    expect(() => clearDescopeStorage([undefined, null, broken, hostile, ok])).not.toThrow();
    expect([...ok.data.keys()]).toEqual(['theme']);
  });

  it('keeps going past a throwing key (one failed removal does not stop the others)', () => {
    const data = new Map([['DS', 'a'], ['DSR', 'b']]);
    const first = { removeItem: (k: string) => { if (k === DESCOPE_STORAGE_KEYS[0]) throw new Error('x'); data.delete(k); } };
    clearDescopeStorage([first]);
    expect(data.has('DSR')).toBe(false);
  });
});

describe('makeExchange (exchange, bounded logout, then clear Descope storage)', () => {
  const ok = () => vi.fn(async (_p: string, _i?: RequestInit) => new Response('{}', { status: 200 }));
  const refused = () => vi.fn(async (_p: string, _i?: RequestInit) => new Response('{}', { status: 401 }));
  const complete = (f: ReturnType<typeof ok>) => (jwt: string, sdk: Parameters<typeof completeSignIn>[1]) => completeSignIn(jwt, sdk, f);

  it.each([['signedIn', ok], ['refused', refused]] as const)('clears after a logout that never settles, on %s (after the bound, not before)', async (outcome, mk) => {
    vi.useFakeTimers();
    const store = fakeStorage({ DS: 'jwt', DSR: 'jwt', theme: 'dark' });
    const sdk = { logout: vi.fn(() => new Promise<never>(() => undefined)) };
    const run = makeExchange({ getSdk: () => sdk, storages: [store], complete: complete(mk()) });
    let result: SignInOutcome | null = null;
    void run(JWT).then((o) => { result = o; });
    await vi.advanceTimersByTimeAsync(SIGN_IN_LOGOUT_MS - 1);
    expect(result).toBeNull();
    expect(store.data.has('DS')).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(outcome);
    expect([...store.data.keys()]).toEqual(['theme']);
    expect(sdk.logout).toHaveBeenCalledTimes(1);
  });

  it('clears after a quick logout and after an exchange that fails to reach the server', async () => {
    const store = fakeStorage({ DS: 'jwt', DSR: 'jwt', theme: 'dark' });
    const net = vi.fn(async (_p: string, _i?: RequestInit): Promise<Response> => { throw new TypeError('Failed to fetch'); });
    const sdk = { logout: vi.fn(async () => undefined) };
    const outcome = await makeExchange({ getSdk: () => sdk, storages: [store], complete: (j, s) => completeSignIn(j, s, net) })(JWT);
    expect(outcome).toBe('unavailable');
    expect([...store.data.keys()]).toEqual(['theme']);
  });

  it('a storage that throws on removal changes neither the outcome nor the other storage', async () => {
    const broken = fakeStorage({ DS: 'jwt' }, true);
    const store = fakeStorage({ DS: 'jwt' });
    const sdk = { logout: vi.fn(async () => undefined) };
    await expect(makeExchange({ getSdk: () => sdk, storages: [broken, store], complete: complete(ok()) })(JWT)).resolves.toBe('signedIn');
    expect(store.data.size).toBe(0);
  });
});

describe('descopeLocale', () => {
  it('maps the page language to the component locale attribute: "en" or "ar" only', () => {
    expect(descopeLocale('en')).toBe('en');
    expect(descopeLocale('ar')).toBe('ar');
  });

  it('never passes anything else, even from an untyped caller', () => {
    for (const bad of ['ar-EG', 'fr', '', undefined, null, 'AR', '<x>']) expect(descopeLocale(bad as never)).toBe('en');
  });
});

describe('loadDescopeComponent: no token persistence', () => {
  /** A stand-in for the component class: the static accessor of the vendored DescopeWc (sdkConfigOverrides). */
  function fakeClass() {
    let overrides: Record<string, unknown> = { baseHeaders: { 'x-descope-sdk-name': 'web-component' } };
    return {
      get sdkConfigOverrides() { return overrides; },
      set sdkConfigOverrides(v: Record<string, unknown>) { overrides = v; },
    };
  }

  it('sets persistTokens false (keeping the SDK headers) before the load resolves, i.e. before any element is created', async () => {
    const cls = fakeClass();
    const log: string[] = [];
    await loadDescopeComponent(async () => { log.push('imported'); return { default: cls }; }).then(() => log.push('resolved'));
    expect(cls.sdkConfigOverrides.persistTokens).toBe(false);
    expect(cls.sdkConfigOverrides.baseHeaders).toEqual({ 'x-descope-sdk-name': 'web-component' });
    expect(log).toEqual(['imported', 'resolved']);
  });

  it('does not resolve while the module is still loading (the page cannot create the element yet)', async () => {
    const cls = fakeClass();
    let release: (m: { default: typeof cls }) => void = () => undefined;
    let done = false;
    const p = loadDescopeComponent(() => new Promise((r) => { release = r as typeof release; })).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(cls.sdkConfigOverrides.persistTokens).toBeUndefined();
    release({ default: cls });
    await p;
    expect(cls.sdkConfigOverrides.persistTokens).toBe(false);
  });

  it.each([[{}], [{ default: null }], [{ default: {} }], [{ default: { sdkConfigOverrides: 'x' } }]])('fails closed (rejects) when the class cannot take the override: %j', async (mod) => {
    await expect(loadDescopeComponent(async () => mod as never)).rejects.toThrow();
  });

  it('fails closed when the override does not stick (a setter that ignores the value)', async () => {
    const cls = { get sdkConfigOverrides() { return { baseHeaders: {} }; }, set sdkConfigOverrides(_v: unknown) { /* ignored */ } };
    await expect(loadDescopeComponent(async () => ({ default: cls }))).rejects.toThrow();
  });

  it('a failed import rejects (the page shows the neutral unavailable message)', async () => {
    await expect(loadDescopeComponent(async () => { throw new Error('chunk'); })).rejects.toThrow();
  });
});

describe('readiness timeout', () => {
  function watched() {
    vi.useFakeTimers();
    const exchange = vi.fn(async (_jwt: string): Promise<SignInOutcome> => 'signedIn');
    const onOutcome = vi.fn((_o: SignInOutcome) => undefined);
    const goHome = vi.fn(() => undefined);
    const events = makeSignInEvents({ exchange, onOutcome, goHome });
    return { exchange, onOutcome, goHome, events, cancel: events.arm() };
  }

  it('is 15 seconds: three times the component own 5 s script-load wait', () => {
    expect(SIGN_IN_READY_MS).toBe(15000);
  });

  it('fires unavailable at 15 s and not at 14.999 s', () => {
    const w = watched();
    vi.advanceTimersByTime(SIGN_IN_READY_MS - 1);
    expect(w.onOutcome).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(w.onOutcome).toHaveBeenCalledTimes(1);
    expect(w.onOutcome).toHaveBeenCalledWith('unavailable');
    expect(w.goHome).not.toHaveBeenCalled();
  });

  it('a ready event cancels it', () => {
    const w = watched();
    vi.advanceTimersByTime(5000);
    w.events.onReady();
    vi.advanceTimersByTime(60000);
    expect(w.onOutcome).not.toHaveBeenCalled();
  });

  it('a success event cancels it, even one without a usable JWT (that is the refused outcome, once)', async () => {
    const w = watched();
    await w.events.onSuccess({ detail: { sessionJwt: JWT } });
    vi.advanceTimersByTime(60000);
    expect(w.onOutcome).toHaveBeenCalledTimes(1);
    expect(w.onOutcome).toHaveBeenCalledWith('signedIn');
    const x = watched();
    await x.events.onSuccess({});
    vi.advanceTimersByTime(60000);
    expect(x.onOutcome).toHaveBeenCalledTimes(1);
    expect(x.onOutcome).toHaveBeenCalledWith('refused');
  });

  it('an error event cancels it (one unavailable, not two)', async () => {
    const w = watched();
    await w.events.onError({});
    vi.advanceTimersByTime(60000);
    expect(w.onOutcome).toHaveBeenCalledTimes(1);
  });

  it('unmount (the returned cancel) cancels it', () => {
    const w = watched();
    w.cancel();
    vi.advanceTimersByTime(60000);
    expect(w.onOutcome).not.toHaveBeenCalled();
  });

  it('arming again (StrictMode re-run) restarts one timer, never two', () => {
    const w = watched();
    vi.advanceTimersByTime(10000);
    w.events.arm();
    vi.advanceTimersByTime(14999);
    expect(w.onOutcome).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(w.onOutcome).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(w.onOutcome).toHaveBeenCalledTimes(1);
  });

  it('never overrides an exchange in flight or done', async () => {
    vi.useFakeTimers();
    let finish: (o: SignInOutcome) => void = () => undefined;
    const exchange = vi.fn((_jwt: string) => new Promise<SignInOutcome>((r) => { finish = r; }));
    const onOutcome = vi.fn((_o: SignInOutcome) => undefined);
    const events = makeSignInEvents({ exchange, onOutcome, goHome: () => undefined });
    events.arm();
    const pending = events.onSuccess({ detail: { sessionJwt: JWT } });
    vi.advanceTimersByTime(SIGN_IN_READY_MS * 2);
    expect(onOutcome).not.toHaveBeenCalled();
    finish('signedIn');
    await pending;
    vi.advanceTimersByTime(SIGN_IN_READY_MS * 2);
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('signedIn');
  });
});

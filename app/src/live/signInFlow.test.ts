// D3(a): the pure parts of the sign-in page (src/live/signInFlow.ts): which view, the once-guarded success handler, the bounded logout
// and the live-only path. No DOM: the component (signInPage.tsx) is a thin shell over these.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedLogout, isSignInRoute, makeSuccessHandler, signInView, SIGN_IN_LOGOUT_MS } from './signInFlow';
import { SIGN_IN_PATH } from './session';
import type { SignInOutcome } from './signIn';

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
  return { exchange, onOutcome, goHome, handle: makeSuccessHandler({ exchange, onOutcome, goHome }) };
}
const event = (detail: unknown) => ({ detail });

describe('makeSuccessHandler', () => {
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

  it.each([[undefined], [null], [{}], [{ sessionJwt: 42 }], [{ sessionJwt: '' }], [{ sessionJwt: null }], ['text'], [{ refreshJwt: JWT }]])('ignores an event with detail %j, and does not use up the one exchange', async (detail) => {
    const h = harness('signedIn');
    await h.handle(event(detail));
    await h.handle({});
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.onOutcome).not.toHaveBeenCalled();
    await h.handle(event({ sessionJwt: JWT }));
    expect(h.exchange).toHaveBeenCalledTimes(1);
    expect(h.goHome).toHaveBeenCalledTimes(1);
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

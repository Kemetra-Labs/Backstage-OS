// D3(a): the sign-in logic (src/live/signIn.ts). The fetcher and the SDK are injected: nothing here touches the network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeSignIn, isProjectId } from './signIn';

const JWT = 'header.payload.signature';

const reply = (status: number, text = '{}') => vi.fn(async (_path: string, _init?: RequestInit) => new Response(status === 204 ? null : text, { status }));
const network = () => vi.fn(async (_path: string, _init?: RequestInit): Promise<Response> => { throw new TypeError('Failed to fetch'); });
const sdk = () => ({ logout: vi.fn(async () => undefined) });

afterEach(() => vi.unstubAllGlobals());

describe('completeSignIn', () => {
  it('returns signedIn on 200 and calls logout once', async () => {
    const s = sdk();
    const f = reply(200);
    expect(await completeSignIn(JWT, s, f)).toBe('signedIn');
    expect(f).toHaveBeenCalledOnce();
    expect(s.logout).toHaveBeenCalledOnce();
  });

  it.each([[401], [404], [429], [500], [400]])('returns refused on %i and still calls logout', async (status) => {
    const s = sdk();
    expect(await completeSignIn(JWT, s, reply(status))).toBe('refused');
    expect(s.logout).toHaveBeenCalledOnce();
  });

  it('returns unavailable on a network error and a gateway failure, and still calls logout', async () => {
    const a = sdk();
    expect(await completeSignIn(JWT, a, network())).toBe('unavailable');
    expect(a.logout).toHaveBeenCalledOnce();
    const b = sdk();
    expect(await completeSignIn(JWT, b, reply(502))).toBe('unavailable');
    expect(b.logout).toHaveBeenCalledOnce();
  });

  it('a 200 that is not JSON is refused, not signed in', async () => {
    const s = sdk();
    expect(await completeSignIn(JWT, s, reply(200, '<!doctype html>'))).toBe('refused');
    expect(s.logout).toHaveBeenCalledOnce();
  });

  it('ignores a logout that throws or rejects (outcome unchanged)', async () => {
    const throwing = { logout: vi.fn(() => { throw new Error('sdk down'); }) };
    expect(await completeSignIn(JWT, throwing, reply(200))).toBe('signedIn');
    expect(await completeSignIn(JWT, throwing, reply(401))).toBe('refused');
    const rejecting = { logout: vi.fn(async () => { throw new Error('sdk down'); }) };
    expect(await completeSignIn(JWT, rejecting, reply(200))).toBe('signedIn');
    expect(await completeSignIn(JWT, rejecting, network())).toBe('unavailable');
    expect(throwing.logout).toHaveBeenCalledTimes(2);
    expect(rejecting.logout).toHaveBeenCalledTimes(2);
  });

  it('sends the token once, as a Bearer header only', async () => {
    const f = reply(200);
    await completeSignIn(JWT, sdk(), f);
    const [path, init] = f.mock.calls[0]!;
    expect(path).toBe('/api/auth/session');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`);
    expect(init!.body).toBeUndefined();
  });

  it('writes nothing to localStorage or sessionStorage', async () => {
    const writes = vi.fn(() => { throw new Error('storage write'); });
    const stub = { setItem: writes, removeItem: vi.fn(), clear: vi.fn(), getItem: vi.fn(() => null), key: vi.fn(), length: 0 };
    vi.stubGlobal('localStorage', stub);
    vi.stubGlobal('sessionStorage', stub);
    for (const f of [reply(200), reply(401), reply(429), network()]) await completeSignIn(JWT, sdk(), f);
    expect(writes).not.toHaveBeenCalled();
  });

  it('never leaks the token in an outcome', async () => {
    for (const f of [reply(200), reply(401), network()]) expect(await completeSignIn(JWT, sdk(), f)).not.toContain(JWT);
  });
});

describe('isProjectId', () => {
  it('accepts a real-shaped id', () => {
    expect(isProjectId('P2abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(isProjectId('P2aB3cD4eF5gH6iJ7kL8mN9oP0q')).toBe(true);
  });

  it('rejects empty, undefined, spaces, too-short and other shapes', () => {
    const bad: unknown[] = ['', undefined, null, 42, {}, ' P2abcdefghijklmnopqrstuvwxyz', 'P2abcdefghijklmnopqrstuvwxyz ', 'P2abcdef ghijklmnopqrstuvwxyz', 'P2abc', 'P2abcdefghij', 'P2abcdefghijklmnopqrstuvwxyz\n', 'P2abcdefghijklmnopqrstuvwxy-z', 'x2abcdefghijklmnopqrstuvwxyz', 'P' + 'a'.repeat(64)];
    for (const v of bad) expect(isProjectId(v), String(v)).toBe(false);
  });
});

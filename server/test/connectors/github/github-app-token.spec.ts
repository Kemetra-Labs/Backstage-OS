// GitHub App installation-token provider (BACK-52 slice A). Fake fetch, throwaway key, injected clock.
import { jwtVerify, decodeProtectedHeader } from 'jose';
import { createAppTokenProvider } from '../../../src/connectors/github/github.app-token';
import { GitHubTokenError } from '../../../src/connectors/github/github.transport';
import { fakeFetch, json, type RecordedCall } from './fake-fetch';
import { makeTestKey, type TestKey } from './test-key';

const APP_ID = 123456;
const INSTALLATION_ID = 987654;
const REPOSITORY_ID = 4242;
const MINT_URL = `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`;
const T0 = new Date('2026-11-28T12:00:00Z');
const FAKE_TOKEN = 'ghs_TESTTOKEN123';

let key: TestKey;
beforeAll(async () => {
  key = await makeTestKey();
});

function setup(handler: (c: RecordedCall, n: number) => Response | Promise<Response>) {
  let clock = T0.getTime();
  let n = 0;
  const f = fakeFetch((c) => handler(c, ++n));
  const provider = createAppTokenProvider({
    fetch: f.fetch,
    appId: APP_ID,
    installationId: INSTALLATION_ID,
    privateKeyPem: key.pem,
    repositoryId: REPOSITORY_ID,
    now: () => new Date(clock),
  });
  return { ...f, provider, advance: (ms: number) => (clock += ms) };
}

const minted = (token: string, expiresAt: Date) => json(201, { token, expires_at: expiresAt.toISOString(), permissions: {}, repository_selection: 'selected' });
const inOneHour = () => new Date(T0.getTime() + 60 * 60 * 1000);

describe('createAppTokenProvider', () => {
  it('mints with a POST to the installation endpoint with exactly the down-scoped body', async () => {
    const t = setup(() => minted(FAKE_TOKEN, inOneHour()));
    expect(await t.provider.current()).toBe(FAKE_TOKEN);
    expect(t.calls).toHaveLength(1);
    const { url, init } = t.calls[0]!;
    expect(url).toBe(MINT_URL);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBe('{"repository_ids":[4242],"permissions":{"metadata":"read","pull_requests":"read","issues":"read"}}');
    const headers = init.headers as Record<string, string>;
    expect(headers['Accept']).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(headers['User-Agent']).toBe('kawalys-pilot');
    expect(headers['Authorization']).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('signs an RS256 App JWT: iss = app id, iat 60 s back, exp 9 minutes ahead (verified with the public key)', async () => {
    const t = setup(() => minted(FAKE_TOKEN, inOneHour()));
    await t.provider.current();
    const jwt = (t.calls[0]!.init.headers as Record<string, string>)['Authorization']!.slice('Bearer '.length);
    expect(decodeProtectedHeader(jwt).alg).toBe('RS256');
    const { payload } = await jwtVerify(jwt, key.publicKey, { algorithms: ['RS256'], currentDate: T0 });
    const nowSec = Math.floor(T0.getTime() / 1000);
    expect(payload.iss).toBe(String(APP_ID));
    expect(payload.iat).toBe(nowSec - 60);
    expect(payload.exp).toBe(nowSec + 9 * 60);
  });

  it('accepts a PKCS#1 key as GitHub issues it', async () => {
    const f = fakeFetch(() => minted(FAKE_TOKEN, inOneHour()));
    const p = createAppTokenProvider({ fetch: f.fetch, appId: APP_ID, installationId: INSTALLATION_ID, privateKeyPem: key.pkcs1, repositoryId: REPOSITORY_ID, now: () => T0 });
    expect(await p.current()).toBe(FAKE_TOKEN);
  });

  it('caches the token until 5 minutes before expires_at, then mints again', async () => {
    let n = 0;
    const t = setup(() => minted(`tok-${++n}`, new Date(T0.getTime() + 60 * 60 * 1000)));
    expect(await t.provider.current()).toBe('tok-1');
    t.advance(54 * 60 * 1000 + 59_000); // 5 min and 1 s before expiry: still cached
    expect(await t.provider.current()).toBe('tok-1');
    expect(t.calls).toHaveLength(1);
    t.advance(1_000); // exactly 5 min before expiry: renew
    expect(await t.provider.current()).toBe('tok-2');
    expect(t.calls).toHaveLength(2);
  });

  it('shares one mint between concurrent callers', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup(async () => {
      await gate;
      return minted(FAKE_TOKEN, inOneHour());
    });
    const all = Promise.all([t.provider.current(), t.provider.current(), t.provider.current()]);
    release();
    expect(await all).toEqual([FAKE_TOKEN, FAKE_TOKEN, FAKE_TOKEN]);
    expect(t.calls).toHaveLength(1);
  });

  it('does not cache a failure: the next call mints again', async () => {
    const t = setup((_c, n) => (n === 1 ? json(503, {}) : minted(FAKE_TOKEN, inOneHour())));
    await expect(t.provider.current()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(await t.provider.current()).toBe(FAKE_TOKEN);
    expect(t.calls).toHaveLength(2);
  });

  it.each([401, 403, 404, 422])('maps a mint answer of %s to denied', async (status) => {
    const t = setup(() => json(status, { message: 'Bad credentials' }));
    await expect(t.provider.current()).rejects.toMatchObject({ name: 'GitHubTokenError', kind: 'denied' });
  });

  it.each([[{ 'x-ratelimit-remaining': '0' }], [{ 'retry-after': '60' }]])('maps a rate-limited 403 (%j) to unavailable, not denied', async (headers) => {
    const t = setup(() => json(403, { message: 'rate limit' }, headers));
    await expect(t.provider.current()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it.each([429, 500, 502, 503])('maps a mint answer of %s to unavailable', async (status) => {
    const t = setup(() => json(status, {}));
    await expect(t.provider.current()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps a redirect, a network error, a timeout and malformed answers to unavailable', async () => {
    const cases: Array<() => Response> = [
      () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
      () => {
        throw new TypeError('fetch failed');
      },
      () => {
        throw new DOMException('x', 'TimeoutError');
      },
      () => new Response('<html>', { status: 201, headers: { 'content-type': 'text/html' } }),
      () => json(201, {}),
      () => json(201, { token: '', expires_at: inOneHour().toISOString() }),
      () => json(201, { token: FAKE_TOKEN, expires_at: 'not a date' }),
      () => json(201, { token: FAKE_TOKEN, expires_at: new Date(T0.getTime() - 1000).toISOString() }),
      () => json(200, { token: FAKE_TOKEN, expires_at: inOneHour().toISOString() }),
    ];
    for (const make of cases) {
      const t = setup(() => make());
      await expect(t.provider.current()).rejects.toMatchObject({ name: 'GitHubTokenError', kind: 'unavailable' });
    }
  });

  it('never puts the key, the JWT or the token in an error message', async () => {
    const t = setup(() => json(401, { message: `Bad credentials ${FAKE_TOKEN}` }));
    const err = (await t.provider.current().catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(GitHubTokenError);
    const jwt = (t.calls[0]!.init.headers as Record<string, string>)['Authorization']!.slice('Bearer '.length);
    const body = key.pem.split('\n').filter((l) => l && !l.startsWith('-----'))[0]!;
    for (const secret of [FAKE_TOKEN, jwt, body, 'BEGIN']) {
      expect(err.message).not.toContain(secret);
      expect(String(err.stack)).not.toContain(secret);
      expect(JSON.stringify(err)).not.toContain(secret);
    }
    const t2 = setup(() => {
      throw new TypeError(`boom ${FAKE_TOKEN}`);
    });
    const err2 = (await t2.provider.current().catch((e: unknown) => e)) as Error;
    expect(err2.message).not.toContain(FAKE_TOKEN);
    expect((err2 as { cause?: unknown }).cause).toBeUndefined();
  });

  it('refuses a key it cannot read, with a fixed message', () => {
    const f = fakeFetch(() => json(201, {}));
    expect(() =>
      createAppTokenProvider({ fetch: f.fetch, appId: APP_ID, installationId: INSTALLATION_ID, privateKeyPem: 'not a key SECRETBYTES', repositoryId: REPOSITORY_ID, now: () => T0 }),
    ).toThrow(/private key/);
  });
});

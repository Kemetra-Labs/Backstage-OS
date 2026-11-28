// Real read-only GitHub transport (BACK-52 slice A). A fake fetch only: no network, no real token.
import { GitHubTransportFailure, GitHubTokenError } from '../../../src/connectors/github/github.transport';
import { createFetchTransport } from '../../../src/connectors/github/github.fetch-transport';
import { fakeFetch, json } from './fake-fetch';

const REPO = 'kemetra-labs/backstage-os';
const TOKEN = 'ghs_TESTTOKEN123';
const tokens = { current: async () => TOKEN };

const make = (handler: Parameters<typeof fakeFetch>[0]) => {
  const f = fakeFetch(handler);
  return { ...f, transport: createFetchTransport({ fetch: f.fetch, tokens, repo: REPO }) };
};

describe('createFetchTransport', () => {
  it('sends one GET to the fixed base with the pinned headers, manual redirects and a timeout signal', async () => {
    const t = make(() => json(200, { id: 1 }, { 'X-RateLimit-Remaining': '99' }));
    const res = await t.transport.get(`/repos/${REPO}`);
    expect(t.calls).toHaveLength(1);
    const { url, init } = t.calls[0]!;
    expect(url).toBe(`https://api.github.com/repos/${REPO}`);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kawalys-pilot',
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
    expect(res.headers['x-ratelimit-remaining']).toBe('99');
  });

  it('allows exactly the repository root and the pulls and issues list paths (with their query)', async () => {
    const t = make(() => json(200, []));
    await t.transport.get(`/repos/${REPO}/pulls?state=open&per_page=20`);
    await t.transport.get(`/repos/${REPO}/issues?state=open&per_page=20`);
    expect(t.calls[0]!.url).toBe(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=20`);
    expect(t.calls[1]!.url).toBe(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=20`);
  });

  it.each([
    ['another repository', '/repos/other/repo'],
    ['a prefix of the repository name', `/repos/${REPO}-fork`],
    ['the repository with a query on the root path', `/repos/${REPO}?x=1`],
    ['the API root', '/'],
    ['a user endpoint', '/user'],
    ['another subpath of the repository', `/repos/${REPO}/contents/secrets.txt`],
    ['a single pull request', `/repos/${REPO}/pulls/12`],
    ['issue comments', `/repos/${REPO}/issues/1/comments`],
    ['a pulls path with a trailing segment', `/repos/${REPO}/pulls/`],
    ['an app endpoint', '/app/installations/1/access_tokens'],
    ['an absolute URL', 'https://evil.example/repos/' + REPO],
    ['a protocol-relative URL', '//evil.example/repos/' + REPO],
    ['a dot-dot escape', `/repos/${REPO}/../../other/repo`],
    ['an encoded dot-dot escape', `/repos/${REPO}/%2e%2e/%2E%2e/other/repo`],
    ['an encoded slash', `/repos/${REPO}/a%2f..%2f..%2fx`],
    ['a backslash', `/repos/${REPO}/a\\b`],
    ['no leading slash', `repos/${REPO}`],
    ['empty', ''],
  ])('throws a programming error before any fetch for %s', async (_label, path) => {
    const t = make(() => json(200, {}));
    await expect(t.transport.get(path)).rejects.toThrow(/path not allowed/);
    expect(t.calls).toHaveLength(0);
  });

  it('refuses to be built for a repository that is not an approved lower-case owner/repo', () => {
    for (const repo of ['Kemetra-Labs/Backstage-OS', 'nope', '../x/y', '']) {
      expect(() => createFetchTransport({ fetch: fakeFetch(() => json(200, {})).fetch, tokens, repo })).toThrow();
    }
  });

  it('returns a 3xx as an answer (never followed) so the observer reports unexpected_status', async () => {
    const t = make(() => new Response(null, { status: 301, headers: { location: 'https://api.github.com/repositories/9' } }));
    const res = await t.transport.get(`/repos/${REPO}`);
    expect(res.status).toBe(301);
    expect(res.body).toBeUndefined();
    expect(t.calls).toHaveLength(1);
  });

  it('leaves the body undefined when it is not JSON or not parseable', async () => {
    const html = make(() => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect((await html.transport.get(`/repos/${REPO}`)).body).toBeUndefined();
    const broken = make(() => new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect((await broken.transport.get(`/repos/${REPO}`)).body).toBeUndefined();
  });

  it('maps an abort or timeout to GitHubTransportFailure(timeout)', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const t = make(() => {
        throw new DOMException('x', name);
      });
      await expect(t.transport.get(`/repos/${REPO}`)).rejects.toMatchObject({ name: 'GitHubTransportFailure', kind: 'timeout' });
    }
  });

  it('maps any other fetch error to GitHubTransportFailure(network) without carrying the original message', async () => {
    const t = make(() => {
      throw new TypeError(`connect ECONNREFUSED carrying ${TOKEN}`);
    });
    const err = await t.transport.get(`/repos/${REPO}`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubTransportFailure);
    expect((err as GitHubTransportFailure).kind).toBe('network');
    expect(String((err as Error).message)).not.toContain(TOKEN);
    expect(JSON.stringify(err)).not.toContain(TOKEN);
    expect((err as { cause?: unknown }).cause).toBeUndefined();
  });

  it('maps a failure while reading the body to a transport failure too', async () => {
    const t = make(() => {
      const body = new ReadableStream({
        start(c) {
          c.error(new DOMException('x', 'TimeoutError'));
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await expect(t.transport.get(`/repos/${REPO}`)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('does not decode the body of a non-2xx answer: an interrupted body on a 401 still reads as 401', async () => {
    const t = make(() => {
      const body = new ReadableStream({
        start(c) {
          c.error(new TypeError('stream broke'));
        },
      });
      return new Response(body, { status: 401, headers: { 'content-type': 'application/json', 'retry-after': '5' } });
    });
    const res = await t.transport.get(`/repos/${REPO}`);
    expect(res.status).toBe(401);
    expect(res.body).toBeUndefined();
    expect(res.headers['retry-after']).toBe('5');
  });

  it('awaits beforeSend after the token resolves and before fetch; a throw from it sends nothing and propagates unchanged', async () => {
    const order: string[] = [];
    const f = fakeFetch(() => (order.push('fetch'), json(200, {})));
    const ok = createFetchTransport({
      fetch: f.fetch,
      tokens: { current: async () => (order.push('token'), TOKEN) },
      repo: REPO,
      beforeSend: async () => void order.push('before'),
    });
    await ok.get(`/repos/${REPO}`);
    expect(order).toEqual(['token', 'before', 'fetch']);
    const boom = new Error('stop');
    const g = fakeFetch(() => json(200, {}));
    const blocked = createFetchTransport({ fetch: g.fetch, tokens, repo: REPO, beforeSend: async () => Promise.reject(boom) });
    await expect(blocked.get(`/repos/${REPO}`)).rejects.toBe(boom);
    expect(g.calls).toHaveLength(0);
  });

  it('lets a token error through unchanged and makes no request', async () => {
    const f = fakeFetch(() => json(200, {}));
    const transport = createFetchTransport({
      fetch: f.fetch,
      tokens: {
        current: async () => {
          throw new GitHubTokenError('denied');
        },
      },
      repo: REPO,
    });
    await expect(transport.get(`/repos/${REPO}`)).rejects.toBeInstanceOf(GitHubTokenError);
    expect(f.calls).toHaveLength(0);
  });
});

// GitHub observation mapper (BACK-52 mock slice): canned responses only, no network.
import { randomUUID } from 'node:crypto';
import { clip, observeRepository, REPO_REF } from '../../../src/connectors/github/github.observer';
import { GitHubTransportFailure, type GitHubResponse } from '../../../src/connectors/github/github.transport';
import type { ObservationInput } from '../../../src/evidence/evidence.repository';
import { happyScript, OWNER_REPO, ok, repoBody, ScriptedTransport, type Script } from './github.fixture';

const sourceId = randomUUID();
const now = new Date('2026-11-25T12:00:00Z');
const source = { sourceId, externalRef: OWNER_REPO };

const run = (script: Script, externalRef = OWNER_REPO) => {
  const transport = new ScriptedTransport(script);
  return { transport, result: observeRepository(transport, { sourceId, externalRef }, now) };
};

const statuses = (items: readonly ObservationInput[]) => items.filter((i) => i.payload['kind'] === 'source_status');
const status = (code: number, headers: Record<string, string> = {}): GitHubResponse => ({ status: code, body: { message: 'Bad credentials https://x' }, headers });

describe('a reachable repository', () => {
  it('returns one repository, one pull request and one issue as ok Observations dated at the read', async () => {
    const items = await run(happyScript()).result;
    expect(items.map((i) => i.payload['kind'])).toEqual(['repository', 'list_page', 'pull_request', 'list_page', 'issue']);
    expect(items.every((i) => i.type === 'Observation' && i.state === 'ok' && i.sourceId === sourceId)).toBe(true);
    expect(items.every((i) => i.observedAt.getTime() === now.getTime())).toBe(true);
    expect(items.map((i) => i.sourceRef)).toEqual([
      `github:${OWNER_REPO}`,
      `github:${OWNER_REPO}#pulls`,
      `github:${OWNER_REPO}#pull/12`,
      `github:${OWNER_REPO}#issues`,
      `github:${OWNER_REPO}#issue/7`,
    ]);
    expect(items[2]!.payload).toEqual({
      kind: 'pull_request',
      number: 12,
      title: 'Add the portfolio route',
      state: 'open',
      draft: false,
      updatedAt: '2026-11-24T08:00:00.000Z',
      url: 'https://github.com/Kemetra-Labs/Backstage-OS/pull/12',
    });
  });

  it('records each page against the page size, counting the raw page (pull requests in /issues included)', async () => {
    const pages = (await run(happyScript()).result).filter((i) => i.payload['kind'] === 'list_page').map((i) => i.payload);
    expect(pages).toEqual([
      { kind: 'list_page', endpoint: 'pull_requests', returned: 1, pageSize: 20 },
      { kind: 'list_page', endpoint: 'issues', returned: 2, pageSize: 20 },
    ]);
  });

  it('skips pull requests that the issues endpoint also returns', async () => {
    const items = await run(happyScript()).result;
    expect(items.filter((i) => i.payload['kind'] === 'issue').map((i) => i.payload['number'])).toEqual([7]);
  });

  it('only ever reads, with a bounded page of open items', async () => {
    const { transport, result } = run(happyScript());
    await result;
    expect(transport.calls).toEqual([
      `/repos/${OWNER_REPO}`,
      `/repos/${OWNER_REPO}/pulls?state=open&sort=updated&direction=desc&per_page=20`,
      `/repos/${OWNER_REPO}/issues?state=open&sort=updated&direction=desc&per_page=20`,
    ]);
  });

  it('stores no personal or free-text fields (X04): no body, login, email, avatar or description', async () => {
    const text = JSON.stringify((await run(happyScript()).result).map((i) => i.payload));
    for (const banned of ['body', 'octo-person', 'person@example.com', 'avatar', 'login', 'email', 'Private description', 'assignee', 'user']) {
      expect(text).not.toContain(banned);
    }
  });

  it('caps a long title and drops a URL that does not belong to this repository', async () => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/pulls`] = ok([
      { number: 1, title: 'x'.repeat(5000), state: 'open', draft: true, updated_at: '2026-11-24T08:00:00Z', html_url: 'https://evil.example/pull/1' },
    ]);
    const pr = (await run(script).result).find((i) => i.payload['kind'] === 'pull_request')!;
    expect((pr.payload['title'] as string).length).toBe(300);
    expect(pr.payload['url']).toBeNull();
  });

  it.each([
    `https://evil.example/${OWNER_REPO}/pull/1`,
    `http://github.com/${OWNER_REPO}/pull/1`,
    `https://github.com.evil.example/${OWNER_REPO}/pull/1`,
    `https://github.com/kemetra-labs/other-repo/pull/1`,
    'javascript:alert(1)',
    `https://user:pw@github.com/${OWNER_REPO}/pull/1`,
    `https://user@github.com/${OWNER_REPO}/pull/1`,
    `https://github.com:8443/${OWNER_REPO}/pull/1`,
    `https://github.com/${OWNER_REPO}/${'a'.repeat(400)}`,
  ])('keeps no URL outside https://github.com/<this repo>/: %s', async (html_url) => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/pulls`] = ok([{ number: 1, title: 't', state: 'open', updated_at: '2026-11-24T08:00:00Z', html_url }]);
    const pr = (await run(script).result).find((i) => i.payload['kind'] === 'pull_request')!;
    expect(pr.payload['url']).toBeNull();
  });

  it('stores a URL rebuilt from its path: no query or fragment survives', async () => {
    const script = happyScript();
    const html_url = `https://github.com/${OWNER_REPO}/pull/1?email=a@b.c#frag`;
    script[`/repos/${OWNER_REPO}/pulls`] = ok([{ number: 1, title: 't', state: 'open', updated_at: '2026-11-24T08:00:00Z', html_url }]);
    const pr = (await run(script).result).find((i) => i.payload['kind'] === 'pull_request')!;
    expect(pr.payload['url']).toBe(`https://github.com/${OWNER_REPO}/pull/1`);
  });
});

describe('text stays storable in PostgreSQL jsonb', () => {
  it('never splits an emoji at the cut, so no unpaired surrogate is stored', () => {
    const cut = clip(`${'x'.repeat(299)}\u{1F600}tail`);
    expect(Array.from(cut)).toHaveLength(300);
    expect(cut.endsWith('\u{1F600}')).toBe(true);
    expect(JSON.stringify(clip(`${'x'.repeat(299)}\u{1F600}`, 299))).not.toMatch(/\\ud83d/i);
  });

  it('removes NUL and replaces an unpaired surrogate already in the input', () => {
    expect(clip(`a${String.fromCharCode(0)}b\ud83dc`)).toBe('ab�c');
  });

  it('applies to item titles and the repository name', async () => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/pulls`] = ok([
      { number: 1, title: `${'x'.repeat(299)}\u{1F600}${String.fromCharCode(0)}`, state: 'open', updated_at: '2026-11-24T08:00:00Z' },
    ]);
    const text = JSON.stringify((await run(script).result).map((i) => i.payload));
    expect(text).not.toMatch(/\\u0000|\\ud83d"/i);
  });
});

describe('failures are recorded, never reported as ok', () => {
  const failRepo = async (answer: GitHubResponse | Error) => {
    const { transport, result } = run({ [`/repos/${OWNER_REPO}`]: answer });
    const items = await result;
    return { transport, items };
  };

  it.each([
    [401, 'denied', 'denied'],
    [403, 'denied', 'denied'],
    [404, 'denied', 'not_visible'],
    [429, 'unknown', 'rate_limited'],
    [500, 'unknown', 'unavailable'],
    [503, 'unknown', 'unavailable'],
    [418, 'error', 'unexpected_status'],
  ])('HTTP %i on the repository becomes one %s record (%s) and stops further reads', async (code, state, reason) => {
    const { transport, items } = await failRepo(status(code));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'Observation', state, sourceRef: `github:${OWNER_REPO}` });
    expect(items[0]!.payload).toEqual({ kind: 'source_status', endpoint: 'repository', reason });
    expect(transport.calls).toHaveLength(1);
  });

  it.each([
    ['an exhausted primary limit', { 'x-ratelimit-remaining': '0' }],
    ['a secondary limit with retry-after', { 'x-ratelimit-remaining': '4999', 'retry-after': '60' }],
  ])('treats a 403 with %s as rate limited, not denied', async (_label, headers) => {
    const { items } = await failRepo(status(403, headers));
    expect(items[0]).toMatchObject({ state: 'unknown', payload: { reason: 'rate_limited' } });
  });

  it('refuses a repository answer for another repository (rename or redirect): error, no items', async () => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}`] = ok({ ...repoBody, full_name: 'Kemetra-Labs/Something-Else' });
    const { transport, result } = run(script);
    const items = await result;
    expect(items).toEqual([expect.objectContaining({ state: 'error', payload: { kind: 'source_status', endpoint: 'repository', reason: 'ref_mismatch' } })]);
    expect(transport.calls).toHaveLength(1);
  });

  it.each([
    [new GitHubTransportFailure('network'), 'unknown', 'network'],
    [new GitHubTransportFailure('timeout'), 'unknown', 'timeout'],
    [new Error('socket hang up with token ghp_secret'), 'error', 'transport_error'],
  ])('a thrown %s becomes %s (%s) without copying its message', async (err, state, reason) => {
    const { items } = await failRepo(err);
    expect(items[0]).toMatchObject({ state, payload: { kind: 'source_status', endpoint: 'repository', reason } });
    expect(JSON.stringify(items)).not.toContain('ghp_secret');
  });

  it.each([
    ['a non-object repository body', undefined],
    ['a string repository body', '<html>'],
    ['an array repository body', []],
  ])('%s is malformed, state error', async (_label, body) => {
    const { items } = await failRepo(ok(body));
    expect(items[0]).toMatchObject({ state: 'error', payload: { reason: 'malformed' } });
  });

  it.each([
    ['a non-array list', { items: [] }],
    ['an invalid updated_at', [{ number: 1, title: 't', state: 'open', updated_at: 'yesterday' }]],
    ['a non-integer number', [{ number: 1.5, title: 't', state: 'open', updated_at: '2026-11-24T08:00:00Z' }]],
    ['a missing title', [{ number: 1, state: 'open', updated_at: '2026-11-24T08:00:00Z' }]],
    ['an unknown state', [{ number: 1, title: 't', state: 'merged-ish', updated_at: '2026-11-24T08:00:00Z' }]],
  ])('%s on pulls is malformed: the endpoint gets one error record, the others still report', async (_label, body) => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/pulls`] = ok(body);
    const items = await run(script).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state: 'error', sourceRef: `github:${OWNER_REPO}#pulls`, payload: { kind: 'source_status', endpoint: 'pull_requests', reason: 'malformed' } }),
    ]);
    expect(items.some((i) => i.payload['kind'] === 'pull_request')).toBe(false);
    expect(items.filter((i) => i.state === 'ok').map((i) => i.payload['kind'])).toEqual(['repository', 'list_page', 'issue']);
  });

  it('refuses a page longer than requested instead of storing or truncating it', async () => {
    const script = happyScript();
    const item = (n: number) => ({ number: n, title: 't', state: 'open', updated_at: '2026-11-24T08:00:00Z' });
    script[`/repos/${OWNER_REPO}/pulls`] = ok(Array.from({ length: 21 }, (_, i) => item(i + 1)));
    const items = await run(script).result;
    expect(items.some((i) => i.payload['kind'] === 'pull_request')).toBe(false);
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', payload: { kind: 'source_status', endpoint: 'pull_requests', reason: 'malformed' } })]);
  });

  it('a failing issues endpoint is isolated from the pull requests', async () => {
    const script = happyScript();
    script[`/repos/${OWNER_REPO}/issues`] = new GitHubTransportFailure('timeout');
    const items = await run(script).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state: 'unknown', sourceRef: `github:${OWNER_REPO}#issues`, payload: { kind: 'source_status', endpoint: 'issues', reason: 'timeout' } }),
    ]);
  });

  it('never yields ok on any failure path (exhaustive over the cases above)', async () => {
    const answers: (GitHubResponse | Error)[] = [
      ...[301, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].map((c) => status(c)),
      ok(null),
      ok('x'),
      new GitHubTransportFailure('network'),
      new Error('boom'),
    ];
    for (const answer of answers) {
      const { items } = await failRepo(answer);
      expect(items.every((i) => i.state !== 'ok')).toBe(true);
    }
  });
});

describe('the repository reference is validated before any request', () => {
  it.each([
    'Kemetra-Labs/Backstage-OS', // not lower-cased as stored
    'kemetra-labs',
    'kemetra-labs/backstage-os/extra',
    '../backstage-os',
    'kemetra-labs/..',
    'kemetra-labs/.',
    'kemetra-labs/backstage-os?x=1',
    'kemetra-labs/backstage%2fos',
    'kemetra-labs/back stage',
    '-bad/repo',
    '',
  ])('refuses %j: no request, one error record', async (ref) => {
    expect(REPO_REF.test(ref)).toBe(false);
    const { transport, result } = run(happyScript(), ref);
    const items = await result;
    expect(transport.calls).toEqual([]);
    expect(items).toEqual([
      expect.objectContaining({ state: 'error', sourceRef: 'github:invalid-ref', payload: { kind: 'source_status', endpoint: 'repository', reason: 'invalid_ref' } }),
    ]);
  });

  it('accepts dotted and underscored repository names', () => {
    expect(REPO_REF.test('kemetra-labs/retail-tower_erp.v2')).toBe(true);
    expect(source.externalRef).toBe(OWNER_REPO);
  });
});

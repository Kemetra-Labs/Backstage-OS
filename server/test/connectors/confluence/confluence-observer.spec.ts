// Confluence observation mapper (BACK-53 mock slice): canned answers only, no network.
import { randomUUID } from 'node:crypto';
import { observeConfluenceSpaces, pagesPath, spacePath } from '../../../src/connectors/confluence/confluence.observer';
import { ConfluenceTransportFailure, type ConfluenceResponse } from '../../../src/connectors/confluence/confluence.transport';
import type { ObservationInput } from '../../../src/evidence/evidence.repository';
import { ENG_ID, happyScript, NOW, ok, OPS_ID, page, ScriptedTransport, SITE, space, type Script } from './confluence.fixture';

const sourceId = randomUUID();

const run = (script: Script, over: { site?: string; spaceKeys?: readonly string[]; ttlMs?: number } = {}) => {
  const transport = new ScriptedTransport(script);
  const source = { sourceId, site: over.site ?? SITE, spaceKeys: over.spaceKeys ?? ['ENG', 'OPS'] };
  const opts = over.ttlMs === undefined ? {} : { ttlMs: over.ttlMs };
  return { transport, result: observeConfluenceSpaces(transport, source, NOW, opts) };
};

const statuses = (items: readonly ObservationInput[]) => items.filter((i) => i.payload['kind'] === 'source_status');
const pages = (items: readonly ObservationInput[]) => items.filter((i) => i.payload['kind'] === 'confluence_page');
const status = (code: number): ConfluenceResponse => ({ status: code, body: { message: 'Unauthorized https://x' }, headers: {} });
const withEngPages = (body: unknown, headers: Record<string, string> = {}): Script => ({ ...happyScript(), [pagesPath(ENG_ID)]: ok(body, headers) });
const engPage = (over: Record<string, unknown> = {}) => page('1001', ENG_ID, over);

describe('reachable Confluence spaces', () => {
  it('maps each page to an ok Observation dated at the read, with id, title, space key, last modified, version and link', async () => {
    const items = await run(happyScript()).result;
    expect(items.every((i) => i.type === 'Observation' && i.state === 'ok' && i.sourceId === sourceId)).toBe(true);
    expect(items.every((i) => i.observedAt.getTime() === NOW.getTime())).toBe(true);
    expect(items.map((i) => i.sourceRef)).toEqual(['confluence:ENG#page/1001', 'confluence:ENG#page/1002', 'confluence:OPS#page/2001']);
    expect(items[0]!.payload).toEqual({
      kind: 'confluence_page',
      pageId: '1001',
      title: 'Synthetic page 1001',
      textClipped: false,
      spaceKey: 'ENG',
      lastModified: '2026-11-24T08:00:00.000Z',
      version: 3,
      url: `${SITE}/wiki/spaces/ENG/pages/1001`,
    });
    expect(items[1]!.payload).toMatchObject({ version: 1, lastModified: '2026-11-20T08:00:00.000Z' });
  });

  it('only ever reads: the space, then one bounded page list of current pages, newest first', async () => {
    const { transport, result } = run(happyScript());
    await result;
    expect(transport.calls).toEqual([
      '/wiki/api/v2/spaces?keys=ENG&limit=1',
      `/wiki/api/v2/spaces/${ENG_ID}/pages?status=current&sort=-modified-date&limit=20`,
      '/wiki/api/v2/spaces?keys=OPS&limit=1',
      `/wiki/api/v2/spaces/${OPS_ID}/pages?status=current&sort=-modified-date&limit=20`,
    ]);
  });

  it('stores no personal or free-text fields (X04): no body, author, owner, version message or upstream link', async () => {
    const text = JSON.stringify((await run(happyScript()).result).map((i) => i.payload));
    for (const banned of ['body', 'Private body', 'authorId', 'ownerId', '5b10ac8d', 'person@example.com', 'message', 'evil.example', '_links', 'webui']) {
      expect(text).not.toContain(banned);
    }
  });

  it('caps an oversized title at 300 whole characters and keeps it storable in jsonb', async () => {
    const title = `${'x'.repeat(299)}\u{1F600}${String.fromCharCode(0)}\ud83d${'y'.repeat(10_000)}`;
    const items = await run(withEngPages({ results: [engPage({ title })] })).result;
    const stored = pages(items)[0]!.payload['title'] as string;
    expect(Array.from(stored)).toHaveLength(300);
    expect(JSON.stringify(stored)).not.toMatch(/\\u0000|\\ud83d"/i);
  });
});

describe('links point only at the configured https atlassian.net site', () => {
  it.each([
    'http://kemetra-synthetic.atlassian.net',
    'https://kemetra-synthetic.atlassian.net.evil.example',
    'https://evil.example',
    'https://user@kemetra-synthetic.atlassian.net',
    'https://kemetra-synthetic.atlassian.net:444',
    'https://kemetra-synthetic.atlassian.net/wiki',
    'not a url',
  ])('site %j: pages are still observed, with no link', async (site) => {
    const items = await run(happyScript(), { site }).result;
    expect(pages(items)).toHaveLength(3);
    expect(pages(items).every((i) => i.payload['url'] === null)).toBe(true);
  });
});

describe('a page list older than the TTL is stale, never ok', () => {
  const engBody = () => (happyScript()[pagesPath(ENG_ID)] as ConfluenceResponse).body;

  it('marks the pages of an answer dated beyond the TTL as stale, other spaces unaffected', async () => {
    const items = await run(withEngPages(engBody(), { date: new Date(NOW.getTime() - 60 * 60_000).toUTCString() })).result;
    expect(items.map((i) => [i.sourceRef, i.state])).toEqual([
      ['confluence:ENG#page/1001', 'stale'],
      ['confluence:ENG#page/1002', 'stale'],
      ['confluence:OPS#page/2001', 'ok'],
    ]);
  });

  it('keeps an answer within a configured TTL ok', async () => {
    const items = await run(withEngPages(engBody(), { date: new Date(NOW.getTime() - 30 * 60_000).toUTCString() }), { ttlMs: 60 * 60_000 }).result;
    expect(items.every((i) => i.state === 'ok')).toBe(true);
  });

  it('refuses an unreadable date header as malformed', async () => {
    const items = await run(withEngPages(engBody(), { date: 'soon' })).result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', sourceRef: 'confluence:ENG#pages', payload: expect.objectContaining({ reason: 'malformed' }) })]);
  });
});

describe('failures are recorded, never reported as ok', () => {
  it.each([
    [401, 'denied', 'denied'],
    [403, 'denied', 'denied'],
    [404, 'denied', 'not_visible'],
    [429, 'unknown', 'rate_limited'],
    [500, 'unknown', 'unavailable'],
    [400, 'error', 'unexpected_status'],
  ])('HTTP %i on the space becomes one %s record (%s), no page read; the other space still reports', async (code, state, reason) => {
    const { transport, result } = run({ ...happyScript(), [spacePath('ENG')]: status(code) });
    const items = await result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state, sourceRef: 'confluence:ENG', payload: { kind: 'source_status', endpoint: 'space', space: 'ENG', reason } }),
    ]);
    expect(transport.calls).not.toContain(pagesPath(ENG_ID));
    expect(pages(items).map((i) => i.payload['pageId'])).toEqual(['2001']);
    expect(JSON.stringify(items)).not.toContain('Unauthorized');
  });

  it.each([
    [401, 'denied', 'denied'],
    [403, 'denied', 'denied'],
    [503, 'unknown', 'unavailable'],
  ])('HTTP %i on the page list becomes one %s record (%s)', async (code, state, reason) => {
    const items = await run({ ...happyScript(), [pagesPath(ENG_ID)]: status(code) }).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state, sourceRef: 'confluence:ENG#pages', payload: { kind: 'source_status', endpoint: 'pages', space: 'ENG', reason } }),
    ]);
  });

  it('a space the answer does not list is not visible (denied), with no page read', async () => {
    const { transport, result } = run({ ...happyScript(), [spacePath('ENG')]: ok({ results: [] }) });
    const items = await result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'denied', payload: expect.objectContaining({ endpoint: 'space', reason: 'not_visible' }) })]);
    expect(transport.calls).toHaveLength(3);
  });

  it('refuses a space answer for another space key (ref_mismatch)', async () => {
    const items = await run({ ...happyScript(), [spacePath('ENG')]: ok(space('SECRET', ENG_ID)) }).result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', payload: expect.objectContaining({ endpoint: 'space', reason: 'ref_mismatch' }) })]);
  });

  it.each([
    ['a non-object space answer', '<html>'],
    ['results that is not an array', { results: {} }],
    ['more than one space', { results: [{ id: '1', key: 'ENG' }, { id: '2', key: 'ENG' }] }],
    ['a numeric space id', { results: [{ id: 98304, key: 'ENG' }] }],
    ['a space id that is not a decimal id', { results: [{ id: '../../admin', key: 'ENG' }] }],
    ['a space with no key', { results: [{ id: '1' }] }],
  ])('%s is malformed: error, no page read', async (_label, body) => {
    const { transport, result } = run({ ...happyScript(), [spacePath('ENG')]: ok(body) });
    const items = await result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', payload: expect.objectContaining({ endpoint: 'space', reason: 'malformed' }) })]);
    expect(transport.calls.filter((c) => c.includes('/pages'))).toEqual([pagesPath(OPS_ID)]);
  });

  it.each([
    [new ConfluenceTransportFailure('network'), 'unknown', 'network'],
    [new ConfluenceTransportFailure('timeout'), 'unknown', 'timeout'],
    [new Error('socket hang up with token ATATT3xSecret'), 'error', 'transport_error'],
  ])('a thrown %s becomes %s (%s) without copying its message', async (err, state, reason) => {
    const items = await run({ ...happyScript(), [pagesPath(ENG_ID)]: err }).result;
    expect(statuses(items)[0]).toMatchObject({ state, payload: { reason } });
    expect(JSON.stringify(items)).not.toContain('ATATT3xSecret');
  });

  it.each([
    ['a body without results', { pages: [] }],
    ['a page without version', { results: [engPage({ version: undefined })] }],
    ['a missing title', { results: [engPage({ title: undefined })] }],
    ['a numeric page id', { results: [engPage({ id: 1001 })] }],
    ['a page id that is not a decimal id', { results: [engPage({ id: '1001?x=1' })] }],
    ['an oversized page id', { results: [engPage({ id: '9'.repeat(25) })] }],
    ['a zero version', { results: [engPage({ version: { number: 0, createdAt: '2026-11-24T08:00:00Z' } })] }],
    ['a fractional version', { results: [engPage({ version: { number: 1.5, createdAt: '2026-11-24T08:00:00Z' } })] }],
    ['a missing last modified', { results: [engPage({ version: { number: 2 } })] }],
    ['an invalid last modified', { results: [engPage({ version: { number: 2, createdAt: 'recently' } })] }],
    ['a duplicated page', { results: [engPage(), engPage()] }],
    ['a page list longer than requested', { results: Array.from({ length: 21 }, (_, i) => page(String(3000 + i), ENG_ID)) }],
  ])('%s: the space gets one error record (malformed) and no page is invented or kept', async (_label, body) => {
    const items = await run(withEngPages(body)).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state: 'error', sourceRef: 'confluence:ENG#pages', payload: { kind: 'source_status', endpoint: 'pages', space: 'ENG', reason: 'malformed' } }),
    ]);
    expect(pages(items).map((i) => i.payload['pageId'])).toEqual(['2001']);
  });

  it('refuses a page from another space under this one (ref_mismatch)', async () => {
    const items = await run(withEngPages({ results: [engPage(), page('1003', OPS_ID)] })).result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', payload: expect.objectContaining({ endpoint: 'pages', reason: 'ref_mismatch' }) })]);
    expect(pages(items).some((i) => i.payload['spaceKey'] === 'ENG')).toBe(false);
  });

  it('never yields ok on any failure path', async () => {
    const answers: (ConfluenceResponse | Error)[] = [
      ...[301, 400, 401, 403, 404, 429, 500, 503].map((c) => status(c)),
      ok(null),
      ok({ results: [] }),
      ok({ results: [{ id: 'x', key: 'ENG' }] }),
      new ConfluenceTransportFailure('timeout'),
      new Error('boom'),
    ];
    for (const answer of answers) {
      const items = await run({ [spacePath('ENG')]: answer }, { spaceKeys: ['ENG'] }).result;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.state !== 'ok')).toBe(true);
    }
  });
});

describe('space keys are validated before any request', () => {
  it.each([[['eng']], [['~5b10ac8d']], [['ENG&keys=SECRET']], [['EN G']], [['ENG', 'ENG']], [[]], [['A'.repeat(33)]]])(
    'refuses %j: no request, one error record',
    async (spaceKeys) => {
      const { transport, result } = run(happyScript(), { spaceKeys });
      const items = await result;
      expect(transport.calls).toEqual([]);
      expect(items).toEqual([
        expect.objectContaining({ state: 'error', sourceRef: 'confluence:invalid-ref', payload: { kind: 'source_status', endpoint: 'space', reason: 'invalid_ref' } }),
      ]);
    },
  );
});

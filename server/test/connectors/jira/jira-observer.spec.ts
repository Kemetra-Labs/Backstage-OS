// Jira observation mapper (BACK-53 mock slice): canned answers only, no network.
import { randomUUID } from 'node:crypto';
import { observeJiraProjects, searchPath } from '../../../src/connectors/jira/jira.observer';
import { JiraTransportFailure, type JiraResponse } from '../../../src/connectors/jira/jira.transport';
import type { ObservationInput } from '../../../src/evidence/evidence.repository';
import { backIssues, happyScript, issue, NOW, ok, ScriptedTransport, SITE, type Script } from './jira.fixture';

const sourceId = randomUUID();

const run = (script: Script, over: { site?: string; projectKeys?: readonly string[]; ttlMs?: number } = {}) => {
  const transport = new ScriptedTransport(script);
  const source = { sourceId, site: over.site ?? SITE, projectKeys: over.projectKeys ?? ['BACK', 'OPS'] };
  const opts = over.ttlMs === undefined ? {} : { ttlMs: over.ttlMs };
  return { transport, result: observeJiraProjects(transport, source, NOW, opts) };
};

const statuses = (items: readonly ObservationInput[]) => items.filter((i) => i.payload['kind'] === 'source_status');
const issues = (items: readonly ObservationInput[]) => items.filter((i) => i.payload['kind'] === 'jira_issue');
const status = (code: number): JiraResponse => ({ status: code, body: { errorMessages: ['Bad credentials https://x'] }, headers: {} });
const withBack = (body: unknown, headers: Record<string, string> = {}): Script => ({ ...happyScript(), [searchPath('BACK')]: ok(body, headers) });

describe('reachable Jira projects', () => {
  it('maps each issue to an ok Observation dated at the read, with key, summary, status category, update time and link', async () => {
    const items = await run(happyScript()).result;
    expect(items.every((i) => i.type === 'Observation' && i.state === 'ok' && i.sourceId === sourceId)).toBe(true);
    expect(items.every((i) => i.observedAt.getTime() === NOW.getTime())).toBe(true);
    expect(items.map((i) => i.sourceRef)).toEqual(['jira:BACK#issue/BACK-53', 'jira:BACK#issue/BACK-52', 'jira:OPS#issue/OPS-7']);
    expect(items[0]!.payload).toEqual({
      kind: 'jira_issue',
      key: 'BACK-53',
      summary: 'Synthetic summary for BACK-53',
      statusCategory: 'indeterminate',
      updatedAt: '2026-11-24T08:00:00.000Z',
      url: `${SITE}/browse/BACK-53`,
    });
    expect(items.map((i) => i.payload['statusCategory'])).toEqual(['indeterminate', 'done', 'new']);
  });

  it('only ever reads: one bounded search per configured project, newest first', async () => {
    const { transport, result } = run(happyScript());
    await result;
    expect(transport.calls).toEqual([searchPath('BACK'), searchPath('OPS')]);
    expect(decodeURIComponent(transport.calls[0]!)).toBe(
      '/rest/api/3/search/jql?jql=project = "BACK" ORDER BY updated DESC&maxResults=20&fields=summary,status,updated',
    );
  });

  it('stores no personal or free-text fields (X04): no description, assignee, reporter, email or account id', async () => {
    const text = JSON.stringify((await run(happyScript()).result).map((i) => i.payload));
    for (const banned of ['description', 'Private description', 'assignee', 'reporter', 'person@example.com', 'accountId', '5b10ac8d', 'Synthetic Person', 'evil.example', 'self']) {
      expect(text).not.toContain(banned);
    }
  });

  it('caps an oversized summary at 300 whole characters', async () => {
    const items = await run(withBack({ issues: [issue('BACK-1', { summary: 'x'.repeat(10_000) })] })).result;
    expect(Array.from(issues(items)[0]!.payload['summary'] as string)).toHaveLength(300);
  });

  it('keeps a summary storable in jsonb: NUL removed, unpaired surrogate replaced, no split emoji', async () => {
    const summary = `${'x'.repeat(299)}\u{1F600}${String.fromCharCode(0)}\ud83d`;
    const items = await run(withBack({ issues: [issue('BACK-1', { summary })] })).result;
    expect(JSON.stringify(issues(items)[0]!.payload)).not.toMatch(/\\u0000|\\ud83d"/i);
  });
});

describe('links point only at the configured https atlassian.net site', () => {
  it.each([
    'http://kemetra-synthetic.atlassian.net',
    'https://kemetra-synthetic.atlassian.net.evil.example',
    'https://evil.example',
    'https://atlassian.net',
    'https://user:pw@kemetra-synthetic.atlassian.net',
    'https://kemetra-synthetic.atlassian.net:8443',
    'https://kemetra-synthetic.atlassian.net/wiki',
    'https://kemetra-synthetic.atlassian.net/?next=https://evil.example',
    'https://kemetra-synthetic.atlassian.net/#frag',
    'javascript:alert(1)',
    `https://${'a'.repeat(300)}.atlassian.net`,
    '',
  ])('site %j: issues are still observed, with no link', async (site) => {
    const items = await run(happyScript(), { site }).result;
    expect(issues(items)).toHaveLength(3);
    expect(issues(items).every((i) => i.payload['url'] === null)).toBe(true);
  });

  it('accepts a trailing slash and normalises the host to lower case', async () => {
    const items = await run(happyScript(), { site: 'https://Kemetra-Synthetic.atlassian.net/' }).result;
    expect(items[0]!.payload['url']).toBe('https://kemetra-synthetic.atlassian.net/browse/BACK-53');
  });
});

describe('an answer older than the TTL is stale, never ok', () => {
  it('marks every issue of an answer dated beyond the default 15 minute TTL as stale', async () => {
    const items = await run(withBack(backIssues, { date: new Date(NOW.getTime() - 16 * 60_000).toUTCString() })).result;
    expect(items.filter((i) => i.sourceRef.startsWith('jira:BACK')).map((i) => i.state)).toEqual(['stale', 'stale']);
    expect(items.filter((i) => i.sourceRef.startsWith('jira:OPS')).map((i) => i.state)).toEqual(['ok']);
  });

  it('keeps an answer within the TTL ok, and honours a configured TTL', async () => {
    const headers = { date: new Date(NOW.getTime() - 5 * 60_000).toUTCString() };
    expect((await run(withBack(backIssues, headers)).result).every((i) => i.state === 'ok')).toBe(true);
    const short = await run(withBack(backIssues, headers), { ttlMs: 60_000 }).result;
    expect(short.filter((i) => i.sourceRef.startsWith('jira:BACK')).every((i) => i.state === 'stale')).toBe(true);
  });

  it('refuses an unreadable date header as malformed: it cannot prove freshness', async () => {
    const items = await run(withBack(backIssues, { date: 'last tuesday' })).result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', sourceRef: 'jira:BACK', payload: { kind: 'source_status', endpoint: 'issues', project: 'BACK', reason: 'malformed' } })]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects a TTL of %p', async (ttlMs) => {
    await expect(run(happyScript(), { ttlMs }).result).rejects.toThrow(RangeError);
  });
});

describe('failures are recorded, never reported as ok', () => {
  it.each([
    [401, 'denied', 'denied'],
    [403, 'denied', 'denied'],
    [404, 'denied', 'not_visible'],
    [429, 'unknown', 'rate_limited'],
    [500, 'unknown', 'unavailable'],
    [503, 'unknown', 'unavailable'],
    [400, 'error', 'unexpected_status'],
    [302, 'error', 'unexpected_status'],
  ])('HTTP %i on one project becomes one %s record (%s); the other project still reports', async (code, state, reason) => {
    const items = await run({ ...happyScript(), [searchPath('BACK')]: status(code) }).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ type: 'Observation', state, sourceRef: 'jira:BACK', payload: { kind: 'source_status', endpoint: 'issues', project: 'BACK', reason } }),
    ]);
    expect(issues(items).map((i) => i.payload['key'])).toEqual(['OPS-7']);
  });

  it.each([
    [new JiraTransportFailure('network'), 'unknown', 'network'],
    [new JiraTransportFailure('timeout'), 'unknown', 'timeout'],
    [new Error('socket hang up with token ATATT3xSecret'), 'error', 'transport_error'],
  ])('a thrown %s becomes %s (%s) without copying its message', async (err, state, reason) => {
    const items = await run({ ...happyScript(), [searchPath('BACK')]: err }).result;
    expect(statuses(items)[0]).toMatchObject({ state, payload: { reason } });
    expect(JSON.stringify(items)).not.toContain('ATATT3xSecret');
  });

  it('never stores the upstream error text', async () => {
    const items = await run({ ...happyScript(), [searchPath('BACK')]: status(401) }).result;
    expect(JSON.stringify(items)).not.toContain('Bad credentials');
  });

  it.each([
    ['a non-object body', '<html>'],
    ['a body without issues', { values: [] }],
    ['issues that is not an array', { issues: {} }],
    ['an issue without fields', { issues: [{ key: 'BACK-1' }] }],
    ['a missing key', { issues: [{ ...issue('BACK-1'), key: undefined }] }],
    ['a key with no number', { issues: [issue('BACK-')] }],
    ['a key with a zero-led number', { issues: [issue('BACK-01')] }],
    ['an oversized key', { issues: [issue(`BACK-${'1'.repeat(40)}`)] }],
    ['a missing summary', { issues: [issue('BACK-1', { summary: undefined })] }],
    ['a numeric summary', { issues: [issue('BACK-1', { summary: 42 })] }],
    ['a missing status', { issues: [issue('BACK-1', { status: undefined })] }],
    ['an unknown status category', { issues: [issue('BACK-1', { status: { statusCategory: { key: 'blocked' } } })] }],
    ['Jira\'s "undefined" status category', { issues: [issue('BACK-1', { status: { statusCategory: { key: 'undefined' } } })] }],
    ['a status name with no category', { issues: [issue('BACK-1', { status: { name: 'Done' } })] }],
    ['an invalid updated time', { issues: [issue('BACK-1', { updated: 'yesterday' })] }],
    ['a missing updated time', { issues: [issue('BACK-1', { updated: undefined })] }],
    ['a duplicated issue', { issues: [issue('BACK-1'), issue('BACK-1')] }],
    ['a page longer than requested', { issues: Array.from({ length: 21 }, (_, i) => issue(`BACK-${i + 1}`)) }],
  ])('%s: the project gets one error record (malformed) and no issue is invented or kept', async (_label, body) => {
    const items = await run(withBack(body)).result;
    expect(statuses(items)).toEqual([
      expect.objectContaining({ state: 'error', sourceRef: 'jira:BACK', payload: { kind: 'source_status', endpoint: 'issues', project: 'BACK', reason: 'malformed' } }),
    ]);
    expect(issues(items).map((i) => i.payload['key'])).toEqual(['OPS-7']);
  });

  it('refuses an issue from another project under this one (ref_mismatch)', async () => {
    const items = await run(withBack({ issues: [issue('BACK-1'), issue('OPS-9')] })).result;
    expect(statuses(items)).toEqual([expect.objectContaining({ state: 'error', payload: expect.objectContaining({ reason: 'ref_mismatch' }) })]);
    expect(issues(items).some((i) => (i.payload['key'] as string).startsWith('BACK'))).toBe(false);
  });

  it('records an empty project as no issues and no failure', async () => {
    const items = await run(withBack({ issues: [] })).result;
    expect(statuses(items)).toEqual([]);
    expect(issues(items)).toHaveLength(1);
  });

  it('never yields ok on any failure path', async () => {
    const answers: (JiraResponse | Error)[] = [
      ...[301, 400, 401, 403, 404, 409, 429, 500, 502, 503, 504].map((c) => status(c)),
      ok(null),
      ok('x'),
      ok({ issues: [issue('BACK-1', { status: null })] }),
      new JiraTransportFailure('network'),
      new Error('boom'),
    ];
    for (const answer of answers) {
      const items = await run({ [searchPath('BACK')]: answer }, { projectKeys: ['BACK'] }).result;
      expect(items.every((i) => i.state !== 'ok')).toBe(true);
    }
  });
});

describe('project keys are validated before any request', () => {
  it.each([
    [['back']],
    [['B']],
    [['BACK OPS']],
    [['BACK"', 'OPS']],
    [['BACK) OR project = (SECRET']],
    [['ABCDEFGHIJK']],
    [['1BACK']],
    [['BACK', 'BACK']],
    [[]],
    [Array.from({ length: 11 }, (_, i) => `P${String.fromCharCode(65 + i)}`)],
  ])('refuses %j: no request, one error record', async (projectKeys) => {
    const { transport, result } = run(happyScript(), { projectKeys });
    const items = await result;
    expect(transport.calls).toEqual([]);
    expect(items).toEqual([
      expect.objectContaining({ state: 'error', sourceRef: 'jira:invalid-ref', payload: { kind: 'source_status', endpoint: 'issues', reason: 'invalid_ref' } }),
    ]);
  });
});

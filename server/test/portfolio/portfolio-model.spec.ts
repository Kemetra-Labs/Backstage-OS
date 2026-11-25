// Portfolio read model (BACK-49 slice 2): batch summaries and states as facts. Pure, no database.
import { summarizeProject, summarizeSource, worstState, type BatchRow, type SourceRef } from '../../src/portfolio/portfolio.model';

const source: SourceRef = { id: 's1', provider: 'github', externalRef: 'kemetra-labs/backstage-os' };
const READ = '2026-11-25T12:00:00.000Z';

let n = 0;
const row = (state: BatchRow['state'], payload: Record<string, unknown>, sourceRef = 'github:kemetra-labs/backstage-os'): BatchRow => ({
  id: `e${++n}`,
  state,
  sourceRef,
  observedAt: READ,
  payload,
});
const repoOk = () => row('ok', { kind: 'repository', fullName: 'Kemetra-Labs/Backstage-OS', defaultBranch: 'main', archived: false, private: true, pushedAt: null });
const status = (state: BatchRow['state'], endpoint: string, reason: string) => row(state, { kind: 'source_status', endpoint, reason });
const page = (endpoint: string, returned: number) => row('ok', { kind: 'list_page', endpoint, returned, pageSize: 20 });
const pr = (num: number) =>
  row('ok', { kind: 'pull_request', number: num, title: `PR ${num}`, state: 'open', draft: false, updatedAt: READ, url: null }, `github:kemetra-labs/backstage-os#pull/${num}`);
const issue = (num: number) =>
  row('ok', { kind: 'issue', number: num, title: `Issue ${num}`, state: 'open', updatedAt: READ, url: null }, `github:kemetra-labs/backstage-os#issue/${num}`);

const unread = (reason: string) => ({ state: 'unknown', reason, count: null, complete: null });

describe('worstState', () => {
  it('orders ok < stale < unknown < error < denied', () => {
    expect(worstState(['ok', 'stale'])).toBe('stale');
    expect(worstState(['stale', 'unknown'])).toBe('unknown');
    expect(worstState(['unknown', 'error'])).toBe('error');
    expect(worstState(['error', 'denied', 'ok'])).toBe('denied');
  });

  it('is unknown for nothing at all, never ok', () => {
    expect(worstState([])).toBe('unknown');
  });
});

describe('a source summary', () => {
  it('is unknown / never_read with no counts when there is no read', () => {
    const s = summarizeSource(source, []);
    expect(s).toMatchObject({ state: 'unknown', reason: 'never_read', lastReadAt: null });
    expect(s.lists).toEqual({ pullRequests: unread('never_read'), issues: unread('never_read') });
  });

  it('is ok with complete counts when both lists returned less than a full page', () => {
    const s = summarizeSource(source, [repoOk(), page('pull_requests', 2), pr(1), pr(2), page('issues', 3), issue(7)]);
    expect(s).toMatchObject({ state: 'ok', reason: null, lastReadAt: READ });
    expect(s.lists).toEqual({
      pullRequests: { state: 'ok', reason: null, count: 2, complete: true },
      issues: { state: 'ok', reason: null, count: 1, complete: true },
    });
  });

  it('a full page is not presented as the total: complete is false and the count is a lower bound', () => {
    const prs = Array.from({ length: 20 }, (_, i) => pr(i + 1));
    // The issues page was full of pull requests: 0 issues kept, but there may be more issues.
    const s = summarizeSource(source, [repoOk(), page('pull_requests', 20), ...prs, page('issues', 20)]);
    expect(s.lists.pullRequests).toEqual({ state: 'ok', reason: null, count: 20, complete: false });
    expect(s.lists.issues).toEqual({ state: 'ok', reason: null, count: 0, complete: false });
  });

  it('without a page record the completeness is unknown (null), not assumed', () => {
    expect(summarizeSource(source, [repoOk(), pr(1)]).lists.pullRequests).toEqual({ state: 'ok', reason: null, count: 1, complete: null });
  });

  it('an ok read with zero open items is ok with a count of 0, not unknown', () => {
    expect(summarizeSource(source, [repoOk(), page('pull_requests', 0)]).lists.pullRequests).toEqual({ state: 'ok', reason: null, count: 0, complete: true });
  });

  it.each([
    ['denied', 'denied'],
    ['denied', 'not_visible'],
    ['unknown', 'timeout'],
    ['error', 'malformed'],
  ] as const)('a failed repository read (%s / %s) shows that failure, no counts and no items', (state, reason) => {
    const s = summarizeSource(source, [status(state, 'repository', reason), pr(1)]);
    expect(s).toMatchObject({ state, reason, lastReadAt: READ });
    expect(s.lists.pullRequests).toEqual(unread('not_read'));
    expect(s.items).toEqual([]);
  });

  it('a failed list shows its own failure, the other list keeps its count, and the source is not ok', () => {
    const s = summarizeSource(source, [repoOk(), status('unknown', 'pull_requests', 'rate_limited'), page('issues', 1), issue(7)]);
    expect(s.lists).toEqual({
      pullRequests: { state: 'unknown', reason: 'rate_limited', count: null, complete: null },
      issues: { state: 'ok', reason: null, count: 1, complete: true },
    });
    expect(s.state).toBe('unknown');
    expect(s.reason).toBe('rate_limited');
  });

  it('a batch without a repository-level record is treated as never read', () => {
    expect(summarizeSource(source, [pr(1)])).toMatchObject({ state: 'unknown', reason: 'never_read', lastReadAt: null });
  });

  it('a status row that claims ok is not trusted as ok', () => {
    const s = summarizeSource(source, [repoOk(), status('ok', 'issues', 'whatever')]);
    expect(s.lists.issues.state).toBe('error');
    expect(s.state).toBe('error');
  });

  it('a repository record that is not ok is a read with a contradiction: error, with its read time', () => {
    const s = summarizeSource(source, [row('unknown', { kind: 'repository' }), pr(1)]);
    expect(s).toMatchObject({ state: 'error', reason: 'malformed', lastReadAt: READ, items: [] });
  });

  it('two repository-level records in one batch are not mixed: error / ambiguous_read, no items', () => {
    const s = summarizeSource(source, [repoOk(), pr(1), repoOk(), pr(1)]);
    expect(s).toMatchObject({ state: 'error', reason: 'ambiguous_read', items: [] });
    expect(s.lists.pullRequests.count).toBeNull();
  });

  it('keeps only allow-listed item fields and the evidence id, in a stable order', () => {
    const extra = pr(3);
    (extra.payload as Record<string, unknown>)['body'] = 'secret body';
    const s = summarizeSource(source, [repoOk(), issue(7), extra, pr(1)]);
    expect(s.items.map((i) => `${i.kind}/${i.number}`)).toEqual(['pull_request/1', 'pull_request/3', 'issue/7']);
    expect(JSON.stringify(s.items)).not.toContain('secret body');
    expect(Object.keys(s.items[0]!).sort()).toEqual(['draft', 'evidenceId', 'kind', 'number', 'state', 'title', 'updatedAt', 'url']);
  });

  it('drops an item row whose payload is not a valid item', () => {
    const bad = row('ok', { kind: 'pull_request', number: 'x', title: 1 });
    const s = summarizeSource(source, [repoOk(), bad]);
    expect(s.items).toEqual([]);
    expect(s.lists.pullRequests).toEqual({ state: 'error', reason: 'malformed', count: null, complete: null });
  });
});

describe('a project summary', () => {
  const base = { id: 'p1', key: 'backstage-os', name: 'Backstage OS' };

  it('is ok only when every source is ok', () => {
    const ok = summarizeSource(source, [repoOk()]);
    const failed = summarizeSource({ ...source, id: 's2' }, [status('denied', 'repository', 'denied')]);
    expect(summarizeProject(base, [ok]).state).toBe('ok');
    expect(summarizeProject(base, [ok, failed]).state).toBe('denied');
    expect(summarizeProject(base, [ok, summarizeSource({ ...source, id: 's3' }, [])]).state).toBe('unknown');
  });

  it('with no visible source is unknown, never ok', () => {
    expect(summarizeProject(base, []).state).toBe('unknown');
  });
});

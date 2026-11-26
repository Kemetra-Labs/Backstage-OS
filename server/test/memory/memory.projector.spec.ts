// COG-02 S1 (BACK-105): the pure memory projector, specified by docs/planning/BACK-105/cog-02-design.md.
// Synthetic rows only. Section references (D2, D3, D3a, D5, D6) point into that design.
import type { MemoryItem, MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { at, confPage, CONF, GH, ghIssue, JIRA, jiraIssue, listPage, pr, repo, REPO, request, sources, status } from './memory.fixture';

const item = (p: MemoryProjection, ref: string, kind?: string): MemoryItem => {
  const found = p.items.find((i) => i.sourceRef === ref && (kind === undefined || i.kind === kind));
  if (!found) throw new Error(`no item ${ref} ${kind ?? ''}`);
  return found;
};
const PR1 = `${REPO}#pull/1`;

describe('input filter (D2)', () => {
  it('reads only Observations of allow-listed kinds: a Correlation on a PR ref, seed kinds and kindless notes never become items', () => {
    const rows: MemoryRow[] = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:55') }),
      { ...pr(1, { updatedAt: at('09:30'), title: 'claimed' }, { id: 'e-02', observedAt: at('11:56') }), type: 'Correlation' },
      { ...pr(1, { updatedAt: at('09:00') }, { id: 'e-03', observedAt: at('11:56') }), payload: { kind: 'workflow_run', conclusion: 'success' } },
      { ...pr(1, { updatedAt: at('09:00') }, { id: 'e-04', observedAt: at('11:56') }), sourceRef: `${REPO}#deployments`, payload: { kind: 'deployments' } },
      { ...pr(1, { updatedAt: at('09:00') }, { id: 'e-05', observedAt: at('11:56') }), payload: { text: 'a note without a kind' } },
    ];
    const p = project(rows, request());
    expect(p.items.map((i) => [i.sourceRef, i.kind])).toEqual([[PR1, 'pull_request']]);
    expect(item(p, PR1).history).toHaveLength(1);
    expect(item(p, PR1).current?.lastEvidenceId).toBe('e-01');
  });

  it('ignores rows received after knownAt', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('10:00') }),
      pr(1, { updatedAt: at('11:00'), title: 'later' }, { id: 'e-02', observedAt: at('11:00'), receivedAt: at('12:01') }),
    ];
    expect(item(project(rows, request()), PR1).current?.payload['title']).toBe('PR 1');
  });
});

describe('runs keep freshness and history (D2, correction A)', () => {
  it('collapses identical polls into one run with first and latest times, count, states and both evidence ids', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('10:00'), receivedAt: at('10:01') }),
      pr(1, { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:00'), receivedAt: at('11:01') }),
      pr(1, { updatedAt: at('09:00') }, { id: 'e-03', observedAt: at('11:50'), receivedAt: at('11:51') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect(i.history).toHaveLength(1);
    expect(i.current).toMatchObject({
      observationCount: 3,
      firstObservedAt: at('10:00'),
      lastObservedAt: at('11:50'),
      firstKnownAt: at('10:01'),
      lastKnownAt: at('11:51'),
      firstEvidenceId: 'e-01',
      lastEvidenceId: 'e-03',
      states: ['ok'],
    });
  });

  it('judges freshness by the latest confirmation, not the first sighting', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('10:00') }),
      pr(1, { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    expect(item(project(rows, request()), PR1).status).toBe('verified');
  });

  it('repository A -> B -> A is three runs and the latest provider read is current, labelled', () => {
    const rows = [
      repo({ archived: false }, { id: 'e-01', observedAt: at('10:00') }),
      repo({ archived: true }, { id: 'e-02', observedAt: at('11:00') }),
      repo({ archived: false }, { id: 'e-03', observedAt: at('11:55') }),
    ];
    const i = item(project(rows, request()), REPO, 'repository');
    expect(i.history.map((r) => r.payload['archived'])).toEqual([false, true, false]);
    expect(i.orderedBy).toBe('latest-read');
    expect(i.current?.lastEvidenceId).toBe('e-03');
    expect(i.status).toBe('verified');
  });

  it('a repository read observed earlier but ingested later never becomes current', () => {
    const rows = [
      repo({ archived: true }, { id: 'e-01', observedAt: at('11:52'), receivedAt: at('11:53') }),
      repo({ archived: false }, { id: 'e-02', observedAt: at('11:50'), receivedAt: at('11:56') }),
    ];
    expect(item(project(rows, request()), REPO, 'repository').current?.payload['archived']).toBe(true);
  });

  it('two repository reads with the same observed_at and different content are unknown, not guessed', () => {
    const rows = [
      repo({ archived: true }, { id: 'e-01', observedAt: at('11:50') }),
      repo({ archived: false }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), REPO, 'repository');
    expect([i.status, i.reason, i.current]).toEqual(['unknown', 'ambiguous_read', null]);
  });

  it('an ordered item: a lagging read of an older revision is kept as a run but never becomes current', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00'), title: 'A' }, { id: 'e-01', observedAt: at('10:00') }),
      pr(1, { updatedAt: at('10:30'), title: 'B' }, { id: 'e-02', observedAt: at('11:00') }),
      pr(1, { updatedAt: at('09:00'), title: 'A' }, { id: 'e-03', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect(i.history).toHaveLength(3);
    expect(i.current?.payload['title']).toBe('B');
  });

  it('ties on the last observed instant break by the last ROW\'s receivedAt, not the run\'s latest receivedAt (S1 order)', () => {
    // Run 1 = [B@09:50 received 11:59, B@10:00 received 10:01]; run 2 = [A@10:00]; run 3 = [B@10:00 received 10:03].
    // Both B runs end at 10:00. S1 picks the run whose actual last row was received later: run 3.
    const B = { updatedAt: at('09:30'), title: 'B' };
    const rows = [
      pr(1, B, { id: 'r1a', observedAt: at('09:50'), receivedAt: at('11:59') }),
      pr(1, B, { id: 'r1b', observedAt: at('10:00'), receivedAt: at('10:01') }),
      pr(1, { updatedAt: at('09:00'), title: 'A' }, { id: 'r2', observedAt: at('10:00'), receivedAt: at('10:02') }),
      pr(1, B, { id: 'r3', observedAt: at('10:00'), receivedAt: at('10:03') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.current?.firstEvidenceId, i.current?.lastEvidenceId]).toEqual(['r3', 'r3']);
  });

  it('history runs that start at the same observed instant are ordered by their first row\'s receivedAt', () => {
    // Row order (observed, received, id): y (10:00 / 10:03), x1 (10:00 / 10:05), x2 (10:20 / 10:00)
    // -> runs [y], [x1, x2]. Run x's MIN received (10:00) is earlier than y's, but its first row's (10:05) is later.
    const rows = [
      repo({ archived: true }, { id: 'y', observedAt: at('10:00'), receivedAt: at('10:03') }),
      repo({ archived: false }, { id: 'x1', observedAt: at('10:00'), receivedAt: at('10:05') }),
      repo({ archived: false }, { id: 'x2', observedAt: at('10:20'), receivedAt: at('10:00') }),
    ];
    const i = item(project(rows, request()), REPO, 'repository');
    expect(i.history.map((r) => r.firstEvidenceId)).toEqual(['y', 'x1']);
  });

  it('ok -> stale -> ok of the same content recovers: the latest row state counts, not the worst', () => {
    const rows = [
      jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:00') }),
      jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:20'), state: 'stale' }),
      jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-03', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), 'jira:BACK#issue/BACK-1');
    expect(i.status).toBe('verified');
    expect(i.current?.states).toEqual(['ok', 'stale']);
  });
});

describe('content keys and revision order (D2)', () => {
  it('a url change is neither a revision nor a conflict', () => {
    const rows = [
      jiraIssue('BACK-1', { updatedAt: at('09:00'), url: 'https://a.example/browse/BACK-1' }, { id: 'e-01', observedAt: at('11:00') }),
      jiraIssue('BACK-1', { updatedAt: at('09:00'), url: null as unknown as string }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), 'jira:BACK#issue/BACK-1');
    expect(i.history).toHaveLength(1);
    expect(i.status).toBe('verified');
  });

  it('the same updatedAt with different content at the current key is a conflict with no current value', () => {
    const rows = [
      pr(1, { updatedAt: at('11:00'), title: 'one' }, { id: 'e-01', observedAt: at('11:40') }),
      pr(1, { updatedAt: at('11:00'), title: 'two' }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.status, i.reason, i.current]).toEqual(['conflict', 'same-order-key-different-content', null]);
  });

  it('an old tie does not make the item a conflict once a strictly newer revision exists', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00'), title: 'one' }, { id: 'e-01', observedAt: at('10:00') }),
      pr(1, { updatedAt: at('09:00'), title: 'two' }, { id: 'e-02', observedAt: at('10:10') }),
      pr(1, { updatedAt: at('11:00'), title: 'three' }, { id: 'e-03', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect(i.status).toBe('verified');
    expect(i.current?.payload['title']).toBe('three');
  });

  it('Confluence orders by version even when a lower version arrives later', () => {
    const rows = [
      confPage('ENG', '7', { version: 3, lastModified: at('10:00') }, { id: 'e-01', observedAt: at('11:40') }),
      confPage('ENG', '7', { version: 2, lastModified: at('09:00') }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    expect(item(project(rows, request()), 'confluence:ENG#page/7').current?.payload['version']).toBe(3);
  });
});

describe('status signals (D3)', () => {
  it('a row stored stale is never verified', () => {
    const rows = [jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:55'), state: 'stale' })];
    const i = item(project(rows, request()), 'jira:BACK#issue/BACK-1');
    expect([i.status, i.reason]).toEqual(['stale', 'row-state-stale']);
  });

  const seen = () => [
    repo({}, { id: 'e-01', observedAt: at('11:50') }),
    pr(1, { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:50') }),
    ghIssue(4, { updatedAt: at('09:00') }, { id: 'e-03', observedAt: at('11:50') }),
    jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-04', observedAt: at('11:50') }),
    jiraIssue('OPS-1', { updatedAt: at('09:00') }, { id: 'e-05', observedAt: at('11:50') }),
    confPage('ENG', '7', { version: 1, lastModified: at('09:00') }, { id: 'e-06', observedAt: at('11:50') }),
  ];
  const states = (extra: MemoryRow) => {
    const p = project([...seen(), extra], request());
    return Object.fromEntries(p.items.map((i) => [`${i.sourceRef}|${i.kind}`, i.status]));
  };

  it.each([
    ['github root failure', status(GH, REPO, 'error', 'timeout', { id: 'f-1', observedAt: at('11:55') }), [`${REPO}|repository`, `${PR1}|pull_request`, `${REPO}#issue/4|issue`]],
    ['github #pulls failure', status(GH, `${REPO}#pulls`, 'denied', 'forbidden', { id: 'f-1', observedAt: at('11:55') }), [`${PR1}|pull_request`]],
    ['github #issues failure', status(GH, `${REPO}#issues`, 'error', 'malformed', { id: 'f-1', observedAt: at('11:55') }), [`${REPO}#issue/4|issue`]],
    ['github invalid-ref', status(GH, 'github:invalid-ref', 'error', 'invalid_ref', { id: 'f-1', observedAt: at('11:55') }), [`${REPO}|repository`, `${PR1}|pull_request`, `${REPO}#issue/4|issue`]],
    ['jira project failure', status(JIRA, 'jira:BACK', 'error', 'timeout', { id: 'f-1', observedAt: at('11:55') }), ['jira:BACK#issue/BACK-1|jira_issue']],
    ['jira invalid-ref', status(JIRA, 'jira:invalid-ref', 'error', 'invalid_ref', { id: 'f-1', observedAt: at('11:55') }), ['jira:BACK#issue/BACK-1|jira_issue', 'jira:OPS#issue/OPS-1|jira_issue']],
    ['confluence space failure', status(CONF, 'confluence:ENG', 'denied', 'not_visible', { id: 'f-1', observedAt: at('11:55') }), ['confluence:ENG#page/7|confluence_page']],
    ['confluence pages failure', status(CONF, 'confluence:ENG#pages', 'error', 'malformed', { id: 'f-1', observedAt: at('11:55') }), ['confluence:ENG#page/7|confluence_page']],
  ])('%s makes exactly its covered items unknown', (_name, failure, covered) => {
    const result = states(failure);
    for (const [key, s] of Object.entries(result)) expect([key, s]).toEqual([key, covered.includes(key) ? 'unknown' : 'verified']);
  });

  it('carries the failed read\'s reason and ignores a failure older than the item\'s latest read', () => {
    const newer = project([...seen(), status(JIRA, 'jira:BACK', 'error', 'timeout', { id: 'f-1', observedAt: at('11:55') })], request());
    expect(item(newer, 'jira:BACK#issue/BACK-1').reason).toBe('timeout');
    const older = project([...seen(), status(JIRA, 'jira:BACK', 'error', 'timeout', { id: 'f-1', observedAt: at('11:40') })], request());
    expect(item(older, 'jira:BACK#issue/BACK-1').status).toBe('verified');
  });

  it('two repository-level rows in one newer GitHub batch make its items unknown (ambiguous_read)', () => {
    const batch = { observedAt: at('11:55'), receivedAt: at('11:56') };
    const rows = [...seen(), repo({}, { id: 'b-1', ...batch }), status(GH, REPO, 'error', 'timeout', { id: 'b-2', ...batch })];
    const p = project(rows, request());
    expect([item(p, PR1).status, item(p, PR1).reason]).toEqual(['unknown', 'ambiguous_read']);
  });
});

describe('review fixes (S1 independent review)', () => {
  it.each(['unknown', 'denied', 'error'] as const)('a latest row stored %s makes the item unknown, never verified', (state) => {
    const rows = [jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:55'), state })];
    const i = item(project(rows, request()), 'jira:BACK#issue/BACK-1');
    expect([i.status, i.reason]).toEqual(['unknown', `row-state-${state}`]);
  });

  it('a revision whose order key cannot be read makes the item unknown instead of letting an older revision win', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00'), title: 'old' }, { id: 'e-1', observedAt: at('11:40') }),
      pr(1, { updatedAt: 'garbage', title: 'new' }, { id: 'e-2', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.status, i.reason, i.current]).toEqual(['unknown', 'unreadable-order-key', null]);
  });

  it('a later clean read of the scope supersedes an ambiguous batch, as it does a failure', () => {
    const batch = { observedAt: at('11:45'), receivedAt: at('11:46') };
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:40') }),
      repo({}, { id: 'b-1', ...batch }),
      status(GH, REPO, 'error', 'timeout', { id: 'b-2', ...batch }),
      repo({}, { id: 'c-1', observedAt: at('11:55') }),
      listPage('pulls', { id: 'c-2', observedAt: at('11:55') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.status, i.reason]).toEqual(['stale', 'not-in-latest-read']);
  });

  it('a failure newer than the latest scope read still wins', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:40') }),
      listPage('pulls', { id: 'l-1', observedAt: at('11:45') }),
      status(GH, `${REPO}#pulls`, 'error', 'timeout', { id: 'f-1', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.status, i.reason]).toEqual(['unknown', 'timeout']);
  });

  it('a covering failure outranks the retention horizon: unknown, not insufficient-history', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:40') }),
      status(GH, REPO, 'error', 'timeout', { id: 'f-1', observedAt: at('11:50') }),
    ];
    const req = { ...request({ sources: sources({ [GH]: { purgeHorizon: at('10:00') } }) }), effectiveAt: at('09:30') };
    const i = item(project(rows, req), PR1);
    expect([i.status, i.reason, i.current]).toEqual(['unknown', 'timeout', null]);
  });

  it('refuses an unknown provider and an unreadable purge horizon; the TTL is not taken from the caller', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    expect(() => project(rows, request({ sources: sources({ [GH]: { provider: 'gitlab' as never } }) }))).toThrow(RangeError);
    expect(() => project(rows, request({ sources: sources({ [GH]: { purgeHorizon: 'soon' } }) }))).toThrow(RangeError);
    const withTtl = sources().map((s) => ({ ...s, ttlMs: Number.NaN }));
    const stale = item(project(rows, request({ sources: withTtl, evaluationAt: at('23:00') })), PR1);
    expect([stale.status, stale.reason]).toEqual(['stale', 'no-later-read-recorded']);
  });

  it('validateAtRead throws on an invalid request instead of reporting "changed"', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    const first = project(rows, request());
    expect(() => validateAtRead(first, rows, request({ knownAt: 'nope' }))).toThrow(RangeError);
  });
});

describe('read outcomes and absence (D3, correction B)', () => {
  it('GitHub: absent from a later recorded page of its own list is stale not-in-latest-read; another list does not count', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    const otherList = project([...rows, listPage('issues', { id: 'l-1', observedAt: at('11:55') })], request());
    expect(item(otherList, PR1).status).toBe('verified');
    const ownList = project([...rows, listPage('pulls', { id: 'l-1', observedAt: at('11:55') })], request());
    expect([item(ownList, PR1).status, item(ownList, PR1).reason]).toEqual(['stale', 'not-in-latest-read']);
  });

  it('Jira: absent from a later batch with other items of the same project is stale; another project does not count', () => {
    const rows = [jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    const otherProject = project([...rows, jiraIssue('OPS-9', { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:55') })], request());
    expect(item(otherProject, 'jira:BACK#issue/BACK-1').status).toBe('verified');
    const sameProject = project([...rows, jiraIssue('BACK-2', { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:55') })], request());
    const i = item(sameProject, 'jira:BACK#issue/BACK-1');
    expect([i.status, i.reason]).toEqual(['stale', 'not-in-latest-read']);
  });

  it('a later successful read of the scope supersedes an earlier failure: absence, not unknown, decides', () => {
    const rows = [
      pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:45') }),
      status(GH, `${REPO}#pulls`, 'error', 'timeout', { id: 'f-1', observedAt: at('11:50') }),
      listPage('pulls', { id: 'l-1', observedAt: at('11:55') }),
    ];
    const i = item(project(rows, request()), PR1);
    expect([i.status, i.reason]).toEqual(['stale', 'not-in-latest-read']);
  });

  it('Confluence: absent from a later batch with other pages of the same space is stale', () => {
    const rows = [
      confPage('ENG', '7', { version: 1, lastModified: at('09:00') }, { id: 'e-01', observedAt: at('11:50') }),
      confPage('ENG', '8', { version: 1, lastModified: at('09:00') }, { id: 'e-02', observedAt: at('11:55') }),
    ];
    expect(item(project(rows, request()), 'confluence:ENG#page/7').reason).toBe('not-in-latest-read');
  });

  it('an unrecorded read infers nothing: fresh stays verified, and past the TTL it is stale no-later-read-recorded', () => {
    const rows = [jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    expect(item(project(rows, request()), 'jira:BACK#issue/BACK-1').status).toBe('verified');
    const late = item(project(rows, request({ evaluationAt: at('12:30') })), 'jira:BACK#issue/BACK-1');
    expect([late.status, late.reason]).toEqual(['stale', 'no-later-read-recorded']);
  });

  it('the TTL boundary is strict: current only while evaluationAt < lastObservedAt + ttl', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:45') })];
    expect(item(project(rows, request({ evaluationAt: at('11:59', '59') })), PR1).status).toBe('verified');
    expect(item(project(rows, request({ evaluationAt: at('12:00') })), PR1).status).toBe('stale');
  });
});

describe('effective time and bounded history (D3a, correction D)', () => {
  const revisions = (n: number): MemoryRow[] =>
    Array.from({ length: n }, (_, k) => {
      const minute = String(k).padStart(2, '0');
      return pr(1, { updatedAt: at(`09:${minute}`), title: `r${k}` }, { id: `e-${String(k).padStart(3, '0')}`, observedAt: at(`10:${minute}`) });
    });

  it('answers "as effective at E" from the highest order key effective by then; nothing effective is unknown', () => {
    const rows = revisions(5);
    expect(item(project(rows, request({ effectiveAt: at('09:02') })), PR1).current?.payload['title']).toBe('r2');
    const before = item(project(rows, request({ effectiveAt: at('08:00') })), PR1);
    expect([before.status, before.reason, before.current]).toEqual(['unknown', 'no-revision-effective', null]);
  });

  it('the cap bounds only the history list: current, status and runsTotal equal the uncapped answer', () => {
    const rows = revisions(60);
    const capped = item(project(rows, request({ evaluationAt: at('11:05') })), PR1);
    const full = item(project(rows, request({ evaluationAt: at('11:05'), historyCap: 1000 })), PR1);
    expect(capped.history).toHaveLength(50);
    expect(capped.historyInfo).toEqual({ complete: false, runsReturned: 50, runsTotal: 60 });
    expect(full.historyInfo).toEqual({ complete: true, runsReturned: 60, runsTotal: 60 });
    expect([capped.status, capped.current]).toEqual([full.status, full.current]);
  });

  it('a truncated run that holds the answer for E still answers it when the oldest returned run is a lagging read', () => {
    const rows = [
      pr(1, { updatedAt: at('09:20'), title: 'answer' }, { id: 'e-1', observedAt: at('10:00') }),
      pr(1, { updatedAt: at('09:10'), title: 'lagging' }, { id: 'e-2', observedAt: at('10:05') }),
      pr(1, { updatedAt: at('09:40'), title: 'later' }, { id: 'e-3', observedAt: at('10:10') }),
    ];
    const capped = item(project(rows, request({ effectiveAt: at('09:25'), historyCap: 2 })), PR1);
    expect(capped.current?.payload['title']).toBe('answer');
    expect(capped.history.map((r) => r.payload['title'])).toEqual(['lagging', 'later']);
  });

  it('lists the newest runs in chronological order', () => {
    const i = item(project(revisions(60), request({ evaluationAt: at('11:05') })), PR1);
    expect(i.history[0]?.payload['title']).toBe('r10');
    expect(i.history.at(-1)?.payload['title']).toBe('r59');
  });
});

describe('retention horizon (D6)', () => {
  const horizon = (h: string) => request({ sources: sources({ [GH]: { purgeHorizon: h } }) });

  it('with a recorded purge horizon, history is never complete even when nothing is truncated', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    expect(item(project(rows, horizon(at('06:00'))), PR1).historyInfo).toEqual({ complete: false, runsReturned: 1, runsTotal: 1 });
  });

  it('a question reaching before the horizon is insufficient-history with no value', () => {
    const rows = [pr(1, { updatedAt: at('09:00') }, { id: 'e-01', observedAt: at('11:50') })];
    const i = item(project(rows, { ...horizon(at('10:00')), effectiveAt: at('09:30') }), PR1);
    expect([i.status, i.reason, i.current]).toEqual(['insufficient-history', 'before-retention-horizon', null]);
  });

  it('rows kept for citation before the horizon never merge with later runs of the same content', () => {
    const rows = [
      repo({ archived: false }, { id: 'e-01', observedAt: at('05:00') }),
      repo({ archived: false }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const i = item(project(rows, horizon(at('06:00'))), REPO, 'repository');
    expect(i.history.map((r) => [r.firstEvidenceId, r.retainedForCitation])).toEqual([['e-01', true], ['e-02', false]]);
  });
});

describe('determinism, fingerprint and replay (D5)', () => {
  const rows = (): MemoryRow[] => [
    repo({}, { id: 'e-01', observedAt: at('11:00') }),
    pr(1, { updatedAt: at('09:00') }, { id: 'e-02', observedAt: at('11:00') }),
    pr(2, { updatedAt: at('09:00') }, { id: 'e-03', observedAt: at('11:00') }),
    jiraIssue('BACK-1', { updatedAt: at('09:00') }, { id: 'e-04', observedAt: at('11:00') }),
    confPage('ENG', '7', { version: 1, lastModified: at('09:00') }, { id: 'e-05', observedAt: at('11:00') }),
  ];

  it('any input order gives byte-identical output, with items sorted by source, ref and kind', () => {
    const a = project(rows(), request());
    const b = project([...rows()].reverse(), request({ activeGrantIds: ['grant-3', 'grant-1', 'grant-2'] }));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const keys = a.items.map((i) => [i.sourceId, i.sourceRef, i.kind] as const);
    const byFields = (x: readonly string[], y: readonly string[]) => {
      for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k]! < y[k]! ? -1 : 1;
      return 0;
    };
    expect(keys).toEqual([...keys].sort(byFields));
  });

  it('labels replay as best-effort and warns inside the settle margin', () => {
    expect(project(rows(), request()).replay).toBe('best-effort');
    expect(project(rows(), request({ knownAt: at('12:00'), now: at('12:04') })).withinSettleMargin).toBe(true);
    expect(project(rows(), request({ knownAt: at('12:00'), now: at('12:06') })).withinSettleMargin).toBe(false);
  });

  it('the fingerprint changes on a grant change, a new revision, a purge horizon and a same-size swap of rows', () => {
    const fp = project(rows(), request()).fingerprint;
    expect(project(rows(), request({ activeGrantIds: ['grant-1', 'grant-2', 'grant-9'] })).fingerprint).not.toBe(fp);
    const newer = [...rows(), pr(1, { updatedAt: at('10:00'), title: 'edited' }, { id: 'e-06', observedAt: at('11:30') })];
    expect(project(newer, request()).fingerprint).not.toBe(fp);
    expect(project(rows(), request({ sources: sources({ [GH]: { purgeHorizon: at('01:00') } }) })).fingerprint).not.toBe(fp);
    // Revision 1's count + newest-received fingerprint could not tell these apart: same row count, same newest time.
    const swapped = rows().map((r) => (r.id === 'e-03' ? { ...r, id: 'e-99' } : r));
    expect(project(swapped, request()).fingerprint).not.toBe(fp);
  });

  it('the fingerprint changes when an ingest swaps which revision is current, with the same row count', () => {
    const two = (laterTitle: string) => [
      pr(1, { updatedAt: at('09:00'), title: 'a' }, { id: 'e-01', observedAt: at('11:40') }),
      pr(1, { updatedAt: at('09:30'), title: laterTitle }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const a = project(two('b'), request());
    const b = project(two('c'), request());
    expect(item(a, PR1).historyInfo).toEqual(item(b, PR1).historyInfo);
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it('the fingerprint covers older history, not only the current revision and the counts', () => {
    const withHistory = (oldId: string) => [
      pr(1, { updatedAt: at('08:00'), title: 'old' }, { id: oldId, observedAt: at('10:00') }),
      pr(1, { updatedAt: at('09:00'), title: 'now' }, { id: 'e-02', observedAt: at('11:50') }),
    ];
    const a = project(withHistory('e-01'), request());
    const b = project(withHistory('e-98'), request());
    expect(item(b, PR1).current).toEqual(item(a, PR1).current);
    expect(item(b, PR1).historyInfo).toEqual(item(a, PR1).historyInfo);
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it('validateAtRead accepts an unchanged read and detects a late commit inside knownAt', () => {
    const first = project(rows(), request());
    expect(validateAtRead(first, rows(), request())).toBe(true);
    const late = [...rows(), pr(3, { updatedAt: at('09:00') }, { id: 'e-07', observedAt: at('11:10'), receivedAt: at('11:10') })];
    expect(validateAtRead(first, late, request())).toBe(false);
  });

  it('refuses an invalid clock instead of guessing', () => {
    expect(() => project(rows(), request({ knownAt: 'not a time' }))).toThrow(RangeError);
  });
});

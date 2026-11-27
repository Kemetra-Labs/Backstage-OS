// COG-03 S1 (BACK-106): pure retrieval and typed relationships over the COG-02 memory projection,
// specified by docs/planning/BACK-106/cog-03-design.md (R1 to R7). Synthetic data only.
import { canonicalJson } from '../../src/memory/memory.canonical';
import type { MemoryRow } from '../../src/memory/memory.types';
import { normalizeText, tokensOf } from '../../src/retrieval/retrieval.normalize';
import { RETRIEVAL_POLICY_VERSION } from '../../src/retrieval/retrieval.policy';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import type { ItemIdentity } from '../../src/retrieval/retrieval.types';
import { at, CONF, GH, ghIssue, JIRA, pr, REPO } from '../memory/memory.fixture';
import { jira, projectionOf, world, worldRows } from './retrieval.fixture';

const id = (sourceId: string, sourceRef: string, kind: string): ItemIdentity => ({ sourceId, sourceRef, kind });
const PR = (n: number) => id(GH, `${REPO}#pull/${n}`, 'pull_request');
const ISSUE = (n: number) => id(GH, `${REPO}#issue/${n}`, 'issue');
const JI = (key: string) => id(JIRA, `jira:${key.slice(0, key.lastIndexOf('-'))}#issue/${key}`, 'jira_issue');
const PAGE = (pageId: string) => id(CONF, `confluence:ENG#page/${pageId}`, 'confluence_page');
const REPOSITORY = id(GH, REPO, 'repository');
const idsOf = (r: { hits: readonly { identity: ItemIdentity }[] }) => r.hits.map((h) => h.identity);

describe('normalization (R3): search only, never stored', () => {
  it('folds Arabic alef forms, alef maqsura, ta marbuta, diacritics and tatweel', () => {
    expect(normalizeText('أإآٱ')).toBe('اااا');
    expect(normalizeText('مستشفى')).toBe('مستشفي');
    expect(normalizeText('سياسة')).toBe('سياسه');
    expect(normalizeText('تَسْجِيـــل')).toBe('تسجيل');
  });

  it('folds Arabic-Indic and Persian digits and case, and splits on non-letters', () => {
    expect(normalizeText('PR ١٢ ۱۲')).toBe('pr 12 12');
    expect(tokensOf('Fix, login-timeout!')).toEqual(['fix', 'login', 'timeout']);
    expect(tokensOf('!!!')).toEqual([]);
  });
});

describe('identifiers (R2) and identifier-shaped queries (R4)', () => {
  it.each([
    ['BACK-7', JI('BACK-7')],
    ['back-7', JI('BACK-7')],
    ['pr 12', PR(12)],
    ['PR #12', PR(12)],
    ['issue 4', ISSUE(4)],
    ['Kemetra-Labs/Backstage-OS', REPOSITORY],
    ['backstage-os', REPOSITORY],
    [`${REPO}#pull/15`, PR(15)],
  ])('%s is an exact identifier match', (q, expected) => {
    const r = search(world(), q);
    expect(r.outcome).toBe('match');
    expect(r.selected).toEqual(expected);
    expect(r.hits[0]!.tier).toBe('identifier');
  });

  it('a bare number that names a PR and a Confluence page is ambiguous, with both labelled and none selected', () => {
    const r = search(world(), '12');
    expect(r.outcome).toBe('ambiguous');
    expect(r.selected).toBeNull();
    // identity order is (sourceId, sourceRef, kind): the GitHub source sorts before the Confluence one
    expect(idsOf(r)).toEqual([PR(12), PAGE('12')]);
  });

  it('Arabic-Indic digits find the same identifier', () => {
    expect(search(world(), 'PR ١٢').selected).toEqual(PR(12));
  });

  // `login-7` is key-shaped and both its words are in PR 12's title: a fuzzy match would pick it.
  it.each(['BACK-99', '#99', '99', 'pr 99', 'nobody/nothing', 'login-7'])('an identifier-shaped query with no exact item, %s, is no-match, never fuzzy', (q) => {
    const r = search(world(), q);
    expect(r).toMatchObject({ outcome: 'no-match', selected: null, hits: [], totalMatches: 0 });
  });

  it('native identifiers and titles are returned as stored, not normalized', () => {
    const hit = search(world(), 'إصلاح').hits[0]!;
    expect(hit.title).toBe('إصلاح تسجيل الدخول');
  });
});

describe('lexical search, ranking and abstention (R4)', () => {
  it('every term must match; a title match outranks a match that needs identifier tokens', () => {
    const r = search(world(), 'login');
    expect(r.outcome).toBe('ambiguous');
    expect(r.hits.every((h) => h.tier === 'title')).toBe(true);
    // fewer title tokens first, then identity order
    expect(r.hits.map((h) => h.title)).toEqual([
      'Login runbook',
      'Login page is slow',
      'Fix login timeout for BACK-7',
      'Refactor login and session handling, follows #12',
    ]);
  });

  it('a single best match is a match', () => {
    const r = search(world(), 'session timeout policy');
    expect(r.outcome).toBe('match');
    expect(r.selected).toEqual(JI('BACK-7'));
  });

  it('the any tier joins title and identifier tokens', () => {
    const r = search(world(), 'runbook 12');
    expect(r.outcome).toBe('match');
    expect(r.selected).toEqual(PAGE('12'));
    expect(r.hits[0]!.tier).toBe('any');
  });

  it('Arabic search folds spelling variants in the query and the title', () => {
    expect(search(world(), 'اصلاح تسجيل').selected).toEqual(PR(15));
    expect(search(world(), 'سياسه الجلسه').selected).toEqual(JI('BACK-8'));
  });

  it('no partial matching: one missing term gives no-match', () => {
    expect(search(world(), 'login banana').outcome).toBe('no-match');
  });

  it('results are bounded, with the total and a truncation flag', () => {
    const r = search(world(), 'login', { limit: 2 });
    expect(r.hits).toHaveLength(2);
    expect(r.totalMatches).toBe(4);
    expect(r.truncated).toBe(true);
    expect(search(world(), 'login').truncated).toBe(false);
  });

  it.each([
    ['', {}],
    ['   ', {}],
    ['x'.repeat(501), {}],
    [Array.from({ length: 33 }, (_, i) => `w${i}`).join(' '), {}],
    ['login', { limit: 0 }],
    ['login', { limit: 51 }],
    ['login', { limit: 2.5 }],
  ])('invalid query or limit gives invalid-query with nothing returned (%#)', (q, opts) => {
    expect(search(world(), q, opts)).toMatchObject({ outcome: 'invalid-query', selected: null, hits: [], totalMatches: 0 });
  });

  it('a non-string query is invalid-query', () => {
    expect(search(world(), 42 as unknown as string).outcome).toBe('invalid-query');
  });
});

describe('what a result carries (R5)', () => {
  it('evidence ids, revision, freshness and versions', () => {
    const p = world();
    const r = search(p, 'BACK-7');
    const item = p.items.find((i) => i.sourceRef === JI('BACK-7').sourceRef)!;
    expect(r.hits[0]).toMatchObject({
      identity: JI('BACK-7'),
      kind: 'jira_issue',
      status: 'verified',
      reason: null,
      matchedOn: 'identifier',
      revision: item.current!.contentKey,
      evidence: ['j7'],
      lastObservedAt: at('11:55'),
    });
    expect(r).toMatchObject({ fingerprint: p.fingerprint, policyVersion: p.policyVersion, retrievalPolicyVersion: RETRIEVAL_POLICY_VERSION });
  });

  it('stale status passes through, never upgraded, and does not change the order', () => {
    const late = projectionOf(worldRows(), at('12:30'));
    const r = search(late, 'login');
    expect(r.hits.every((h) => h.status === 'stale')).toBe(true);
    expect(r.hits.map((h) => h.identity)).toEqual(search(world(), 'login').hits.map((h) => h.identity));
  });

  it('a conflicting item is found by its newest text, with status conflict and no revision', () => {
    const rows: MemoryRow[] = [
      ghIssue(9, { updatedAt: at('11:40'), title: 'alpha report' }, { id: 'k1', observedAt: at('11:45') }),
      ghIssue(9, { updatedAt: at('11:40'), title: 'beta report' }, { id: 'k2', observedAt: at('11:50') }),
    ];
    const r = search(projectionOf(rows), 'issue 9');
    expect(r.hits[0]).toMatchObject({ status: 'conflict', revision: null, title: 'beta report', evidence: ['k2'] });
  });
});

describe('typed relationships (R6)', () => {
  it('the repository contains its PRs and issues', () => {
    const edges = relationships(world()).edges.filter((e) => e.type === 'contains');
    expect(edges.map((e) => e.to)).toEqual([ISSUE(4), PR(12), PR(15), PR(16), PR(20)]);
    expect(edges.every((e) => canonicalJson(e.from) === canonicalJson(REPOSITORY))).toBe(true);
    expect(edges[0]!.evidence).toEqual(['i4', 'r1']);
  });

  it('a title mentioning a visible Jira key or a same-repository #n is a mentions edge with both items\' evidence', () => {
    const mentions = relationships(world()).edges.filter((e) => e.type === 'mentions');
    expect(mentions.map((e) => [e.from.sourceRef, e.to.sourceRef, e.text])).toEqual([
      [PR(12).sourceRef, JI('BACK-7').sourceRef, 'BACK-7'],
      [PR(16).sourceRef, PR(12).sourceRef, '#12'],
      [PR(20).sourceRef, JI('BACK-7').sourceRef, 'BACK-7'],
    ]);
    expect(mentions[0]!.evidence).toEqual(['j7', 'p12']);
  });

  it('a key with no visible item is an unresolved mention, with no target and only the mentioning item\'s evidence', () => {
    const { unresolved } = relationships(world());
    expect(unresolved).toEqual([
      { type: 'mentions', from: PR(20), text: 'BACK-404', target: null, status: 'unresolved', evidence: ['p20'] },
      { type: 'mentions', from: PR(20), text: 'ISO-9001', target: null, status: 'unresolved', evidence: ['p20'] },
    ]);
  });

  it('hidden and nonexistent targets give identical relationships from the mentioning items (no existence leak)', () => {
    // Hidden: the Jira source is not visible to the reader, so its rows never reach the projection.
    const hidden = relationships(projectionOf(worldRows().filter((r) => r.sourceId !== JIRA)));
    // Nonexistent: the Jira source is visible, but BACK-7 never existed in it.
    const nonexistent = relationships(projectionOf(worldRows().filter((r) => !r.sourceRef.endsWith('#issue/BACK-7'))));
    const fromGithub = (r: typeof hidden) => canonicalJson({
      edges: r.edges.filter((e) => e.from.sourceId === GH),
      unresolved: r.unresolved.filter((u) => u.from.sourceId === GH),
    });
    expect(fromGithub(hidden)).toBe(fromGithub(nonexistent));
    expect(hidden.unresolved.map((u) => [u.from.sourceRef, u.text])).toEqual([
      [PR(12).sourceRef, 'BACK-7'],
      [PR(20).sourceRef, 'BACK-404'],
      [PR(20).sourceRef, 'BACK-7'],
      [PR(20).sourceRef, 'ISO-9001'],
    ]);
  });

  it('a search for a hidden key equals a search for a nonexistent key', () => {
    const hidden = projectionOf(worldRows().filter((r) => r.sourceId !== JIRA));
    const strip = (r: ReturnType<typeof search>) => ({ ...r, fingerprint: '' });
    expect(strip(search(hidden, 'BACK-7'))).toEqual(strip(search(hidden, 'BACK-77')));
  });

  it('a self-mention is dropped', () => {
    const rows = [jira('BACK-5', 'BACK-5 follow-up', 'j5')];
    expect(relationships(projectionOf(rows))).toEqual({ edges: [], unresolved: [] });
  });
});

describe('traversal (R6)', () => {
  it('breadth-first in both directions, with depth and the edge that reached each node', () => {
    const t = related(world(), PR(16), { depth: 2 });
    expect(t.outcome).toBe('found');
    expect(t.nodes.map((n) => [n.identity.sourceRef, n.depth])).toEqual([
      [PR(16).sourceRef, 0],
      [REPO, 1],
      [PR(12).sourceRef, 1],
      [ISSUE(4).sourceRef, 2],
      [PR(15).sourceRef, 2],
      [PR(20).sourceRef, 2],
      [JI('BACK-7').sourceRef, 2],
    ]);
    expect(t.nodes[0]!.via).toBeNull();
    expect(t.nodes[2]!.via).toMatchObject({ type: 'mentions', text: '#12' });
    expect(t.truncated).toBe(false);
  });

  it('depth 1 stops at neighbours', () => {
    expect(related(world(), PR(16), { depth: 1 }).nodes).toHaveLength(3);
  });

  it('maxNodes bounds the walk and sets truncated', () => {
    const t = related(world(), PR(16), { depth: 3, maxNodes: 3 });
    expect(t.nodes).toHaveLength(3);
    expect(t.truncated).toBe(true);
  });

  it('cycles terminate', () => {
    const rows = [jira('OPS-1', 'see OPS-2', 'o1'), jira('OPS-2', 'see OPS-1', 'o2')];
    const t = related(projectionOf(rows), JI('OPS-1'), { depth: 3 });
    expect(t.nodes.map((n) => n.identity.sourceRef)).toEqual([JI('OPS-1').sourceRef, JI('OPS-2').sourceRef]);
  });

  it('carries the unresolved mentions of the visited nodes', () => {
    expect(related(world(), PR(20), { depth: 1 }).unresolved.map((u) => u.text)).toEqual(['BACK-404', 'ISO-9001']);
  });

  it('an unknown start is not-found, the same for hidden and nonexistent items', () => {
    const hidden = related(projectionOf(worldRows().filter((r) => r.sourceId !== JIRA)), JI('BACK-7'));
    const nonexistent = related(world(), JI('BACK-999'));
    expect(hidden).toEqual({ outcome: 'not-found', nodes: [], unresolved: [], truncated: false });
    expect(nonexistent).toEqual(hidden);
  });

  it.each([{ depth: 0 }, { depth: 4 }, { maxNodes: 0 }, { maxNodes: 51 }, { depth: 1.5 }])('out-of-bounds options are invalid-request (%o)', (opts) => {
    expect(related(world(), PR(16), opts)).toEqual({ outcome: 'invalid-request', nodes: [], unresolved: [], truncated: false });
  });
});

describe('determinism (R7)', () => {
  it('row order changes nothing in search, relationships or traversal', () => {
    const shuffled = projectionOf([...worldRows()].reverse());
    for (const q of ['login', '12', 'BACK-7', 'اصلاح']) expect(canonicalJson(search(shuffled, q))).toBe(canonicalJson(search(world(), q)));
    expect(canonicalJson(relationships(shuffled))).toBe(canonicalJson(relationships(world())));
    expect(canonicalJson(related(shuffled, PR(16)))).toBe(canonicalJson(related(world(), PR(16))));
  });

  it('a #n mention in a non-GitHub item is not resolved against GitHub', () => {
    const rows = [...worldRows(), jira('BACK-9', 'compare with #12', 'j9')];
    const fromJira = relationships(projectionOf(rows)).edges.filter((e) => e.from.sourceRef === JI('BACK-9').sourceRef);
    expect(fromJira).toEqual([]);
  });

  it('a PR of another repository does not resolve #n', () => {
    const other = { ...pr(30, { title: 'see #12', updatedAt: at('11:00') }, { id: 'x30', observedAt: at('11:55') }), sourceRef: 'github:other/repo#pull/30' };
    const edges = relationships(projectionOf([...worldRows(), other])).edges.filter((e) => e.from.sourceRef === other.sourceRef && e.type === 'mentions');
    expect(edges).toEqual([]);
  });
});

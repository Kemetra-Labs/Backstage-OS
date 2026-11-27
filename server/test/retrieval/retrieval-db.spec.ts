// COG-03 S2 (BACK-106): retrieval over the real COG-02 memory read, against a disposable PostgreSQL.
// Proves that grants decide what retrieval can find or link: a revoked source's items vanish from
// search, relationships and traversal; a mention of a hidden item is the same unresolved marker as a
// mention of a nonexistent one; and rows added to a hidden source change no output (counts, ranks,
// edges, fingerprint). Synthetic data only. Needs Docker (testcontainers), like every *-db spec.
import { canonicalJson } from '../../src/memory/memory.canonical';
import { MemoryRepository, type MemoryReadInput } from '../../src/memory/memory.repository';
import type { MemoryProjection, MemoryRow } from '../../src/memory/memory.types';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { freshIds, startStore, stopStore, type StoreHarness } from '../db/store-harness';
import { at, GH, JIRA, pr, repo, REPO } from '../memory/memory.fixture';
import { jira } from './retrieval.fixture';

let h: StoreHarness;
let memory: MemoryRepository;
const ids = freshIds();
let jiraSource = '';
const JIRA_REF = 'kemetra-synthetic.atlassian.net';

const o = (id: string, observedAt = at('11:55')) => ({ id, observedAt });

async function ingest(sourceId: string, rows: readonly MemoryRow[]): Promise<void> {
  await h.repo.ingest(
    ids.ws,
    rows.map((r) => ({ sourceId, type: 'Observation' as const, state: r.state, sourceRef: r.sourceRef, observedAt: new Date(r.observedAt), payload: { ...r.payload } })),
  );
}

beforeAll(async () => {
  h = await startStore(ids, { provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  memory = new MemoryRepository(h.db.app);
  jiraSource = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: JIRA_REF });
  await ingest(h.sourceId, [
    repo({}, o('r1')),
    pr(12, { title: 'Fix login timeout for BACK-7', updatedAt: at('11:00') }, o('p12')),
    pr(20, { title: 'Prepare BACK-404 rollout', updatedAt: at('11:01') }, o('p20')),
  ]);
  await ingest(jiraSource, [jira('BACK-7', 'Session timeout policy', 'j7')]);
}, 240_000);

afterAll(async () => {
  await stopStore(h);
}, 60_000);

/** One fixed known time for every read: the fingerprint covers the clocks (COG-02 D5). */
const KNOWN_AT = new Date(Date.now() + 86_400_000);

const query = (over: Partial<MemoryReadInput> = {}): MemoryReadInput => ({
  workspaceId: ids.ws,
  userId: ids.owner,
  projectId: h.projectId,
  effectiveAt: new Date(at('12:00')),
  knownAt: KNOWN_AT,
  evaluationAt: new Date(at('12:00')),
  ...over,
});

const PR12_REF = `${REPO}#pull/12`;
const BACK7_REF = 'jira:BACK#issue/BACK-7';

/** Everything retrieval can say about the GitHub items, as one canonical string. */
function outputs(p: MemoryProjection): string {
  const pr12 = p.items.find((i) => i.sourceRef === PR12_REF)!;
  return canonicalJson({
    searches: ['BACK-7', 'BACK-404', 'BACK-77', 'login', 'timeout policy', 'rollout'].map((q) => search(p, q)),
    relationships: relationships(p),
    related: related(p, { sourceId: pr12.sourceId, sourceRef: pr12.sourceRef, kind: pr12.kind }, { depth: 3 }),
  });
}

describe('retrieval follows the reader\'s grants (R1, R6)', () => {
  it('with the Jira grant, the PR resolves its mention and both items are found', async () => {
    const p = await memory.read(query());
    expect(search(p, 'BACK-7').outcome).toBe('match');
    const mentions = relationships(p).edges.filter((e) => e.type === 'mentions');
    expect(mentions.map((e) => [e.from.sourceRef, e.to.sourceRef])).toEqual([[PR12_REF, BACK7_REF]]);
    expect(relationships(p).unresolved.map((u) => u.text)).toEqual(['BACK-404']);
  });

  it('revoking the grant removes the Jira item from search, links and traversal, with no trace of it', async () => {
    await h.repo.disconnectSource(ids.ws, ids.owner, jiraSource);
    try {
      const p = await memory.read(query());
      const hidden = search(p, 'BACK-7');
      expect(hidden).toEqual(search(p, 'BACK-77')); // same fingerprint, same empty answer
      expect(hidden).toMatchObject({ outcome: 'no-match', totalMatches: 0 });
      expect(search(p, 'timeout policy').outcome).toBe('no-match');
      expect(relationships(p).edges.some((e) => e.to.sourceId === jiraSource || e.from.sourceId === jiraSource)).toBe(false);
      expect(relationships(p).unresolved.map((u) => [u.from.sourceRef, u.text])).toEqual([
        [PR12_REF, 'BACK-7'],
        [`${REPO}#pull/20`, 'BACK-404'],
      ]);
      expect(related(p, { sourceId: jiraSource, sourceRef: BACK7_REF, kind: 'jira_issue' }).outcome).toBe('not-found');
    } finally {
      await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: JIRA_REF });
    }
  });

  it('rows added to a hidden source change no retrieval output, fingerprint included (noninterference)', async () => {
    await h.repo.disconnectSource(ids.ws, ids.owner, jiraSource);
    const before = outputs(await memory.read(query()));
    // Make BACK-404 exist and change BACK-7, while the source stays hidden from the reader.
    await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: JIRA_REF });
    await ingest(jiraSource, [jira('BACK-404', 'Rollout checklist', 'j404'), jira('BACK-7', 'Session timeout policy v2', 'j7b', at('11:30'))]);
    await h.repo.disconnectSource(ids.ws, ids.owner, jiraSource);
    try {
      expect(outputs(await memory.read(query()))).toBe(before);
    } finally {
      await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: JIRA_REF });
    }
  });

  it('after re-granting, the newly visible items resolve both mentions', async () => {
    const p = await memory.read(query());
    const mentions = relationships(p).edges.filter((e) => e.type === 'mentions').map((e) => [e.from.sourceRef, e.to.sourceRef]);
    expect(mentions).toEqual([
      [PR12_REF, BACK7_REF],
      [`${REPO}#pull/20`, 'jira:BACK#issue/BACK-404'],
    ]);
    expect(relationships(p).unresolved).toEqual([]);
  });

  it('another workspace and a reader without grants find nothing', async () => {
    for (const q of [query({ workspaceId: ids.otherWs }), query({ userId: ids.stranger })]) {
      const p = await memory.read(q);
      expect(search(p, 'login')).toMatchObject({ outcome: 'no-match', totalMatches: 0 });
      expect(relationships(p)).toEqual({ edges: [], unresolved: [] });
    }
  });
});

// Keep the fixture source ids referenced so a rename in memory.fixture fails loudly here too.
void GH;
void JIRA;

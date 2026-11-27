// COG-04 S2 (BACK-107): reasoning over the real COG-02 memory read, against a disposable PostgreSQL.
// A dependency in a second Jira source: with its grant the task is ready; revoked, the task is unknown
// with a generic missing fact identical to a nonexistent dependency; rows added to the hidden source
// change nothing; the independent validator accepts every evaluator result. Needs Docker.
import { canonicalJson } from '../../src/memory/memory.canonical';
import { MemoryRepository, type MemoryReadInput } from '../../src/memory/memory.repository';
import type { MemoryRow } from '../../src/memory/memory.types';
import { evaluate } from '../../src/reasoning/reasoning.evaluator';
import type { ReasoningInput } from '../../src/reasoning/reasoning.types';
import { validateResult } from '../../src/reasoning/reasoning.validator';
import { freshIds, startStore, stopStore, type StoreHarness } from '../db/store-harness';
import { at, jiraIssue, pr, REPO } from '../memory/memory.fixture';

let h: StoreHarness;
let memory: MemoryRepository;
const ids = freshIds();
let teamJira = '';
let opsJira = '';
const OPS_REF = 'ops-synthetic.atlassian.net';
const KNOWN_AT = new Date(Date.now() + 86_400_000);
const o = (id: string, observedAt = at('11:55')) => ({ id, observedAt });

async function ingest(sourceId: string, rows: readonly MemoryRow[]): Promise<void> {
  await h.repo.ingest(ids.ws, rows.map((r) => ({ sourceId, type: 'Observation' as const, state: r.state, sourceRef: r.sourceRef, observedAt: new Date(r.observedAt), payload: { ...r.payload } })));
}

beforeAll(async () => {
  h = await startStore(ids, { provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  memory = new MemoryRepository(h.db.app);
  teamJira = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: 'team-synthetic.atlassian.net' });
  opsJira = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: OPS_REF });
  await ingest(h.sourceId, [pr(13, { state: 'closed', updatedAt: at('11:00') }, o('p13'))]);
  await ingest(teamJira, [jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, o('j1'))]);
  await ingest(opsJira, [jiraIssue('OPS-2', { updatedAt: at('11:00'), statusCategory: 'done' }, o('o2'))]);
}, 240_000);

afterAll(async () => {
  await stopStore(h);
}, 60_000);

const query = (over: Partial<MemoryReadInput> = {}): MemoryReadInput => ({
  workspaceId: ids.ws,
  userId: ids.owner,
  projectId: h.projectId,
  effectiveAt: new Date(at('12:00')),
  knownAt: KNOWN_AT,
  evaluationAt: new Date(at('12:00')),
  ...over,
});

const spec = (depKey: string): ReasoningInput => ({
  specVersion: 'db-spec-1',
  tasks: [
    {
      id: 'T1',
      task: { sourceId: teamJira, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' },
      requirements: [
        { id: 'dep', kind: 'dependency', target: { sourceId: opsJira, sourceRef: `jira:OPS#issue/${depKey}`, kind: 'jira_issue' }, expected: 'complete' },
        { id: 'pr', kind: 'check', target: { sourceId: h.sourceId, sourceRef: `${REPO}#pull/13`, kind: 'pull_request' }, expected: 'closed' },
      ],
    },
  ],
});

async function withOpsRevoked<T>(f: () => Promise<T>): Promise<T> {
  await h.repo.disconnectSource(ids.ws, ids.owner, opsJira);
  try {
    return await f();
  } finally {
    await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: OPS_REF });
  }
}

describe('reasoning follows the reader\'s grants (T2, T6)', () => {
  it('with every grant, the task is ready and the validator agrees', async () => {
    const p = await memory.read(query());
    const r = evaluate(p, spec('OPS-2'));
    expect(r).toMatchObject({ kind: 'recommended', selected: 'T1' });
    expect(validateResult(p, spec('OPS-2'), r)).toBe(true);
  });

  it('revoking the dependency\'s source makes the task unknown, identical to a nonexistent dependency, with no trace', async () => {
    await withOpsRevoked(async () => {
      const p = await memory.read(query());
      const hidden = evaluate(p, spec('OPS-2'));
      const nonexistent = evaluate(p, spec('OPS-99'));
      expect(hidden.tasks).toEqual(nonexistent.tasks);
      expect(hidden).toMatchObject({ kind: 'insufficient-evidence', selected: null });
      expect(hidden.tasks[0]!.reasons.find((x) => x.requirement === 'dep')).toEqual({ code: 'dependency-missing', requirement: 'dep', evidence: [] });
      expect(JSON.stringify(hidden)).not.toMatch(/OPS-2|o2/);
      expect(validateResult(p, spec('OPS-2'), hidden)).toBe(true);
    });
  });

  it('rows added to the hidden source change no result (noninterference)', async () => {
    const before = await withOpsRevoked(async () => canonicalJson(evaluate(await memory.read(query()), spec('OPS-2'))));
    await ingest(opsJira, [jiraIssue('OPS-2', { updatedAt: at('11:30'), statusCategory: 'indeterminate' }, o('o2b')), jiraIssue('OPS-3', { updatedAt: at('11:00') }, o('o3'))]);
    const after = await withOpsRevoked(async () => canonicalJson(evaluate(await memory.read(query()), spec('OPS-2'))));
    expect(after).toBe(before);
  });

  it('a reader in another workspace gets no task, and the validator agrees', async () => {
    const p = await memory.read(query({ workspaceId: ids.otherWs }));
    const r = evaluate(p, spec('OPS-2'));
    expect(r.tasks[0]).toMatchObject({ task: null, state: 'unknown' });
    expect(validateResult(p, spec('OPS-2'), r)).toBe(true);
  });
});

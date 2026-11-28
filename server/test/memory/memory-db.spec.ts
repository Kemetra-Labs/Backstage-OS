// COG-02 S2 (BACK-105): the memory read against a real, disposable PostgreSQL. Proves the single S2
// statement equals the S1 reference (collapse + projector), one statement per read, grants and
// revocation, workspace isolation, hidden-record noninterference, knownAt, the documented late-commit
// limit and idempotent ingest. Synthetic data only. Needs Docker (testcontainers), like every *-db spec.
import pg from 'pg';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import type { ObservationInput } from '../../src/evidence/evidence.repository';
import { canonicalCollapsed, collapse } from '../../src/memory/memory.collapse';
import { project } from '../../src/memory/memory.projector';
import { MemoryReadBudgetExceeded, MemoryRepository, type MemoryReadInput } from '../../src/memory/memory.repository';
import { ITEM_KIND_LIST, MEMORY_READ_SQL } from '../../src/memory/memory.sql';
import type { MemoryRequest, MemoryRow } from '../../src/memory/memory.types';
import { freshIds, reconnect, startStore, stopStore, type StoreHarness } from '../db/store-harness';
import { at, CONF, confPage, GH, ghIssue, JIRA, jiraIssue, listPage, pr, repo, REPO, status } from './memory.fixture';

let h: StoreHarness;
let memory: MemoryRepository;
const ids = freshIds();
const src: Record<string, string> = {};

beforeAll(async () => {
  h = await startStore(ids, { provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  memory = new MemoryRepository(h.db.app);
  src[GH] = h.sourceId;
  src[JIRA] = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'jira', externalRef: 'kemetra-synthetic.atlassian.net' });
  src[CONF] = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'confluence', externalRef: 'kemetra-synthetic.atlassian.net' });
  await ingestBatches(story());
}, 240_000);

afterAll(async () => {
  await stopStore(h);
}, 60_000);

/** Fixture rows to ingest, in batches by observed time: one ingest transaction per batch. */
function story(): MemoryRow[] {
  const o = (id: string, observedAt: string, state?: 'ok' | 'stale' | 'error' | 'denied') => ({ id, observedAt, ...(state ? { state } : {}) });
  return [
    repo({ archived: false }, o('a1', at('09:00'))),
    pr(1, { updatedAt: at('08:00'), title: 'A' }, o('a2', at('09:00'))),
    ghIssue(4, { updatedAt: at('08:00') }, o('a3', at('09:00'))),
    listPage('pulls', o('a4', at('09:00'))),
    listPage('issues', o('a5', at('09:00'))),
    jiraIssue('BACK-1', { updatedAt: at('08:00') }, o('a6', at('09:00'))),
    jiraIssue('BACK-2', { updatedAt: at('08:00') }, o('a7', at('09:00'))),
    confPage('ENG', '7', { version: 1, lastModified: at('08:00') }, o('a8', at('09:00'))),
    // 10:00: PR 1 edited (B); repo archived; BACK-1 stored stale; BACK-2 not listed; page 7 v3
    repo({ archived: true }, o('b1', at('10:00'))),
    pr(1, { updatedAt: at('09:30'), title: 'B' }, o('b2', at('10:00'))),
    listPage('pulls', o('b3', at('10:00'))),
    jiraIssue('BACK-1', { updatedAt: at('08:00') }, o('b4', at('10:00'), 'stale')),
    confPage('ENG', '7', { version: 3, lastModified: at('09:40') }, o('b5', at('10:00'))),
    // 11:00: a lagging read of PR 1's old revision A; page 7 v2 arrives late; repo back to A
    repo({ archived: false }, o('c1', at('11:00'))),
    pr(1, { updatedAt: at('08:00'), title: 'A' }, o('c2', at('11:00'))),
    confPage('ENG', '7', { version: 2, lastModified: at('09:10') }, o('c3', at('11:00'))),
    // A page in another space with no covering failure: stale by TTL at 12:00.
    confPage('OPS', '9', { version: 1, lastModified: at('08:00') }, o('c5', at('11:00'))),
    status(JIRA, 'jira:BACK', 'error', 'timeout', o('c4', at('11:00'))),
    // 11:30: ambiguous GitHub batch (repository record and a root failure in one transaction)
    repo({ archived: false }, o('d1', at('11:30'))),
    status(GH, REPO, 'error', 'timeout', o('d2', at('11:30'))),
    // 11:45: same-second conflict on issue 4; a Confluence pages failure
    ghIssue(4, { updatedAt: at('11:40'), title: 'x' }, o('e1', at('11:45'))),
    status(CONF, 'confluence:ENG#pages', 'error', 'malformed', o('e2', at('11:45'))),
    // 11:50: the other side of the conflict, arriving in the next poll
    ghIssue(4, { updatedAt: at('11:40'), title: 'y' }, o('f1', at('11:50'))),
  ];
}

const toInput = (r: MemoryRow): ObservationInput => ({
  sourceId: src[r.sourceId]!,
  type: 'Observation',
  state: r.state,
  sourceRef: r.sourceRef,
  observedAt: new Date(r.observedAt),
  payload: { ...r.payload },
});

async function ingestBatches(rows: readonly MemoryRow[]): Promise<string[]> {
  const byTime = new Map<string, MemoryRow[]>();
  for (const r of rows) byTime.set(r.observedAt, [...(byTime.get(r.observedAt) ?? []), r]);
  const out: string[] = [];
  for (const batch of [...byTime.values()]) {
    // Group per source: ingest() is per call, and one observer run covers one source.
    const perSource = new Map<string, MemoryRow[]>();
    for (const r of batch) perSource.set(r.sourceId, [...(perSource.get(r.sourceId) ?? []), r]);
    for (const group of perSource.values()) out.push(...(await h.repo.ingest(ids.ws, group.map(toInput))));
  }
  return out;
}

/** Every evidence row of the reader's visible sources, as the S1 projector would receive them. */
async function rawRows(sourceIds: readonly string[]): Promise<MemoryRow[]> {
  return runWithWorkspaceContext(h.db.app, ids.ws, async (c) => {
    const { rows } = await c.query<{ id: string; source_id: string; type: string; state: MemoryRow['state']; source_ref: string; obs: Date; rcv: Date; payload: Record<string, unknown> }>(
      `SELECT id, source_id, type, state, source_ref, date_trunc('milliseconds', observed_at) AS obs,
              date_trunc('milliseconds', received_at) AS rcv, payload
         FROM evidence WHERE source_id = ANY($1::uuid[])`,
      [sourceIds],
    );
    return rows.map((r) => ({ id: r.id, sourceId: r.source_id, type: r.type, state: r.state, sourceRef: r.source_ref, observedAt: r.obs.toISOString(), receivedAt: r.rcv.toISOString(), payload: r.payload }));
  });
}

const query = (over: Partial<MemoryReadInput> = {}): MemoryReadInput => ({
  workspaceId: ids.ws,
  userId: ids.owner,
  projectId: h.projectId,
  effectiveAt: new Date(at('12:00')),
  evaluationAt: new Date(at('12:00')),
  ...over,
});

async function referenceFor(q: MemoryReadInput): Promise<{ req: MemoryRequest; rows: MemoryRow[] }> {
  const read = await memory.readCollapsed(q);
  const req: MemoryRequest = {
    effectiveAt: q.effectiveAt!.toISOString(),
    knownAt: read.knownAt,
    evaluationAt: q.evaluationAt!.toISOString(),
    now: read.now,
    activeGrantIds: read.activeGrantIds,
    sources: read.sources,
    ...(q.historyCap === undefined ? {} : { historyCap: q.historyCap }),
  };
  return { req, rows: await rawRows(read.sources.map((s) => s.sourceId)) };
}

describe('S2 statement equals the S1 reference (differential)', () => {
  it.each([
    ['current', {}],
    ['as known before any ingest (empty on both sides)', { knownAt: new Date(Date.now() - 365 * 86_400_000) }],
    ['under a purge horizon', 'horizon'],
    ['with a history cap of 1', { historyCap: 1 }],
  ] as const)('%s: collapsed records and the projection match', async (_name, over) => {
    const extra: Partial<MemoryReadInput> = over === 'horizon' ? { purgeHorizons: new Map([[src[GH]!, new Date(at('10:30'))]]) } : over;
    // One explicit knownAt for both sides: a defaulted knownAt is each call's own database now().
    const q = query({ knownAt: new Date(Date.now() + 86_400_000), ...extra });
    const sql = await memory.readCollapsed(q);
    const { req, rows } = await referenceFor(q);
    expect(canonicalCollapsed(sql.input)).toEqual(canonicalCollapsed(collapse(rows, req)));
    const read = await memory.read(q);
    const reference = project(rows, req);
    expect({ ...read, items: read.items }).toEqual({ ...reference, items: reference.items });
    expect(read.fingerprint).toBe(reference.fingerprint);
  });

  it('the fixture exercises every marker role and status the projector knows', async () => {
    const sql = await memory.readCollapsed(query());
    expect([...new Set(sql.input.markers.map((m) => m.role))].sort()).toEqual(['ambiguous', 'failure', 'list_page', 'scope_item']);
    const statuses = new Set((await memory.read(query())).items.map((i) => i.status));
    for (const s of ['unknown', 'stale', 'conflict']) expect([s, statuses.has(s as never)]).toEqual([s, true]);
  });
});

describe('one statement, one snapshot (D3)', () => {
  // The second SELECT is set_config('statement_timeout', ..., true) for the work budget: it reads no table,
  // so the data still comes from one statement and one snapshot.
  it('a read runs exactly one data statement inside its workspace transaction', async () => {
    const seen: string[] = [];
    const counting = {
      connect: async () => {
        const client = await h.db.app.connect();
        const original = client.query.bind(client);
        const release = client.release.bind(client);
        Object.assign(client, {
          query: (...args: Parameters<pg.PoolClient['query']>) => {
            const text = args[0];
            seen.push(typeof text === 'string' ? text.trim().split(/\s+/)[0]!.toUpperCase() : 'CONFIG');
            return (original as (...a: unknown[]) => unknown)(...args);
          },
          release: (err?: Error | boolean) => {
            Object.assign(client, { query: original, release });
            return release(err);
          },
        });
        return client;
      },
    } as unknown as pg.Pool;
    await new MemoryRepository(counting, { budgetMs: 30_000 }).read(query());
    expect(seen).toEqual(['BEGIN', 'SELECT', 'SELECT', 'WITH', 'COMMIT', 'RESET']);
  });
});

describe('grants, revocation and isolation (D4)', () => {
  it('revoking a grant removes the source on the next read and changes the fingerprint; re-granting changes it again', async () => {
    const before = await memory.read(query());
    await h.repo.disconnectSource(ids.ws, ids.owner, src[JIRA]!);
    const revoked = await memory.read(query());
    expect(revoked.items.some((i) => i.sourceId === src[JIRA])).toBe(false);
    expect(revoked.fingerprint).not.toBe(before.fingerprint);
    await reconnect(h, ids.owner, src[JIRA]!);
    const regranted = await memory.read(query());
    expect(regranted.items.filter((i) => i.sourceId === src[JIRA]).length).toBeGreaterThan(0);
    expect(regranted.fingerprint).not.toBe(before.fingerprint);
    expect(regranted.items).toEqual(before.items);
  });

  it('another workspace and a reader without grants see nothing', async () => {
    expect((await memory.read(query({ workspaceId: ids.otherWs }))).items).toEqual([]);
    expect((await memory.read(query({ userId: ids.stranger }))).items).toEqual([]);
  });

  it('rows of a source hidden from the reader change nothing, counts and completeness included', async () => {
    const q = query({ knownAt: new Date(Date.now() + 86_400_000) });
    const hidden = await h.repo.connectSource(ids.ws, ids.owner, { projectId: h.projectId, provider: 'github', externalRef: 'kemetra-labs/hidden-repo' });
    await h.repo.disconnectSource(ids.ws, ids.owner, hidden);
    const before = await memory.read(q);
    await reconnect(h, ids.owner, hidden);
    const hiddenRows = [repo({}, { id: 'x1', observedAt: at('11:59') }), status(GH, REPO, 'error', 'timeout', { id: 'x2', observedAt: at('11:59') })];
    await h.repo.ingest(ids.ws, hiddenRows.map((r) => ({ ...toInput(r), sourceId: hidden, sourceRef: 'github:kemetra-labs/hidden-repo' })));
    await h.repo.disconnectSource(ids.ws, ids.owner, hidden);
    const after = await memory.read(q);
    expect(after.items).toEqual(before.items);
    expect(after.fingerprint).toBe(before.fingerprint);
  });
});

describe('time (D3)', () => {
  it('knownAt excludes rows received after it', async () => {
    const early = await memory.read(query({ knownAt: new Date(Date.now() - 365 * 86_400_000) }));
    expect(early.items).toEqual([]);
  });

  it('documented limit: an ingest open at the first read changes the replay; the response says best-effort and validateAtRead-style comparison detects it', async () => {
    const client = await h.db.app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_workspace', $1, true)`, [ids.ws]);
      await client.query(
        `INSERT INTO evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, payload)
         VALUES ($1, $2, $3, 'Observation', 'ok', $4, $5, $6::jsonb)`,
        [ids.ws, h.projectId, src[GH], `${REPO}#pull/77`, new Date(at('11:58')), JSON.stringify(pr(77, { updatedAt: at('11:00') }, { id: 'z', observedAt: at('11:58') }).payload)],
      );
      const knownAt = new Date(Date.now() + 1000);
      await new Promise((r) => setTimeout(r, 1100));
      const first = await memory.read(query({ knownAt }));
      await client.query('COMMIT');
      const replay = await memory.read(query({ knownAt }));
      expect(first.replay).toBe('best-effort');
      expect(first.items.some((i) => i.sourceRef === `${REPO}#pull/77`)).toBe(false);
      expect(replay.items.some((i) => i.sourceRef === `${REPO}#pull/77`)).toBe(true);
      expect(replay.fingerprint).not.toBe(first.fingerprint);
    } finally {
      client.release();
    }
  });
});

describe('ingest (D2)', () => {
  it('ingesting the same poll again changes counts only: items, current and status stay', async () => {
    const q = query({ knownAt: new Date(Date.now() + 86_400_000) });
    const before = await memory.read(q);
    await ingestBatches([jiraIssue('BACK-1', { updatedAt: at('08:00') }, { id: 'r1', observedAt: at('10:00'), state: 'stale' })]);
    const after = await memory.read(q);
    const strip = (p: typeof before) => p.items.map((i) => [i.sourceRef, i.kind, i.status, i.reason, i.current?.contentKey ?? null, i.history.length]);
    expect(strip(after)).toEqual(strip(before));
  });
});

// Work budget (DEC-1, tracked since the COG-08 review): the S2 statement processes all eligible history
// before the history cap applies, so a read on a request path is bounded in time instead. Over budget,
// the read is refused and rolled back: never a partial projection.
describe('work budget', () => {
  it('a read that cannot finish within its budget is refused, never cut short', async () => {
    const budgeted = new MemoryRepository(h.db.app, { budgetMs: 200 });
    const locker = await h.db.admin.connect();
    try {
      await locker.query('BEGIN');
      // The lock makes the read wait past its budget deterministically: statement_timeout counts lock waits.
      await locker.query('LOCK TABLE kawalys.evidence IN ACCESS EXCLUSIVE MODE');
      await expect(budgeted.read(query())).rejects.toBeInstanceOf(MemoryReadBudgetExceeded);
      await expect(budgeted.readVisible(query({ userId: ids.stranger }))).rejects.toBeInstanceOf(MemoryReadBudgetExceeded);
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
  }, 15_000);

  it('a read without a budget that is cancelled keeps its own error, not a budget one', async () => {
    const locker = await h.db.admin.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('LOCK TABLE kawalys.evidence IN ACCESS EXCLUSIVE MODE');
      const pending = memory.read(query()).then(() => null, (e: unknown) => e);
      let cancelled = false;
      for (let i = 0; i < 100 && !cancelled; i++) {
        const { rows } = await h.db.admin.query(`SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%clock AS (SELECT now()%'`);
        if (rows.length) cancelled = (await h.db.admin.query('SELECT pg_cancel_backend($1) AS ok', [rows[0].pid])).rows[0].ok === true;
        else await new Promise((r) => setTimeout(r, 50));
      }
      expect(cancelled).toBe(true);
      const err = await pending;
      expect(err).not.toBeInstanceOf(MemoryReadBudgetExceeded);
      expect((err as { code?: string }).code).toBe('57014');
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
  }, 15_000);

  it('the budget ends with the read: the pooled connection keeps no timeout', async () => {
    // One connection, so the check runs on the very connection the read used. A generous budget: a leak
    // would still show as '10s' instead of '0', and a slow runner cannot time the read out.
    const single = new pg.Pool({ ...h.db.app.options, max: 1 });
    try {
      await new MemoryRepository(single, { budgetMs: 10_000 }).read(query());
      const { rows } = await single.query("SELECT current_setting('statement_timeout') AS t");
      expect(rows[0].t).toBe('0');
    } finally {
      await single.end();
    }
  });

  it('within budget the read is the same as an unbudgeted one', async () => {
    const q = query({ knownAt: new Date(at('12:00')) });
    expect(await new MemoryRepository(h.db.app, { budgetMs: 30_000 }).read(q)).toEqual(await memory.read(q));
  });

  // Independent review: a hidden project with a long history must not reach the budget while a missing
  // one answers at once, or the budget becomes an existence oracle. Without a grant, the statement never
  // executes a scan of evidence, whatever the project holds (the evidence of this project is not visible
  // to the stranger).
  it('a reader with no grant on the project never scans evidence', async () => {
    const plan = await runWithWorkspaceContext(h.db.app, ids.ws, async (c) => {
      const res = await c.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${MEMORY_READ_SQL}`, [ids.stranger, h.projectId, null, ITEM_KIND_LIST, [], []]);
      return (res.rows[0] as Record<string, unknown>)['QUERY PLAN'] as [{ Plan: PlanNode }];
    });
    const scans: PlanNode[] = [];
    const walk = (n: PlanNode) => {
      if (n['Relation Name'] === 'evidence') scans.push(n);
      for (const child of n.Plans ?? []) walk(child);
    };
    walk(plan[0].Plan);
    expect(scans.length).toBeGreaterThan(0);
    expect(scans.map((n) => n['Actual Loops'])).toEqual(scans.map(() => 0));
  });

  it('refuses a budget that is not a positive whole number of milliseconds', () => {
    for (const budgetMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new MemoryRepository(h.db.app, { budgetMs })).toThrow(RangeError);
    }
  });
});

interface PlanNode {
  readonly 'Relation Name'?: string;
  readonly 'Actual Loops'?: number;
  readonly Plans?: readonly PlanNode[];
}

// A second project the reader can also read (tracked since the COG-08 review): evidence added there
// changes nothing in this project's projection, and the control read shows the new evidence did land.
describe('a second project the reader also sees (D4)', () => {
  it('evidence added to another project the reader can read changes nothing here', async () => {
    const q = query({ knownAt: new Date(Date.now() + 86_400_000) });
    const projectB = await h.repo.createProject(ids.ws, ids.owner, { key: 'second', name: 'Second' });
    const sourceB = await h.repo.connectSource(ids.ws, ids.owner, { projectId: projectB, provider: 'github', externalRef: 'kemetra-labs/second-repo' });
    const before = await memory.read(q);
    const rows = [repo({ archived: false }, { id: 's1', observedAt: at('11:59') }), status(GH, REPO, 'error', 'timeout', { id: 's2', observedAt: at('11:59') })];
    await h.repo.ingest(ids.ws, rows.map((r) => ({ ...toInput(r), sourceId: sourceB, sourceRef: 'github:kemetra-labs/second-repo' })));
    const after = await memory.read(q);
    expect(after.items).toEqual(before.items);
    expect(after.fingerprint).toBe(before.fingerprint);
    const other = await memory.read({ ...q, projectId: projectB });
    expect(other.items.some((i) => i.sourceId === sourceB)).toBe(true);
  });
});

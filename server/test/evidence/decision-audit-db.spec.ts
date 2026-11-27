// A HumanDecision cannot commit without its decision.recorded audit row, and the creator lookup of
// GET /decisions is served by an index (BACK-100, migration 0004). Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { DECISION_CREATOR, EvidenceRepository } from '../../src/evidence/evidence.repository';
import { sqlState } from '../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { makeWorkspace } from '../db/store-harness';
import { approveAll } from './approve-all-policy';

let db: KawalysDb | undefined;
let repo: EvidenceRepository;
const owner = randomUUID();
const ws = randomUUID();
const otherWs = randomUUID();
let projectId = '';
let investigationId = '';
let observationId = '';

const INTEGRITY = '23000';

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [owner]);
  await makeWorkspace(db, ws, owner);
  await makeWorkspace(db, otherWs, owner);
  repo = new EvidenceRepository(db.app, approveAll());
  projectId = await repo.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  const sourceId = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  investigationId = await repo.createInvestigation(ws, owner, { projectId, title: 'Build failures' });
  [observationId] = (await repo.ingest(ws, [
    { sourceId, investigationId, type: 'Observation', state: 'ok', sourceRef: 'github:kemetra-labs/backstage-os#pull/1', observedAt: new Date(), payload: {} },
  ])) as [string];
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

/** Insert a HumanDecision as the runtime role, the way recordDecision() does. */
const insertDecision = async (c: pg.PoolClient, workspaceId = ws): Promise<string> =>
  (
    await c.query<{ id: string }>(
      `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
       VALUES ($1, $2, NULL, $3, 'HumanDecision', 'ok', 'kawalys:decision', now(), '{"decision":"d","rationale":"r"}') RETURNING id`,
      [workspaceId, projectId, investigationId],
    )
  ).rows[0]!.id;

const insertAudit = (c: pg.PoolClient, targetId: string, over: { action?: string; targetType?: string; workspaceId?: string } = {}) =>
  c.query(`INSERT INTO audit_events (workspace_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, $3, $4, $5)`, [
    over.workspaceId ?? ws,
    owner,
    over.action ?? 'decision.recorded',
    over.targetType ?? 'evidence',
    targetId,
  ]);

/** Runs `work` in the runtime role's workspace context and returns the commit outcome. */
async function commitAsApp(work: (c: pg.PoolClient) => Promise<void>): Promise<{ code: string | undefined }> {
  try {
    await runWithWorkspaceContext(db!.app, ws, work);
    return { code: undefined };
  } catch (err) {
    return { code: sqlState(err) };
  }
}

const decisionCount = async (): Promise<number> =>
  runWithWorkspaceContext(db!.app, ws, async (c) =>
    Number((await c.query<{ n: string }>(`SELECT count(*) AS n FROM evidence WHERE type = 'HumanDecision'`)).rows[0]!.n),
  );

describe('a HumanDecision needs its decision.recorded audit row at commit', () => {
  it('the runtime role cannot commit a decision row without its audit row, and nothing is left behind', async () => {
    const before = await decisionCount();
    let inserted = '';
    const outcome = await commitAsApp(async (c) => {
      inserted = await insertDecision(c); // accepted here: the check is deferred to COMMIT
    });
    expect(inserted).not.toBe('');
    expect(outcome.code).toBe(INTEGRITY);
    expect(await decisionCount()).toBe(before);
  });

  it('commits when the audit row is written later in the same transaction (the recordDecision order)', async () => {
    const before = await decisionCount();
    const outcome = await commitAsApp(async (c) => {
      const id = await insertDecision(c);
      await insertAudit(c, id);
    });
    expect(outcome.code).toBeUndefined();
    expect(await decisionCount()).toBe(before + 1);
  });

  it.each([
    ['another action', { action: 'note.recorded' }],
    ['another target type', { targetType: 'investigation' }],
  ])('refuses an audit row with %s', async (_label, over) => {
    const outcome = await commitAsApp(async (c) => {
      const id = await insertDecision(c);
      await insertAudit(c, id, over);
    });
    expect(outcome.code).toBe(INTEGRITY);
  });

  it('refuses an audit row of another decision', async () => {
    const outcome = await commitAsApp(async (c) => {
      await insertDecision(c);
      await insertAudit(c, randomUUID());
    });
    expect(outcome.code).toBe(INTEGRITY);
  });

  it('fails closed when the workspace context is switched before commit (the audit row is then invisible)', async () => {
    const outcome = await commitAsApp(async (c) => {
      const id = await insertDecision(c);
      await insertAudit(c, id);
      await c.query(`SELECT set_config('app.current_workspace', $1, true)`, [otherWs]);
    });
    expect(outcome.code).toBe(INTEGRITY);
  });

  it('SET CONSTRAINTS ALL IMMEDIATE only moves the check earlier; it cannot skip it', async () => {
    const outcome = await commitAsApp(async (c) => {
      await insertDecision(c);
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
    expect(outcome.code).toBe(INTEGRITY);
  });

  it('holds for a superuser too, and an audit row of another workspace with the same target id does not count', async () => {
    const id = randomUUID();
    const client = await db!.admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO kawalys.audit_events (workspace_id, actor_user_id, action, target_type, target_id) VALUES ($1, $2, 'decision.recorded', 'evidence', $3)`, [
        otherWs,
        owner,
        id,
      ]);
      await client.query(
        `INSERT INTO kawalys.evidence (id, workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
         VALUES ($1, $2, $3, NULL, $4, 'HumanDecision', 'ok', 'kawalys:decision', now(), '{}')`,
        [id, ws, projectId, investigationId],
      );
      await expect(client.query('COMMIT')).rejects.toMatchObject({ code: INTEGRITY });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('the trigger is SECURITY INVOKER, pins search_path and is enabled ALWAYS', async () => {
    const { rows } = await db!.admin.query<{ prosecdef: boolean; proconfig: string[]; tgenabled: string; tgdeferrable: boolean; tginitdeferred: boolean }>(
      `SELECT p.prosecdef, p.proconfig, t.tgenabled, t.tgdeferrable, t.tginitdeferred
         FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgname = 'evidence_decision_audited' AND t.tgrelid = 'kawalys.evidence'::regclass`,
    );
    expect(rows).toEqual([{ prosecdef: false, proconfig: ['search_path=pg_catalog, pg_temp'], tgenabled: 'A', tgdeferrable: true, tginitdeferred: true }]);
  });
});

describe('the application path is unaffected', () => {
  it('recordDecision() commits, and the creator comes from its audit row', async () => {
    const id = await repo.recordDecision(ws, owner, { investigationId, decision: 'Retry', rationale: 'Flaky runner', evidenceIds: [observationId] }, null);
    const listed = (await repo.recentDecisions(ws, owner, { investigationId, limit: 100 })).items;
    expect(listed.find((d) => d.id === id)).toMatchObject({ createdBy: owner, citations: [observationId] });
  });

  it('source evidence needs no audit row', async () => {
    const sourceId = (await repo.list(ws, owner, { investigationId })).find((e) => e.type === 'Observation')!.sourceId!;
    await expect(
      repo.ingest(ws, [{ sourceId, type: 'Observation', state: 'unknown', sourceRef: 'github:kemetra-labs/backstage-os#deployments', observedAt: new Date(), payload: {} }]),
    ).resolves.toHaveLength(1);
  });

  it('every committed decision has a creator', async () => {
    const listed = (await repo.recentDecisions(ws, owner, { limit: 100 })).items;
    expect(listed.length).toBeGreaterThan(1);
    expect(listed.every((d) => d.createdBy === owner)).toBe(true);
  });
});

describe('the creator lookup index', () => {
  it('the exact creator subquery of GET /decisions is an index scan on audit_events_by_target, all four predicates in the index condition', async () => {
    const plan = await runWithWorkspaceContext(db!.app, ws, async (c) => {
      await c.query('SET LOCAL enable_seqscan = off');
      await c.query('SET LOCAL enable_bitmapscan = off');
      const { rows } = await c.query<{ 'QUERY PLAN': string }>(`EXPLAIN SELECT ${DECISION_CREATOR('$1::uuid')}`, [randomUUID()]);
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/Index (Only )?Scan using audit_events_by_target on audit_events/);
    const cond = plan.split('\n').find((l) => l.includes('Index Cond'))!;
    for (const column of ['workspace_id', 'target_type', 'target_id', 'action']) expect(cond).toContain(column);
    expect(plan).not.toContain('Sort');
  });

  it('the index has the equality columns of the lookup first, then its sort; the older audit index cannot serve it', async () => {
    const { rows } = await db!.admin.query<{ def: string }>(`SELECT pg_get_indexdef('kawalys.audit_events_by_target'::regclass) AS def`);
    expect(rows[0]!.def).toBe(
      'CREATE INDEX audit_events_by_target ON kawalys.audit_events USING btree (workspace_id, target_type, target_id, action, occurred_at, id)',
    );
    // The only other audit index cannot answer the creator lookup by target.
    const other = await db!.admin.query<{ def: string }>(`SELECT pg_get_indexdef('kawalys.audit_events_workspace_time'::regclass) AS def`);
    expect(other.rows[0]!.def).not.toContain('target_id');
  });
});

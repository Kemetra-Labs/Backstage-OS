// Typed evidence persistence, source grants and atomic human decisions (BACK-55 S3, gate A).
import { randomUUID } from 'node:crypto';
import { EvidenceRepository, type ObservationInput } from '../../src/evidence/evidence.repository';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { sqlState } from '../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

let db: KawalysDb | undefined;
let repo: EvidenceRepository;
const owner = randomUUID();
const ws = randomUUID();
let projectId = '';
let sourceId = '';
let investigationId = '';

const obs = (over: Partial<ObservationInput> = {}): ObservationInput => ({
  sourceId,
  type: 'Observation',
  state: 'ok',
  sourceRef: 'github:Kemetra-Labs/Backstage-OS#pull/1',
  observedAt: new Date('2026-11-20T10:00:00Z'),
  payload: { kind: 'pull_request', number: 1 },
  ...over,
});

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [owner]);
  await runWithWorkspaceContext(db.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, owner]);
  });
  repo = new EvidenceRepository(db.app);
  projectId = await repo.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Backstage-OS' });
  investigationId = await repo.createInvestigation(ws, owner, { projectId, title: 'Build failures' });
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

describe('typed evidence at the storage layer', () => {
  it('stores observations, including unknown and error states, and reads them back', async () => {
    const ids = await repo.ingest(ws, [obs(), obs({ state: 'unknown', payload: {} }), obs({ state: 'error', payload: { reason: 'http_403' } })]);
    expect(ids).toHaveLength(3);
    const seen = await repo.list(ws, owner, { sourceId });
    expect(seen.map((e) => e.state).sort()).toEqual(['error', 'ok', 'unknown']);
    expect(seen.every((e) => e.type === 'Observation' && e.sourceId === sourceId)).toBe(true);
  });

  it('rejects a missing or unknown type and a missing state in the database itself', async () => {
    const insert = (type: string | null, state: string | null) =>
      runWithWorkspaceContext(db!.app, ws, (c) =>
        c.query(
          `INSERT INTO evidence (workspace_id, project_id, source_id, type, state, source_ref, observed_at, payload)
           VALUES ($1, $2, $3, $4, $5, 'x:1', now(), '{}')`,
          [ws, projectId, sourceId, type, state],
        ),
      ).catch((e: unknown) => e);
    expect(sqlState(await insert(null, 'ok'))).toBe('23502');
    expect(sqlState(await insert('Rumour', 'ok'))).toBe('23514');
    expect(sqlState(await insert('Observation', null))).toBe('23502');
    expect(sqlState(await insert('Observation', 'healthy'))).toBe('23514');
  });

  it('refuses a whole batch when one item is invalid (no silent partial loss)', async () => {
    const before = (await repo.list(ws, owner, { sourceId })).length;
    await expect(repo.ingest(ws, [obs(), obs({ sourceRef: '' })])).rejects.toBeTruthy();
    expect((await repo.list(ws, owner, { sourceId })).length).toBe(before);
  });

  it('is append-only, even for a superuser in replica mode', async () => {
    const client = await db!.admin.connect();
    try {
      await client.query('SET session_replication_role = replica');
      for (const sql of [`UPDATE kawalys.evidence SET state = 'ok'`, 'DELETE FROM kawalys.evidence', 'TRUNCATE kawalys.evidence CASCADE']) {
        expect(sqlState(await client.query(sql).catch((e: unknown) => e))).toBe('42501');
      }
      // Plain TRUNCATE is refused even earlier: evidence_citations references evidence.
      expect(sqlState(await client.query('TRUNCATE kawalys.evidence').catch((e: unknown) => e))).toBe('0A000');
    } finally {
      await client.query('RESET session_replication_role').catch(() => undefined);
      client.release();
    }
  });
});

describe('source grants', () => {
  it('lists evidence by investigation and by project', async () => {
    await repo.ingest(ws, [obs({ investigationId, sourceRef: 'github:...#issues/7' })]);
    expect((await repo.list(ws, owner, { investigationId })).map((e) => e.sourceRef)).toEqual(['github:...#issues/7']);
    expect((await repo.list(ws, owner, { projectId })).length).toBeGreaterThan(1);
  });

  it('hides a source evidence without an active grant, including counts, and the read path never needs the hidden rows', async () => {
    const other = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [other]);
    expect(await repo.list(ws, other, { projectId })).toEqual([]);
    expect(await repo.get(ws, other, (await repo.list(ws, owner, { sourceId }))[0]!.id)).toBeNull();
  });

  it('hides everything from a source immediately after disconnect, and audits both changes', async () => {
    const extra = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Other' });
    const [id] = await repo.ingest(ws, [obs({ sourceId: extra, sourceRef: 'github:other#pull/2' })]);
    expect(await repo.get(ws, owner, id!)).not.toBeNull();
    await repo.disconnectSource(ws, owner, extra);
    expect(await repo.get(ws, owner, id!)).toBeNull();
    expect(await repo.list(ws, owner, { sourceId: extra })).toEqual([]);
    expect(await repo.hasActiveGrant(ws, owner, extra)).toBe(false);
    const actions = await runWithWorkspaceContext(db!.app, ws, async (c) =>
      (await c.query(`SELECT action FROM audit_events WHERE target_id = $1 ORDER BY occurred_at`, [extra])).rows.map((r) => r.action),
    );
    expect(actions).toEqual(['source.connected', 'source.disconnected']);
  });

  it('keeps sources, investigations and citations inside one project', async () => {
    const otherProject = await repo.createProject(ws, owner, { key: 'other', name: 'Other' });
    const otherInvestigation = await repo.createInvestigation(ws, owner, { projectId: otherProject, title: 'Elsewhere' });
    await expect(repo.ingest(ws, [obs({ investigationId: otherInvestigation })])).rejects.toBeTruthy();
    const [here] = await repo.ingest(ws, [obs()]);
    await expect(
      repo.recordDecision(ws, owner, { investigationId: otherInvestigation, decision: 'x', rationale: 'y', evidenceIds: [here!] }, null),
    ).rejects.toThrow(/not visible/);
  });

  it('never lets a user attach themselves to an existing source they were not granted', async () => {
    const intruder = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [intruder]);
    await expect(
      repo.connectSource(ws, intruder, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Backstage-OS' }),
    ).rejects.toThrow(/not visible/);
    expect(await repo.hasActiveGrant(ws, intruder, sourceId)).toBe(false);
    const otherProject = await repo.createProject(ws, owner, { key: 'third', name: 'Third' });
    await expect(
      repo.connectSource(ws, owner, { projectId: otherProject, provider: 'github', externalRef: 'Kemetra-Labs/Backstage-OS' }),
    ).rejects.toThrow(/not visible/);
  });

  it('is idempotent for an active grant and treats repository names case-insensitively', async () => {
    const again = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
    expect(again).toBe(sourceId);
  });

  it('refuses to ingest for a source with no active grant', async () => {
    const extra = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Revoked' });
    await repo.disconnectSource(ws, owner, extra);
    await expect(repo.ingest(ws, [obs({ sourceId: extra })])).rejects.toThrow(/no active grant/);
  });
});

describe('human decisions', () => {
  it('stores the decision and its audit row in one transaction', async () => {
    const [cited] = await repo.ingest(ws, [obs({ investigationId, sourceRef: 'github:...#pull/9' })]);
    const id = await repo.recordDecision(ws, owner, { investigationId, decision: 'Roll back', rationale: 'Build broken', evidenceIds: [cited!] }, null);
    const decision = await repo.get(ws, owner, id);
    expect(decision).toMatchObject({ type: 'HumanDecision', investigationId, sourceId: null, state: 'ok', citations: [cited] });
    expect(decision!.payload).toEqual({ decision: 'Roll back', rationale: 'Build broken' });
    const audit = await runWithWorkspaceContext(db!.app, ws, async (c) =>
      (await c.query(`SELECT actor_user_id, action FROM audit_events WHERE target_id = $1`, [id])).rows,
    );
    expect(audit).toEqual([{ actor_user_id: owner, action: 'decision.recorded' }]);
  });

  it('rolls the decision back when the audit row cannot be written', async () => {
    const failing = new EvidenceRepository(db!.app, async () => {
      throw new Error('audit unavailable');
    });
    const before = (await repo.list(ws, owner, { investigationId })).length;
    await expect(
      failing.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'y', evidenceIds: [] }, null),
    ).rejects.toThrow('audit unavailable');
    expect((await repo.list(ws, owner, { investigationId })).length).toBe(before);
  });

  it('hides a decision from anyone who cannot see every piece of evidence it cites (no citation leak)', async () => {
    const extra = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Cited' });
    const [cited] = await repo.ingest(ws, [obs({ sourceId: extra, investigationId })]);
    const id = await repo.recordDecision(ws, owner, { investigationId, decision: 'secret plan', rationale: 'about E1', evidenceIds: [cited!] }, null);
    const reader = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [reader]);
    expect(await repo.get(ws, reader, id)).toBeNull();
    expect((await repo.list(ws, reader, { investigationId })).map((e) => e.id)).not.toContain(id);
    // The decider loses sight of it too once the cited source is disconnected.
    await repo.disconnectSource(ws, owner, extra);
    expect(await repo.get(ws, owner, id)).toBeNull();
    // A decision that cites nothing stays visible to members with evidence.read.
    const open = await repo.recordDecision(ws, owner, { investigationId, decision: 'note', rationale: 'no citations', evidenceIds: [] }, null);
    expect(await repo.get(ws, reader, open)).toMatchObject({ citations: [] });
  });

  it('accepts citation ids in upper case', async () => {
    const [cited] = await repo.ingest(ws, [obs({ investigationId })]);
    const id = await repo.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'y', evidenceIds: [cited!.toUpperCase(), cited!] }, null);
    expect((await repo.get(ws, owner, id))!.citations).toEqual([cited]);
  });

  it('refuses to cite evidence the decider cannot see', async () => {
    const extra = await repo.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Hidden' });
    const [hidden] = await repo.ingest(ws, [obs({ sourceId: extra })]);
    await repo.disconnectSource(ws, owner, extra);
    await expect(
      repo.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'y', evidenceIds: [hidden!] }, null),
    ).rejects.toThrow(/not visible/);
  });
});

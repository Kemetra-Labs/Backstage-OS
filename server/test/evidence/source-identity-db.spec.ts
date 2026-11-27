// Approved source identity, replacement refusal and explicit reauthorization (BACK-131) on a real PostgreSQL 18.7,
// running as the least-privilege kawalys_app role. Every refusal is a NotVisibleError raised before any write.
import { randomUUID } from 'node:crypto';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { Reauthorization, REAUTH_MAX_AGE_MS, type SourceApprovalPolicy, type SourceIdentity } from '../../src/evidence/source-approval';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { approveAll } from './approve-all-policy';

let db: KawalysDb | undefined;
const owner = randomUUID();
const stranger = randomUUID();
// A fresh pair of workspaces per test: an identity is unique per workspace, so tests never share one.
let ws = '';
let otherWs = '';

/** A policy over a plain object, mutable so a test can change what is approved later. */
const approved: Record<string, SourceIdentity[]> = {};
const policy: SourceApprovalPolicy = { approvedIdentities: (key) => approved[key] ?? [] };
const gh = (externalRef: string): SourceIdentity => ({ provider: 'github', externalRef });

const X = gh('kemetra-labs/x');
const Y = gh('kemetra-labs/y');

let repo: EvidenceRepository;
let seeder: EvidenceRepository;

const connect = (projectId: string, id: SourceIdentity, actor = owner, r = repo) =>
  r.connectSource(ws, actor, { projectId, provider: id.provider, externalRef: id.externalRef });
const fresh = () => Reauthorization.fromSessionIssuedAt(Date.now());
const stale = () => Reauthorization.fromSessionIssuedAt(Date.now() - REAUTH_MAX_AGE_MS - 1);

interface Counts {
  sources: number;
  grants: number;
  revoked: number;
  audits: number;
}

async function counts(workspaceId = ws): Promise<Counts> {
  const { rows } = await db!.admin.query<Counts>(
    `SELECT (SELECT count(*)::int FROM kawalys.sources WHERE workspace_id = $1) AS sources,
            (SELECT count(*)::int FROM kawalys.source_grants WHERE workspace_id = $1) AS grants,
            (SELECT count(*)::int FROM kawalys.source_grants WHERE workspace_id = $1 AND revoked_at IS NOT NULL) AS revoked,
            (SELECT count(*)::int FROM kawalys.audit_events WHERE workspace_id = $1) AS audits`,
    [workspaceId],
  );
  return rows[0]!;
}

async function auditActions(sourceId: string): Promise<string[]> {
  const { rows } = await db!.admin.query<{ action: string }>(
    `SELECT action FROM kawalys.audit_events WHERE target_type = 'source' AND target_id = $1 ORDER BY occurred_at, id`,
    [sourceId],
  );
  return rows.map((r) => r.action);
}

/** A new project whose key approves exactly `identities`. */
async function project(key: string, identities: SourceIdentity[]): Promise<string> {
  approved[key] = identities;
  return seeder.createProject(ws, owner, { key, name: key });
}

const refused = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(NotVisibleError);

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [owner, stranger]);
  repo = new EvidenceRepository(db.app, policy);
  seeder = new EvidenceRepository(db.app, approveAll());
}, 180_000);

beforeEach(async () => {
  ws = randomUUID();
  otherWs = randomUUID();
  for (const id of [ws, otherWs]) {
    await runWithWorkspaceContext(db!.app, id, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [id, owner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner]);
    });
  }
});

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

describe('first connect needs an approved identity (G1, G2)', () => {
  it('G1: an unapproved first connect is refused and writes nothing', async () => {
    const p = await project('g1', []);
    const before = await counts();
    await refused(connect(p, X));
    expect(await counts()).toEqual(before);
  });

  it('G1: a project key the policy does not know approves nothing', async () => {
    const p = await seeder.createProject(ws, owner, { key: 'g1-unknown', name: 'unknown' });
    const before = await counts();
    await refused(connect(p, X));
    expect(await counts()).toEqual(before);
  });

  it('G2: an approved identity connects, a second unapproved one is refused with no change', async () => {
    const p = await project('g2', [X]);
    const sourceId = await connect(p, X);
    expect(await auditActions(sourceId)).toEqual(['source.connected']);
    const before = await counts();
    await refused(connect(p, Y));
    expect(await counts()).toEqual(before);
  });

  it('accepts the same identity again (idempotent) and every member of an approved set', async () => {
    const p = await project('g2-set', [X, Y]);
    const a = await connect(p, X);
    expect(await connect(p, X)).toBe(a);
    const before = await counts();
    expect(await connect(p, Y)).not.toBe(a);
    expect((await counts()).sources).toBe(before.sources + 1);
  });

  it('normalises the requested reference (trim, lower-case) before the policy check', async () => {
    const p = await project('g2-norm', [X]);
    expect(await connect(p, gh('  Kemetra-Labs/X '))).toEqual(expect.any(String));
  });

  it('refuses a provider that is approved for another identity only', async () => {
    const p = await project('g2-provider', [X]);
    await refused(connect(p, { provider: 'jira', externalRef: X.externalRef }));
  });
});

describe('no replacement after revoke, no conflicting history (G3)', () => {
  it('G3: after disconnect, a different identity and the same identity by connectSource are both refused', async () => {
    const p = await project('g3', [X]);
    const sourceId = await connect(p, X);
    await repo.disconnectSource(ws, owner, sourceId);
    const before = await counts();
    await refused(connect(p, Y));
    await refused(connect(p, X));
    expect(await counts()).toEqual(before);
    expect(before.revoked).toBeGreaterThan(0);
    expect(await auditActions(sourceId)).toEqual(['source.connected', 'source.disconnected']);
    expect(await repo.hasActiveGrant(ws, owner, sourceId)).toBe(false);
  });

  it('G3: an identity bound in another project is refused even where the policy approves it', async () => {
    const first = await project('g3-first', [gh('kemetra-labs/shared')]);
    const second = await project('g3-second', [gh('kemetra-labs/shared')]);
    await connect(first, gh('kemetra-labs/shared'));
    const before = await counts();
    await refused(connect(second, gh('kemetra-labs/shared')));
    expect(await counts()).toEqual(before);
  });

  it('G3: a historical identity the policy no longer approves blocks every connect in that project', async () => {
    const p = await project('g3-hist', [X]);
    await connect(p, X);
    approved['g3-hist'] = [Y];
    const before = await counts();
    await refused(connect(p, Y));
    await refused(connect(p, X));
    expect(await counts()).toEqual(before);
  });

  it('G3: nobody attaches to a source someone else connected', async () => {
    const p = await project('g3-foreign', [X]);
    await connect(p, X);
    const before = await counts();
    await refused(connect(p, X, stranger));
    expect(await counts()).toEqual(before);
  });
});

describe('reconnect needs a fresh reauthorization (G4)', () => {
  it('refuses a stale or future reauthorization, then reconnects with a fresh one and keeps the history', async () => {
    const p = await project('g4', [X]);
    const sourceId = await connect(p, X);
    await repo.disconnectSource(ws, owner, sourceId);
    const before = await counts();
    await refused(repo.reconnectSource(ws, owner, sourceId, stale()));
    await refused(repo.reconnectSource(ws, owner, sourceId, Reauthorization.fromSessionIssuedAt(Date.now() + 60_000)));
    expect(await counts()).toEqual(before);
    expect(await repo.hasActiveGrant(ws, owner, sourceId)).toBe(false);

    expect(await repo.reconnectSource(ws, owner, sourceId, fresh())).toBe(sourceId);
    expect(await repo.hasActiveGrant(ws, owner, sourceId)).toBe(true);
    const after = await counts();
    expect(after.grants).toBe(before.grants + 1);
    expect(after.revoked).toBe(before.revoked);
    expect(after.audits).toBe(before.audits + 1);
    expect(await auditActions(sourceId)).toEqual(['source.connected', 'source.disconnected', 'source.reconnected']);
  });

  it('accepts a reauthorization just inside the window (the exact boundary is a unit test of isFreshAt)', async () => {
    const p = await project('g4-edge', [X]);
    const sourceId = await connect(p, X);
    await repo.disconnectSource(ws, owner, sourceId);
    await repo.reconnectSource(ws, owner, sourceId, Reauthorization.fromSessionIssuedAt(Date.now() - REAUTH_MAX_AGE_MS + 10_000));
    expect(await repo.hasActiveGrant(ws, owner, sourceId)).toBe(true);
  });

  it('is idempotent for an active grant: no new row, no audit', async () => {
    const p = await project('g4-idem', [X]);
    const sourceId = await connect(p, X);
    const before = await counts();
    expect(await repo.reconnectSource(ws, owner, sourceId, fresh())).toBe(sourceId);
    expect(await counts()).toEqual(before);
  });

  it('refuses a user who never held a grant, an unknown id and a malformed id', async () => {
    const p = await project('g4-user', [X]);
    const sourceId = await connect(p, X);
    const before = await counts();
    await refused(repo.reconnectSource(ws, stranger, sourceId, fresh()));
    await refused(repo.reconnectSource(ws, owner, randomUUID(), fresh()));
    await refused(repo.reconnectSource(ws, owner, 'not-a-uuid', fresh()));
    expect(await counts()).toEqual(before);
  });

  it('refuses when the identity is no longer approved', async () => {
    const p = await project('g4-unapproved', [X]);
    const sourceId = await connect(p, X);
    await repo.disconnectSource(ws, owner, sourceId);
    approved['g4-unapproved'] = [];
    const before = await counts();
    await refused(repo.reconnectSource(ws, owner, sourceId, fresh()));
    expect(await counts()).toEqual(before);
  });

  it('refuses when the project holds another identity the policy does not approve (conflicting history)', async () => {
    const p = await project('g4-conflict', [X]);
    const sourceId = await connect(p, X);
    await connect(p, Y, owner, seeder);
    await repo.disconnectSource(ws, owner, sourceId);
    const before = await counts();
    await refused(repo.reconnectSource(ws, owner, sourceId, fresh()));
    expect(await counts()).toEqual(before);
  });

  it('refuses a source of another workspace (row level security hides it)', async () => {
    const p = await project('g4-ws', [X]);
    const sourceId = await connect(p, X);
    await refused(repo.reconnectSource(otherWs, owner, sourceId, fresh()));
  });
});

describe('refusals leave no trace and revive nothing (G5)', () => {
  it('G5: refused connects and reconnects add no grant or audit row and an uncited decision stays hidden', async () => {
    const p = await project('g5', [X]);
    const sourceId = await connect(p, X);
    const investigationId = await seeder.createInvestigation(ws, owner, { projectId: p, title: 'G5' });
    const decisionId = await seeder.recordDecision(ws, owner, { investigationId, decision: 'x', rationale: 'y', evidenceIds: [] }, null);
    expect(await repo.get(ws, owner, decisionId)).not.toBeNull();
    await repo.disconnectSource(ws, owner, sourceId);
    expect(await repo.get(ws, owner, decisionId)).toBeNull();

    const before = await counts();
    await refused(connect(p, Y));
    await refused(connect(p, X));
    await refused(repo.reconnectSource(ws, owner, sourceId, stale()));
    await refused(repo.reconnectSource(ws, stranger, sourceId, fresh()));
    expect(await counts()).toEqual(before);
    expect(await repo.get(ws, owner, decisionId)).toBeNull();
    expect((await repo.list(ws, owner, { projectId: p })).map((e) => e.id)).not.toContain(decisionId);
    expect(await repo.get(ws, stranger, decisionId)).toBeNull();
  });
});

describe('a project of another workspace is refused cleanly (G6)', () => {
  it('G6: connectSource with a foreign project id is a NotVisibleError and writes nothing anywhere', async () => {
    approved['g6'] = [X];
    const foreign = await runWithWorkspaceContext(db!.app, otherWs, async (c) => {
      const { rows } = await c.query<{ id: string }>(`INSERT INTO projects (workspace_id, key, name) VALUES ($1, 'g6', 'g6') RETURNING id`, [otherWs]);
      return rows[0]!.id;
    });
    const before = { a: await counts(ws), b: await counts(otherWs) };
    await refused(connect(foreign, X));
    expect({ a: await counts(ws), b: await counts(otherWs) }).toEqual(before);
  });

  it('G6: an unknown or malformed project id is the same refusal', async () => {
    const before = await counts();
    await refused(connect(randomUUID(), X));
    await refused(connect('not-a-uuid', X));
    expect(await counts()).toEqual(before);
  });
});

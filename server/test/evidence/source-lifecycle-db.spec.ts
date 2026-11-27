// Source lifecycle under real concurrency (BACK-131 G7) and the all-readers matrix (G8), on PostgreSQL 18.7 as the
// least-privilege kawalys_app role. Races use a pool of 12 real connections, a start barrier and a fresh project and
// source per iteration, so a missing lock or a lost update shows up as a raw database error or a broken invariant.
// Audit and grant timestamps are transaction start times, so lifecycle order is judged from counts, not timestamps.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { InvestigationRepository } from '../../src/investigations/investigation.repository';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { canonicalJson } from '../../src/memory/memory.canonical';
import { MemoryRepository } from '../../src/memory/memory.repository';
import { PortfolioRepository } from '../../src/portfolio/portfolio.repository';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { Reauthorization, REAUTH_MAX_AGE_MS, type SourceApprovalPolicy, type SourceIdentity } from '../../src/evidence/source-approval';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { at, pr, repo as repoRow, REPO } from '../memory/memory.fixture';
import { approveAll } from './approve-all-policy';

const ITERATIONS = 15;
const RACE_CONNECTIONS = 12;
const GRANT_REFUSAL = /ingest refused: no active grant for source/;

let db: KawalysDb | undefined;
let racePool: pg.Pool;
let repo: EvidenceRepository; // policy-bound, on the 12-connection pool
let seeder: EvidenceRepository; // approves everything, for set-up only
const owner = randomUUID();
let ws = '';
let otherWs = '';

const approved = new Map<string, SourceIdentity[]>();
const policy: SourceApprovalPolicy = { approvedIdentities: (key) => approved.get(key) ?? [] };
const gh = (externalRef: string): SourceIdentity => ({ provider: 'github', externalRef });

const connect = (workspace: string, projectId: string, id: SourceIdentity) =>
  repo.connectSource(workspace, owner, { projectId, provider: id.provider, externalRef: id.externalRef });
const fresh = () => Reauthorization.fromSessionIssuedAt(Date.now());
const reconnect = (workspace: string, sourceId: string) => repo.reconnectSource(workspace, owner, sourceId, fresh());
const disconnect = (workspace: string, sourceId: string) => repo.disconnectSource(workspace, owner, sourceId);

/** Starts every call after one shared gate opens, so they overlap on separate connections. */
async function race<T>(calls: ReadonlyArray<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const running = calls.map((call) => gate.then(call));
  open();
  return Promise.allSettled(running);
}

/** Anything rejected that is not a clean refusal (a raw database error, a lost update) is returned for the assert. */
function unexpected(results: readonly PromiseSettledResult<unknown>[], allowIngestRefusal = false): string[] {
  return results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .filter((r) => !(r.reason instanceof NotVisibleError) && !(allowIngestRefusal && r.reason instanceof Error && GRANT_REFUSAL.test(r.reason.message)))
    .map((r) => String(r.reason));
}

const fulfilled = <T>(results: readonly PromiseSettledResult<T>[]): T[] =>
  results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value);

interface GrantRow {
  id: string;
  source_id: string;
  user_id: string;
  granted_at: Date;
  revoked_at: Date | null;
}

/** Everything stored for one project's sources, read as the database owner (bypasses RLS). */
async function snapshot(projectId: string): Promise<{ sources: string[]; grants: GrantRow[]; audits: string[] }> {
  const q = <R extends pg.QueryResultRow>(sql: string) => db!.admin.query<R>(sql, [projectId]).then((r) => r.rows);
  return {
    sources: (await q<{ r: string }>(`SELECT provider || ':' || external_ref AS r FROM kawalys.sources WHERE project_id = $1 ORDER BY 1`)).map((r) => r.r),
    grants: await q<GrantRow>(
      `SELECT g.id, g.source_id, g.user_id, g.granted_at, g.revoked_at FROM kawalys.source_grants g
         JOIN kawalys.sources s ON s.id = g.source_id WHERE s.project_id = $1 ORDER BY g.granted_at, g.id`,
    ),
    audits: (
      await q<{ action: string }>(
        `SELECT a.action FROM kawalys.audit_events a JOIN kawalys.sources s ON a.target_id::text = s.id::text
          WHERE a.target_type = 'source' AND s.project_id = $1 ORDER BY a.occurred_at, a.id`,
      )
    ).map((r) => r.action),
  };
}

const tally = (audits: readonly string[]) => ({
  connected: audits.filter((a) => a === 'source.connected').length,
  disconnected: audits.filter((a) => a === 'source.disconnected').length,
  reconnected: audits.filter((a) => a === 'source.reconnected').length,
});

/** A project whose key approves exactly one identity, X, unique to this iteration. */
async function freshProject(tag: string, i: number, workspaces: readonly string[] = [ws]): Promise<{ key: string; X: SourceIdentity; projects: string[] }> {
  const key = `${tag}-${i}`;
  const X = gh(`kemetra-labs/${key}-x`);
  approved.set(key, [X]);
  const projects = await Promise.all(workspaces.map((w) => seeder.createProject(w, owner, { key, name: key })));
  return { key, X, projects };
}

async function makeWorkspace(id: string): Promise<void> {
  await runWithWorkspaceContext(db!.app, id, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [id, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner]);
  });
}

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [owner]);
  ws = randomUUID();
  otherWs = randomUUID();
  await makeWorkspace(ws);
  await makeWorkspace(otherWs);
  racePool = new pg.Pool({ connectionString: db.appUrl, max: RACE_CONNECTIONS });
  const warm = await Promise.all(Array.from({ length: RACE_CONNECTIONS }, () => racePool.connect()));
  warm.forEach((c) => c.release());
  repo = new EvidenceRepository(racePool, policy);
  seeder = new EvidenceRepository(racePool, approveAll());
}, 240_000);

afterAll(async () => {
  await racePool?.end();
  await stopKawalysDb(db);
}, 60_000);

describe('concurrent connects and reconnects (G7)', () => {
  it('C1: eight concurrent first connects of one approved identity make one source, one grant, one audit row', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { X, projects } = await freshProject('c1', i);
      const results = await race(Array.from({ length: 8 }, () => () => connect(ws, projects[0]!, X)));
      expect(unexpected(results)).toEqual([]);
      const ids = new Set(fulfilled(results));
      expect(ids.size).toBe(1);
      const s = await snapshot(projects[0]!);
      expect(s.sources).toEqual([`github:${X.externalRef}`]);
      expect(s.grants).toHaveLength(1);
      expect(s.audits).toEqual(['source.connected']);
    }
  });

  it('C2: an unapproved identity never connects while the approved one is disconnected or reconnected', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { X, projects } = await freshProject('c2', i);
      const Y = gh(`kemetra-labs/c2-${i}-y`);
      const sourceId = await connect(ws, projects[0]!, X);
      const [yWhileDisconnect, disconnected] = await race<unknown>([() => connect(ws, projects[0]!, Y), () => disconnect(ws, sourceId)]);
      expect(yWhileDisconnect!.status).toBe('rejected');
      expect(disconnected!.status).toBe('fulfilled');
      const [yWhileReconnect, reconnected] = await race<unknown>([() => connect(ws, projects[0]!, Y), () => reconnect(ws, sourceId)]);
      expect(yWhileReconnect!.status).toBe('rejected');
      expect(reconnected!.status).toBe('fulfilled');
      expect(unexpected([yWhileDisconnect!, yWhileReconnect!])).toEqual([]);
      expect((await snapshot(projects[0]!)).sources).toEqual([`github:${X.externalRef}`]);
    }
  });

  it('C3: two concurrent fresh reconnects add exactly one grant row and one audit row', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { X, projects } = await freshProject('c3', i);
      const sourceId = await connect(ws, projects[0]!, X);
      await disconnect(ws, sourceId);
      const results = await race([() => reconnect(ws, sourceId), () => reconnect(ws, sourceId)]);
      expect(unexpected(results)).toEqual([]);
      expect(fulfilled(results)).toEqual([sourceId, sourceId]);
      const s = await snapshot(projects[0]!);
      expect(s.grants).toHaveLength(2);
      expect(s.grants.filter((g) => g.revoked_at === null)).toHaveLength(1);
      expect(tally(s.audits)).toEqual({ connected: 1, disconnected: 1, reconnected: 1 });
    }
  });
});

describe('reconnect racing disconnect (G7, C4)', () => {
  for (const startActive of [true, false]) {
    it(`C4: never more than one active grant, a balanced lifecycle and untouched history (starts ${startActive ? 'active' : 'revoked'})`, async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { X, projects } = await freshProject(startActive ? 'c4a' : 'c4r', i);
        const sourceId = await connect(ws, projects[0]!, X);
        if (!startActive) await disconnect(ws, sourceId);
        const before = (await snapshot(projects[0]!)).grants;
        const calls: Array<() => Promise<unknown>> = [() => reconnect(ws, sourceId), () => disconnect(ws, sourceId)];
        const results = await race(i % 2 === 0 ? calls : [...calls].reverse());
        expect(unexpected(results)).toEqual([]);

        const after = await snapshot(projects[0]!);
        const active = after.grants.filter((g) => g.revoked_at === null).length;
        expect(active).toBeLessThanOrEqual(1);
        for (const old of before) {
          const now = after.grants.find((g) => g.id === old.id);
          expect(now).toMatchObject({ source_id: old.source_id, user_id: old.user_id, granted_at: old.granted_at });
          if (old.revoked_at !== null) expect(now!.revoked_at).toEqual(old.revoked_at);
        }
        // Each grant row is one connect or reconnect; each revoked row is one disconnect: so the lifecycle balances
        // (ups minus downs is the number of active grants, 0 or 1) and no two ups or downs can have been adjacent.
        const t = tally(after.audits);
        expect(t.connected).toBe(1);
        expect(after.grants).toHaveLength(1 + t.reconnected);
        expect(after.grants.filter((g) => g.revoked_at !== null)).toHaveLength(t.disconnected);
        expect(t.connected + t.reconnected - t.disconnected).toBe(active);
      }
    });
  }
});

describe('ingest racing disconnect (G7, C5)', () => {
  const observation = (sourceId: string, n: number) => ({
    sourceId,
    type: 'Observation' as const,
    state: 'ok' as const,
    sourceRef: `github:kemetra-labs/c5#pull/${n}`,
    observedAt: new Date('2026-11-25T10:00:00Z'),
    payload: { kind: 'pull_request', number: n },
  });

  it('C5: evidence is never readable once the revoke committed, whichever call won', async () => {
    const outcomes = { committedThenRevoked: 0, refused: 0 };
    for (let i = 0; i < 2 * ITERATIONS; i++) {
      const { X, projects } = await freshProject('c5', i);
      const sourceId = await connect(ws, projects[0]!, X);
      const calls: Array<() => Promise<unknown>> = [() => repo.ingest(ws, [observation(sourceId, i)]), () => disconnect(ws, sourceId)];
      const [ingested, revoked] = await race(i % 2 === 0 ? calls : [...calls].reverse()).then((r) => (i % 2 === 0 ? r : [...r].reverse()));
      expect(revoked!.status).toBe('fulfilled');
      expect(unexpected([ingested!], true)).toEqual([]);

      expect(await repo.list(ws, owner, { sourceId })).toEqual([]);
      expect(await repo.list(ws, owner, { projectId: projects[0]! })).toEqual([]);
      const { rows } = await db!.admin.query<{ n: number }>('SELECT count(*)::int AS n FROM kawalys.evidence WHERE source_id = $1', [sourceId]);
      expect(rows[0]!.n).toBe(ingested!.status === 'fulfilled' ? 1 : 0);
      if (ingested!.status === 'fulfilled') outcomes.committedThenRevoked += 1;
      else outcomes.refused += 1;
    }
    expect(outcomes.committedThenRevoked + outcomes.refused).toBe(2 * ITERATIONS);
  });

  it('C5: ingest after a committed revoke is refused with the grant refusal and stores nothing', async () => {
    const { X, projects } = await freshProject('c5-after', 0);
    const sourceId = await connect(ws, projects[0]!, X);
    expect(await repo.ingest(ws, [observation(sourceId, 1)])).toHaveLength(1);
    await disconnect(ws, sourceId);
    expect(await repo.list(ws, owner, { sourceId })).toEqual([]);
    await expect(repo.ingest(ws, [observation(sourceId, 2)])).rejects.toThrow(GRANT_REFUSAL);
    const { rows } = await db!.admin.query<{ n: number }>('SELECT count(*)::int AS n FROM kawalys.evidence WHERE source_id = $1', [sourceId]);
    expect(rows[0]!.n).toBe(1);
  });
});

describe('two workspaces racing the same repository name (G7, C6)', () => {
  it('C6: no cross-workspace effect and no raw database error', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { X, projects } = await freshProject('c6', i, [ws, otherWs]);
      const [p1, p2] = projects as [string, string];
      const connects = await race([() => connect(ws, p1, X), () => connect(otherWs, p2, X)]);
      expect(unexpected(connects)).toEqual([]);
      const [s1, s2] = fulfilled(connects) as [string, string];
      expect(s1).not.toBe(s2);
      await Promise.all([disconnect(ws, s1), disconnect(otherWs, s2)]);

      const results = await race([() => reconnect(ws, s1), () => reconnect(otherWs, s2), () => connect(ws, p1, X), () => connect(otherWs, p2, X)]);
      expect(unexpected(results)).toEqual([]);
      // A connect that runs after the reconnect committed is the idempotent no-op: same id, never a second source.
      expect(fulfilled(results.slice(2) as PromiseSettledResult<string>[]).every((id) => id === s1 || id === s2)).toBe(true);
      // A source id of the other workspace is invisible, not an error.
      const cross = await race([() => reconnect(ws, s2), () => reconnect(otherWs, s1)]);
      expect(unexpected(cross)).toEqual([]);
      expect(cross.map((r) => r.status)).toEqual(['rejected', 'rejected']);

      for (const [project, source] of [[p1, s1], [p2, s2]] as const) {
        const s = await snapshot(project);
        expect(s.sources).toEqual([`github:${X.externalRef}`]);
        expect(s.grants.map((g) => g.source_id)).toEqual([source, source]);
        expect(tally(s.audits)).toEqual({ connected: 1, disconnected: 1, reconnected: 1 });
      }
      const { rows } = await db!.admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM kawalys.source_grants g JOIN kawalys.sources s ON s.id = g.source_id WHERE g.workspace_id <> s.workspace_id`,
      );
      expect(rows[0]!.n).toBe(0);
    }
  });
});

describe('one identity first-connected in two projects at once (C7)', () => {
  it('C7: exactly one source row; the loser is a NotVisibleError, never a raw database error', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const X = gh(`kemetra-labs/c7-${i}-x`);
      approved.set(`c7-${i}-a`, [X]);
      approved.set(`c7-${i}-b`, [X]);
      const a = await seeder.createProject(ws, owner, { key: `c7-${i}-a`, name: 'a' });
      const b = await seeder.createProject(ws, owner, { key: `c7-${i}-b`, name: 'b' });
      const results = await race([() => connect(ws, a, X), () => connect(ws, b, X)]);
      expect(unexpected(results)).toEqual([]);
      expect(fulfilled(results)).toHaveLength(1);
      const [sa, sb] = [await snapshot(a), await snapshot(b)];
      expect(sa.sources.length + sb.sources.length).toBe(1);
      expect(sa.grants.length + sb.grants.length).toBe(1);
    }
  });
});

describe('every reader answers as if the source never existed (G8)', () => {
  const portfolio = () => new PortfolioRepository(db!.app);
  const investigations = () => new InvestigationRepository(db!.app);
  const memory = () => new MemoryRepository(db!.app);
  const X = gh('kemetra-labs/matrix-x');
  const KNOWN_AT = new Date(Date.now() + 86_400_000);
  const PR12_REF = `${REPO}#pull/12`;

  interface World {
    projectId: string;
    investigationId: string;
    sourceId: string;
    evidenceId: string;
    decisionIds: string[];
  }
  let x: World;
  let baseline: World;
  let positive: unknown;

  /** Every reader entry point, for one world, as plain data. */
  async function answers(w: World): Promise<Record<string, unknown>> {
    const p = await memory().read({
      workspaceId: ws,
      userId: owner,
      projectId: w.projectId,
      effectiveAt: new Date(at('12:00')),
      knownAt: KNOWN_AT,
      evaluationAt: new Date(at('12:00')),
    });
    return {
      evidenceByProject: await seeder.list(ws, owner, { projectId: w.projectId }),
      evidenceByInvestigation: await seeder.list(ws, owner, { investigationId: w.investigationId }),
      evidenceBySource: await seeder.list(ws, owner, { sourceId: w.sourceId }),
      evidenceGet: await seeder.get(ws, owner, w.evidenceId),
      decisionGet: await Promise.all(w.decisionIds.map((id) => seeder.get(ws, owner, id))),
      decisions: await seeder.recentDecisions(ws, owner, { investigationId: w.investigationId, limit: 50 }),
      investigations: await investigations().list(ws, owner, { projectId: w.projectId }),
      investigationGet: await investigations().get(ws, owner, w.investigationId),
      portfolioWithItems: await portfolio().list(ws, owner, { projectId: w.projectId, withItems: true }),
      portfolioSummary: await portfolio().list(ws, owner, { projectId: w.projectId, withItems: false }),
      memory: canonicalJson({
        items: p.items,
        searches: ['login', 'BACK-7', 'timeout'].map((q) => search(p, q)),
        relationships: relationships(p),
        related: related(p, { sourceId: w.sourceId, sourceRef: PR12_REF, kind: 'pull_request' }, { depth: 3 }),
      }),
    };
  }

  /** Ids replaced by role tokens, so two worlds with different uuids compare by shape. */
  function shaped(w: World, a: unknown): string {
    const tokens: Array<[string, string]> = [[w.projectId, '<project>'], [w.investigationId, '<investigation>'], [w.sourceId, '<source>'], [w.evidenceId, '<evidence>']];
    w.decisionIds.forEach((id, n) => tokens.push([id, `<decision${n}>`]));
    return tokens.reduce((text, [id, token]) => text.split(id).join(token), JSON.stringify(a));
  }

  const compareToBaseline = async () => expect(shaped(x, await answers(x))).toBe(shaped(baseline, await answers(baseline)));
  const refusals = async (sourceId: string) => {
    const stale = Reauthorization.fromSessionIssuedAt(Date.now() - REAUTH_MAX_AGE_MS - 1);
    await expect(repo.reconnectSource(ws, owner, sourceId, stale)).rejects.toBeInstanceOf(NotVisibleError);
    await expect(connect(ws, x.projectId, X)).rejects.toBeInstanceOf(NotVisibleError);
    await expect(connect(ws, x.projectId, gh('kemetra-labs/matrix-y'))).rejects.toBeInstanceOf(NotVisibleError);
  };

  beforeAll(async () => {
    approved.set('matrix-x', [X]);
    const projectId = await seeder.createProject(ws, owner, { key: 'matrix-x', name: 'Matrix X' });
    const sourceId = await connect(ws, projectId, X);
    const investigationId = await seeder.createInvestigation(ws, owner, { projectId, title: 'Matrix investigation' });
    const o = (id: string) => ({ id, observedAt: at('11:55') });
    const rows = [repoRow({}, o('r1')), pr(12, { title: 'Fix login timeout for BACK-7', updatedAt: at('11:00') }, o('p12'))];
    await repo.ingest(
      ws,
      rows.map((r) => ({ sourceId, type: 'Observation' as const, state: r.state, sourceRef: r.sourceRef, observedAt: new Date(r.observedAt), payload: { ...r.payload } })),
    );
    const evidence = await repo.list(ws, owner, { sourceId });
    const evidenceId = evidence.find((e) => e.sourceRef === PR12_REF)!.id;
    const cited = await repo.recordDecision(ws, owner, { investigationId, decision: 'Revert', rationale: 'cited', evidenceIds: [evidenceId] }, null);
    const uncited = await repo.recordDecision(ws, owner, { investigationId, decision: 'Wait', rationale: 'uncited', evidenceIds: [] }, null);
    x = { projectId, investigationId, sourceId, evidenceId, decisionIds: [cited, uncited] };

    // The baseline: same workspace, a project and an investigation, and a source that was never connected.
    const baseProject = await seeder.createProject(ws, owner, { key: 'matrix-base', name: 'Matrix baseline' });
    baseline = {
      projectId: baseProject,
      investigationId: await seeder.createInvestigation(ws, owner, { projectId: baseProject, title: 'Matrix investigation' }),
      sourceId: randomUUID(),
      evidenceId: randomUUID(),
      decisionIds: [randomUUID(), randomUUID()],
    };
  }, 120_000);

  it('positive control: while granted, every reader returns the data', async () => {
    positive = await answers(x);
    const a = positive as Record<string, any>;
    expect(a.evidenceByProject).toHaveLength(4); // 2 observations and 2 decisions
    expect(a.evidenceByInvestigation).toHaveLength(2);
    expect(a.evidenceBySource).toHaveLength(2);
    expect(a.evidenceGet).toMatchObject({ id: x.evidenceId });
    expect(a.decisionGet.every((d: unknown) => d !== null)).toBe(true);
    expect(a.decisions.items.map((d: { id: string }) => d.id).sort()).toEqual([...x.decisionIds].sort());
    expect(a.investigations).toHaveLength(1);
    expect(a.investigationGet).toMatchObject({ id: x.investigationId });
    expect(a.portfolioWithItems).toHaveLength(1);
    expect(a.portfolioWithItems[0].sources[0].items.length).toBeGreaterThan(0);
    expect(a.portfolioSummary).toHaveLength(1);
    expect(a.memory).toContain('Fix login timeout');
    expect(shaped(x, a)).not.toBe(shaped(baseline, await answers(baseline)));
  });

  it('after disconnect, every reader equals the never-existed baseline, including the uncited decision', async () => {
    await disconnect(ws, x.sourceId);
    await compareToBaseline();
    const a = await answers(x);
    expect(a.portfolioWithItems).toEqual([]);
    expect((await seeder.list(ws, owner, {})).every((e) => e.projectId !== x.projectId)).toBe(true);
    expect((await investigations().list(ws, owner, {})).every((i) => i.projectId !== x.projectId)).toBe(true);
    expect((await portfolio().list(ws, owner, { withItems: true })).every((p) => p.id !== x.projectId)).toBe(true);
    expect((await seeder.recentDecisions(ws, owner, { limit: 50 })).items).toEqual([]);
  });

  it('after refused reconnects and connects, it still equals the baseline and nothing was written', async () => {
    const before = await snapshot(x.projectId);
    await refusals(x.sourceId);
    expect(await snapshot(x.projectId)).toEqual(before);
    await compareToBaseline();
  });

  it('after a fresh reconnect the data is visible again, exactly as before', async () => {
    await reconnect(ws, x.sourceId);
    const again = await answers(x);
    const before = positive as Record<string, unknown>;
    for (const key of ['evidenceByProject', 'evidenceByInvestigation', 'evidenceBySource', 'evidenceGet', 'decisionGet', 'decisions', 'investigations', 'investigationGet', 'portfolioWithItems', 'portfolioSummary']) {
      expect(again[key]).toEqual(before[key]);
    }
    expect(again.memory).toContain('Fix login timeout');
  });
});

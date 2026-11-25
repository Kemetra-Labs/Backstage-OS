// Local run and synthetic seed (BACK-61): provision, migrate and seed a disposable container through the
// production code paths, read it back through the repository, and prove a second run adds nothing.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { generateLocalCredentials } from '../../src/ops/local-credentials';
import {
  assertLocalAdminUrl,
  LOCAL_SYNTHETIC_OWNER,
  localRuntimeUrls,
  prepareLocalDatabase,
  seedLocal,
  SEED,
  type SeedSummary,
} from '../../src/ops/local-stack';
import { MIGRATIONS_DIR } from '../db/kawalys-db';
import { startPgContainer, stopPgContainer, type PgContainer } from '../db/pg-container';

let base: PgContainer | undefined;
let app: pg.Pool;
let auth: pg.Pool;
let first: SeedSummary;
const creds = generateLocalCredentials();

beforeAll(async () => {
  base = await startPgContainer();
  const adminUrl = base.container.getConnectionUri();
  const prepared = await prepareLocalDatabase(adminUrl, creds, {}, MIGRATIONS_DIR);
  expect(prepared.provisioned).toBe(true);
  expect(prepared.applied.length).toBeGreaterThan(0);
  const urls = localRuntimeUrls(adminUrl, creds);
  app = new pg.Pool({ connectionString: urls.app, max: 2 });
  auth = new pg.Pool({ connectionString: urls.auth, max: 2 });
  first = await seedLocal({ app, auth });
}, 180_000);

afterAll(async () => {
  await app?.end();
  await auth?.end();
  await stopPgContainer(base);
}, 60_000);

describe('local seed (synthetic data, repository layer)', () => {
  it('seeds observations in ok, stale, error and unknown states, a correlation and a decision', () => {
    expect(first.created).toBe(6);
    const byType = (t: string) => first.evidence.filter((e) => e.type === t);
    expect(byType('Observation').map((e) => e.state).sort()).toEqual(['error', 'ok', 'stale', 'unknown']);
    expect(byType('Correlation')).toHaveLength(1);
    const [decision] = byType('HumanDecision');
    expect(decision?.investigationId).toBe(first.investigationId);
    expect(decision?.citations).toHaveLength(2);
    expect(first.evidence.every((e) => e.projectId === first.projectId)).toBe(true);
    expect(first.evidence.filter((e) => e.type !== 'HumanDecision').every((e) => e.payload['synthetic'] === true)).toBe(true);
  });

  it('writes the audit rows of the real code paths (owner binding, project, source, investigation, decision)', () => {
    expect([...first.auditActions].sort()).toEqual(
      ['decision.recorded', 'investigation.created', 'owner.bound', 'project.created', 'source.connected'].sort(),
    );
  });

  it('is visible through the repository read functions for the owner only (grants and RLS still apply)', async () => {
    const repo = new EvidenceRepository(app);
    expect(await repo.list(first.workspaceId, first.userId, { sourceId: first.sourceId })).toHaveLength(5);
    expect(await repo.list(first.workspaceId, first.userId, { investigationId: first.investigationId })).toHaveLength(3);
    // Another user id in the same workspace has no grant: nothing, not even the decision.
    expect(await repo.list(first.workspaceId, randomUUID(), {})).toEqual([]);
    // Another workspace sees nothing under RLS.
    expect(await repo.list(randomUUID(), first.userId, {})).toEqual([]);
  });

  it('adds nothing when run again (provisioning, migrations and seed are idempotent)', async () => {
    const again = await prepareLocalDatabase(base!.container.getConnectionUri(), creds, {}, MIGRATIONS_DIR);
    expect(again).toEqual({ provisioned: false, applied: [] });
    const second = await seedLocal({ app, auth });
    expect(second.created).toBe(0);
    expect({ ...second, created: 0 }).toEqual({ ...first, created: 0 });
    const counts = await base!.admin.query<{ n: string; t: string }>(
      `SELECT 'evidence' AS t, count(*) AS n FROM kawalys.evidence UNION ALL SELECT 'projects', count(*) FROM kawalys.projects
       UNION ALL SELECT 'sources', count(*) FROM kawalys.sources UNION ALL SELECT 'investigations', count(*) FROM kawalys.investigations
       UNION ALL SELECT 'users', count(*) FROM kawalys.users UNION ALL SELECT 'audit', count(*) FROM kawalys.audit_events`,
    );
    expect(Object.fromEntries(counts.rows.map((r) => [r.t, Number(r.n)]))).toEqual({
      evidence: 6,
      projects: 1,
      sources: 1,
      investigations: 1,
      users: 1,
      audit: 5,
    });
    const project = await base!.admin.query('SELECT key FROM kawalys.projects');
    expect(project.rows[0].key).toBe(SEED.projectKey);
  });

  it('fails closed for a different owner once the synthetic owner is bound (no second binding, no bypass)', async () => {
    await expect(seedLocal({ app, auth }, { ...LOCAL_SYNTHETIC_OWNER, subject: 'UsomeoneElse0002' })).rejects.toThrow(/could not be bound/);
  });
});

describe('assertLocalAdminUrl', () => {
  it('accepts loopback hosts only', () => {
    expect(() => assertLocalAdminUrl('postgres://a:b@127.0.0.1:55432/kawalys', {})).not.toThrow();
    expect(() => assertLocalAdminUrl('postgres://a:b@localhost:55432/kawalys', {})).not.toThrow();
    expect(() => assertLocalAdminUrl('postgres://a:b@db.example.com:5432/kawalys?sslmode=verify-full', {})).toThrow(/loopback/);
  });

  it('refuses NODE_ENV=production', () => {
    expect(() => assertLocalAdminUrl('postgres://a:b@127.0.0.1:55432/kawalys', { NODE_ENV: 'production' })).toThrow(/production/);
  });
});

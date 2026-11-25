// Local run and synthetic seed data (BACK-61). For a developer's own machine only: a disposable
// Postgres on loopback (docker-compose.local.yml). Never for a provisioned database.
//
// It reuses the operator path (provisionRoles / provisionDatabase, runMigrations) and seeds through
// the production code paths: DatabaseOwnerDirectory binds the owner identity, WorkspaceResolver
// creates the owner workspace, and EvidenceRepository writes projects, sources, evidence and the
// decision. So RLS, grants and audit rows are exercised exactly as at runtime. No auth bypass: the
// BFF still denies every protected route until the owner configures Descope.
//
// Idempotent: every step looks for its own row first, so a second run adds nothing.
// Every value is SYNTHETIC (example-org/demo-storefront); no customer data, no secrets.
import { join } from 'node:path';
import pg from 'pg';
import { postgresUrl } from '../config/database-config';
import { runMigrations } from '../db/migrate';
import { provisionDatabase, provisionRoles, ROLE_APP, ROLE_AUTH, ROLE_MIGRATOR } from '../db/provision';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { DatabaseOwnerDirectory } from '../auth/identity/database-owner-directory';
import type { OwnerIdentity } from '../auth/identity/identity-directory';
import { WorkspaceResolver } from '../auth/workspace-resolver';
import { EvidenceRepository, type ObservationInput } from '../evidence/evidence.repository';
import type { EvidenceRecord } from '../evidence/evidence.types';
import { roleConnectionString } from './db-admin-config';

/** Throwaway role passwords for the disposable local container only (BACK-61). Not secrets. */
export const LOCAL_ROLE_PASSWORDS = {
  migrator: 'kawalys-local-only-migrator',
  app: 'kawalys-local-only-app',
  auth: 'kawalys-local-only-auth',
} as const;

/**
 * Used when KAWALYS_DESCOPE_PROJECT_ID and KAWALYS_OWNER_SUBJECT are not set. Clearly synthetic:
 * no Descope project has this id, so no real token can ever resolve to it.
 */
export const LOCAL_SYNTHETIC_OWNER: OwnerIdentity = {
  providerKey: 'descope',
  issuer: 'https://api.descope.com/v1/apps/PkawalysLocalSeed0001',
  subject: 'UkawalysLocalSeedOwner',
};

export const SEED = {
  projectKey: 'demo-storefront',
  projectName: 'Demo Storefront (synthetic)',
  repository: 'example-org/demo-storefront',
  investigationTitle: 'Checkout build failures on main (synthetic)',
} as const;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Refuses anything but a loopback admin URL outside production: this tool must never touch a real database. */
export function assertLocalAdminUrl(adminUrl: string, env: Readonly<Record<string, string | undefined>>): URL {
  if (env['NODE_ENV'] === 'production') throw new Error('local stack: refused with NODE_ENV=production');
  const url = postgresUrl('KAWALYS_LOCAL_ADMIN_URL', adminUrl);
  if (!LOOPBACK.has(url.hostname)) throw new Error('local stack: the admin URL must point to a loopback host');
  return url;
}

export interface LocalPools {
  readonly app: pg.Pool;
  readonly auth: pg.Pool;
}

/** Roles and schema (only when missing), then pending migrations. Returns the migrations applied now. */
export async function prepareLocalDatabase(
  adminUrl: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  // Evaluated only when omitted (the compiled CommonJS command); tests pass the directory.
  migrationsDir: string = join(__dirname, '..', '..', 'migrations'),
): Promise<{ provisioned: boolean; applied: string[] }> {
  const url = assertLocalAdminUrl(adminUrl, env);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  let provisioned = false;
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE_MIGRATOR]);
    if ((rowCount ?? 0) === 0) {
      await provisionRoles(admin, LOCAL_ROLE_PASSWORDS);
      await provisionDatabase(admin, database);
      provisioned = true;
    }
  } finally {
    await admin.end();
  }
  const migrator = new pg.Pool({ connectionString: roleConnectionString(adminUrl, ROLE_MIGRATOR, LOCAL_ROLE_PASSWORDS.migrator), max: 1 });
  try {
    const applied = await runMigrations(migrator, migrationsDir);
    return { provisioned, applied };
  } finally {
    await migrator.end();
  }
}

/** The runtime connection strings for the BFF (KAWALYS_DATABASE_URL_APP / _AUTH). */
export function localRuntimeUrls(adminUrl: string): { app: string; auth: string } {
  return {
    app: roleConnectionString(adminUrl, ROLE_APP, LOCAL_ROLE_PASSWORDS.app),
    auth: roleConnectionString(adminUrl, ROLE_AUTH, LOCAL_ROLE_PASSWORDS.auth),
  };
}

export interface SeedSummary {
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly sourceId: string;
  readonly investigationId: string;
  /** Evidence rows written by this run (0 on a repeat run). */
  readonly created: number;
  /** What the owner can read back through EvidenceRepository.list, newest first. */
  readonly evidence: readonly EvidenceRecord[];
  readonly auditActions: readonly string[];
}

const MINUTE = 60_000;

/** The synthetic source evidence. source_ref is the idempotency key. */
function observations(sourceId: string, investigationId: string, now: number): ObservationInput[] {
  const repo = SEED.repository;
  return [
    {
      sourceId,
      type: 'Observation',
      state: 'ok',
      sourceRef: `github:${repo}#actions/runs/1001`,
      observedAt: new Date(now - 20 * MINUTE),
      payload: { synthetic: true, kind: 'workflow_run', workflow: 'ci', branch: 'main', conclusion: 'success' },
    },
    {
      sourceId,
      type: 'Observation',
      state: 'stale',
      sourceRef: `github:${repo}#pulls`,
      observedAt: new Date(now - 6 * 60 * MINUTE),
      payload: { synthetic: true, kind: 'pull_requests', open: 4, note: 'last successful sync 6 hours ago' },
    },
    {
      sourceId,
      type: 'Observation',
      state: 'error',
      investigationId,
      sourceRef: `github:${repo}#actions/runs/1002`,
      observedAt: new Date(now - 45 * MINUTE),
      payload: { synthetic: true, kind: 'workflow_run', workflow: 'checkout-e2e', branch: 'main', conclusion: 'failure' },
    },
    {
      sourceId,
      type: 'Observation',
      state: 'unknown',
      sourceRef: `github:${repo}#deployments`,
      observedAt: new Date(now - 30 * MINUTE),
      payload: { synthetic: true, kind: 'deployments', reason: 'not_read_yet' },
    },
    {
      sourceId,
      type: 'Correlation',
      state: 'ok',
      investigationId,
      sourceRef: `github:${repo}#pull/42`,
      observedAt: new Date(now - 40 * MINUTE),
      payload: {
        synthetic: true,
        note: 'checkout-e2e started failing on the first run after pull request #42 merged',
        pullRequest: 42,
      },
    },
  ];
}

/** Seeds the synthetic workspace for `owner`. Safe to run again: existing rows are reused, not duplicated. */
export async function seedLocal(pools: LocalPools, owner: OwnerIdentity = LOCAL_SYNTHETIC_OWNER, now = Date.now()): Promise<SeedSummary> {
  const resolver = new WorkspaceResolver(pools.app, pools.auth);
  const directory = new DatabaseOwnerDirectory(owner, pools.auth, resolver);
  // The same path as a real first sign-in: user, identity link, owner binding, then the owner workspace.
  const user = await directory.resolve(owner);
  if (!user) throw new Error('local seed: the owner identity could not be bound (another owner is already bound; reset the local database)');
  const principal = await resolver.forUser(user.userId);
  if (!principal) throw new Error('local seed: no owner workspace');
  const ws = principal.workspaceId;
  const actor = user.userId;
  const repo = new EvidenceRepository(pools.app);
  const lookup = <T extends pg.QueryResultRow>(sql: string, params: unknown[]) =>
    runWithWorkspaceContext(pools.app, ws, async (c) => (await c.query<T>(sql, params)).rows);

  const projectId =
    (await lookup<{ id: string }>('SELECT id FROM projects WHERE key = $1', [SEED.projectKey]))[0]?.id ??
    (await repo.createProject(ws, actor, { key: SEED.projectKey, name: SEED.projectName }));
  // connectSource is already idempotent for a user with an active grant.
  const sourceId = await repo.connectSource(ws, actor, { projectId, provider: 'github', externalRef: SEED.repository });
  const investigationId =
    (await lookup<{ id: string }>('SELECT id FROM investigations WHERE project_id = $1 AND title = $2', [projectId, SEED.investigationTitle]))[0]?.id ??
    (await repo.createInvestigation(ws, actor, { projectId, title: SEED.investigationTitle }));

  const wanted = observations(sourceId, investigationId, now);
  const present = new Set(
    (await lookup<{ source_ref: string }>('SELECT source_ref FROM evidence WHERE source_id = $1', [sourceId])).map((r) => r.source_ref),
  );
  const missing = wanted.filter((o) => !present.has(o.sourceRef));
  const ingested = missing.length > 0 ? await repo.ingest(ws, missing) : [];

  let created = ingested.length;
  const decisions = await lookup<{ id: string }>(
    `SELECT id FROM evidence WHERE type = 'HumanDecision' AND investigation_id = $1`,
    [investigationId],
  );
  if (decisions.length === 0) {
    const refs = [`github:${SEED.repository}#pull/42`, `github:${SEED.repository}#actions/runs/1002`];
    const cited = await lookup<{ id: string }>('SELECT id FROM evidence WHERE source_id = $1 AND source_ref = ANY($2::text[])', [sourceId, refs]);
    await repo.recordDecision(
      ws,
      actor,
      {
        investigationId,
        decision: 'Revert pull request #42 on main and re-run checkout-e2e',
        rationale: 'Synthetic example: the correlation and the failed run point to #42; a revert is cheap to undo.',
        evidenceIds: cited.map((r) => r.id),
      },
      null,
    );
    created += 1;
  }

  const evidence = await repo.list(ws, actor, { projectId });
  const auditActions = (
    await lookup<{ action: string }>('SELECT action FROM audit_events ORDER BY occurred_at, action', [])
  ).map((r) => r.action);
  return { userId: actor, workspaceId: ws, projectId, sourceId, investigationId, created, evidence, auditActions };
}

/** A short, human-readable summary. Ids and synthetic labels only; never URLs or passwords. */
export function formatSummary(s: SeedSummary): string {
  const lines = [
    `workspace     ${s.workspaceId}`,
    `owner user    ${s.userId}`,
    `project       ${s.projectId}  ${SEED.projectKey}`,
    `source        ${s.sourceId}  github ${SEED.repository}`,
    `investigation ${s.investigationId}  ${SEED.investigationTitle}`,
    `evidence      ${s.evidence.length} visible to the owner (${s.created} created by this run):`,
    ...s.evidence.map((e) => `  ${e.type.padEnd(13)} ${e.state.padEnd(7)} ${e.sourceRef}${e.citations.length ? `  cites ${e.citations.length}` : ''}`),
    `audit rows    ${s.auditActions.length}: ${[...new Set(s.auditActions)].join(', ')}`,
  ];
  return lines.join('\n');
}

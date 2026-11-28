// Activation wiring (BACK-52 slice A): the scheduler inside createApp and the operator connect command, on a real
// PostgreSQL 18.7 in a disposable container. Fakes only: a fake fetch stands in for GitHub, a throwaway key signs the JWT.
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { WorkspaceResolver } from '../../../src/auth/workspace-resolver';
import { DatabaseOwnerDirectory } from '../../../src/auth/identity/database-owner-directory';
import { ConfigError } from '../../../src/config/database-config';
import { type GithubRefreshScheduler } from '../../../src/connectors/github/github.scheduler';
import { createApp } from '../../../src/create-app';
import type { FetchFn } from '../../../src/connectors/github/github.fetch-transport';
import { EvidenceRepository } from '../../../src/evidence/evidence.repository';
import { approvedSourceEntries, configuredApprovalPolicy } from '../../../src/evidence/source-approval';
import { ConnectRefusedError, connectApprovedGithubSources, githubEntriesToConnect } from '../../../src/ops/source-connect';
import { ownerRefreshActor } from '../../../src/connectors/github/github.wiring';
import { OWNER } from '../../auth/_helpers';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../../db/kawalys-db';
import { approveAll } from '../../evidence/approve-all-policy';
import { fakeFetch, json } from './fake-fetch';
import { happyScript, OWNER_REPO, REPO_ID } from './github.fixture';
import { makeTestKey } from './test-key';

const APPROVED = `backstage-os=github:${OWNER_REPO}#${REPO_ID}`;
let db: KawalysDb;
let appPool: pg.Pool;
let authPool: pg.Pool;
let workspaces: WorkspaceResolver;
let pem = '';
let target: { workspaceId: string; actor: string };
const saved: Record<string, string | undefined> = {};
const GITHUB_ENV = ['KAWALYS_GITHUB_APP_ID', 'KAWALYS_GITHUB_INSTALLATION_ID', 'KAWALYS_GITHUB_APP_PRIVATE_KEY', 'KAWALYS_GITHUB_REFRESH_MINUTES', 'KAWALYS_APPROVED_SOURCES'];

const setEnv = (values: Record<string, string>) => {
  for (const k of GITHUB_ENV) delete process.env[k];
  Object.assign(process.env, values);
};
const githubEnv = (over: Record<string, string> = {}) => ({
  KAWALYS_APPROVED_SOURCES: APPROVED,
  KAWALYS_GITHUB_APP_ID: '123',
  KAWALYS_GITHUB_INSTALLATION_ID: '456',
  KAWALYS_GITHUB_APP_PRIVATE_KEY: pem,
  KAWALYS_GITHUB_REFRESH_MINUTES: '15',
  ...over,
});

/** A fake GitHub: the token mint and the three read endpoints. */
function fakeGithub() {
  const body = happyScript();
  return fakeFetch((c) => {
    if (c.url.includes('/access_tokens')) return json(201, { token: 'ghs_TESTTOKEN123', expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    return json(200, (body[new URL(c.url).pathname] as { body: unknown }).body);
  });
}

beforeAll(async () => {
  for (const k of GITHUB_ENV) saved[k] = process.env[k];
  pem = (await makeTestKey()).pem;
  db = await startKawalysDb();
  appPool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
  authPool = new pg.Pool({ connectionString: db.authUrl, max: 4 });
  workspaces = new WorkspaceResolver(appPool, authPool);
  // Bind the owner the way sign-in does, then connect the approved source for them.
  const user = await new DatabaseOwnerDirectory(OWNER, authPool, workspaces).resolve(OWNER);
  const principal = (await workspaces.forUser(user!.userId))!;
  target = { workspaceId: principal.workspaceId, actor: principal.userId };
  const repo = new EvidenceRepository(appPool, approveAll());
  const projectId = await repo.createProject(target.workspaceId, target.actor, { key: 'backstage-os', name: 'Backstage OS' });
  await repo.connectSource(target.workspaceId, target.actor, { projectId, provider: 'github', externalRef: OWNER_REPO });
}, 180_000);

afterAll(async () => {
  for (const k of GITHUB_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await Promise.all([appPool?.end(), authPool?.end()]);
  await stopKawalysDb(db);
}, 60_000);

describe('the scheduler inside createApp', () => {
  const open: INestApplication[] = [];
  const errors: string[] = [];
  let restoreError: () => void = () => undefined;
  beforeEach(() => {
    errors.length = 0;
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.map(String).join(' '));
    restoreError = () => {
      console.error = original;
    };
  });
  afterEach(async () => {
    restoreError();
    while (open.length > 0) await open.pop()!.close().catch(() => undefined);
  });

  // A one-hour interval: the real timer never fires inside a test; runs are driven explicitly with runOnce().
  let created: GithubRefreshScheduler | undefined;
  const boot = async (fetch: FetchFn, withDatabase = true) => {
    created = undefined;
    const github = { fetch, intervalMs: 3_600_000, onScheduler: (s: GithubRefreshScheduler) => (created = s) };
    const app = await createApp([], {}, { ...(withDatabase ? { database: { appPool, authPool } } : {}), github });
    open.push(app);
    return app;
  };
  const OFF_LINE = 'kawalys-bff: KAWALYS_GITHUB_REFRESH_MINUTES is set but the GitHub scheduler is off (database or GitHub App configuration is missing)';

  it('is not created without GitHub App configuration, even with a refresh interval: one fixed line says it is off', async () => {
    setEnv({ KAWALYS_APPROVED_SOURCES: APPROVED, KAWALYS_GITHUB_REFRESH_MINUTES: '15' });
    const f = fakeGithub();
    await boot(f.fetch);
    expect(created).toBeUndefined();
    expect(errors).toEqual([OFF_LINE]);
    expect(f.calls).toHaveLength(0);
  });

  it('is not created without a database (config complete): the same fixed line, no values', async () => {
    setEnv(githubEnv());
    const f = fakeGithub();
    await boot(f.fetch, false);
    expect(created).toBeUndefined();
    expect(errors).toEqual([OFF_LINE]);
    expect(errors.join('\n')).not.toContain('BEGIN');
    expect(f.calls).toHaveLength(0);
  });

  it('is not created without an interval (App configured, no KAWALYS_GITHUB_REFRESH_MINUTES) and says nothing', async () => {
    setEnv(githubEnv({ KAWALYS_GITHUB_REFRESH_MINUTES: '' }));
    await boot(fakeGithub().fetch);
    expect(created).toBeUndefined();
    expect(errors).toEqual([]);
  });

  it('is started with the database, the App settings and an interval: a run refreshes the approved source, and close stops it', async () => {
    setEnv(githubEnv());
    const f = fakeGithub();
    const app = await boot(f.fetch);
    const scheduler = created!;
    expect(scheduler.started).toBe(true);
    expect(errors).toEqual([]);
    expect(await scheduler.runOnce()).toBe('ran');
    expect(f.calls.filter((c) => c.init.method === 'GET')).toHaveLength(3);
    const mint = f.calls.find((c) => c.init.method === 'POST')!;
    expect(mint.url).toBe('https://api.github.com/app/installations/456/access_tokens');
    expect(mint.init.body).toBe(`{"repository_ids":[${REPO_ID}],"permissions":{"metadata":"read","pull_requests":"read","issues":"read"}}`);
    const repo = new EvidenceRepository(appPool, approveAll());
    const stored = await repo.list(target.workspaceId, target.actor, {});
    expect(stored.map((e) => e.sourceRef)).toEqual(expect.arrayContaining([`github:${OWNER_REPO}`, `github:${OWNER_REPO}#pull/12`]));
    await app.close();
    expect(scheduler.started).toBe(false);
  });

  it('asks GitHub for nothing once the owner has revoked the source grant', async () => {
    setEnv(githubEnv());
    const repo = new EvidenceRepository(appPool, approveAll());
    const sourceId = (await repo.githubSourcesForRefresh(target.workspaceId))[0]!.sourceId;
    await repo.disconnectSource(target.workspaceId, target.actor, sourceId);
    const f = fakeGithub();
    await boot(f.fetch);
    expect(await created!.runOnce()).toBe('ran');
    expect(f.calls).toHaveLength(0);
  });

  it('a malformed interval or a partial App configuration stops startup with a ConfigError naming the variable', async () => {
    for (const [over, name] of [
      [{ KAWALYS_GITHUB_REFRESH_MINUTES: '5' }, 'KAWALYS_GITHUB_REFRESH_MINUTES'],
      [{ KAWALYS_GITHUB_REFRESH_MINUTES: 'soon' }, 'KAWALYS_GITHUB_REFRESH_MINUTES'],
      [{ KAWALYS_GITHUB_INSTALLATION_ID: '' }, 'KAWALYS_GITHUB_INSTALLATION_ID'],
    ] as const) {
      setEnv(githubEnv(over));
      const err = await createApp([], {}, { database: { appPool, authPool } }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain(name);
    }
  });
});

describe('source:connect', () => {
  const entries = (value: string) => approvedSourceEntries({ KAWALYS_APPROVED_SOURCES: value });

  it('merges duplicate identities like the policy: an unpinned duplicate plus a pinned one is fine, conflicting pins are a ConfigError', () => {
    expect(githubEntriesToConnect(entries(`p=github:${OWNER_REPO},p=github:${OWNER_REPO}#5`))).toEqual([
      { projectKey: 'p', identity: { provider: 'github', externalRef: OWNER_REPO, repositoryId: 5 } },
    ]);
    expect(githubEntriesToConnect(entries(`p=github:${OWNER_REPO}#5,p=github:${OWNER_REPO}`))).toHaveLength(1);
    expect(() => entries(`p=github:${OWNER_REPO}#5,p=github:${OWNER_REPO}#6`)).toThrow(ConfigError);
    // The same name under two project keys stays two entries.
    expect(entries(`p=github:${OWNER_REPO}#5,q=github:${OWNER_REPO}#5`)).toHaveLength(2);
  });

  it('refuses when there is no github entry, or an entry without a repository id', () => {
    expect(() => githubEntriesToConnect(entries(''))).toThrow(ConnectRefusedError);
    expect(() => githubEntriesToConnect(entries('p=jira:BACK'))).toThrow(ConnectRefusedError);
    expect(() => githubEntriesToConnect(entries(`p=github:${OWNER_REPO}`))).toThrow(/pin its repository id/);
    expect(() => githubEntriesToConnect(entries(`p=github:${OWNER_REPO}#${REPO_ID},q=github:a/b`))).toThrow(ConnectRefusedError);
  });

  it('without an id it connects nothing and creates nothing (refused before any write)', async () => {
    const repo = new EvidenceRepository(appPool, configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: `fresh-key=github:acme/widgets` }));
    await expect(connectApprovedGithubSources({ repo, entries: entries('fresh-key=github:acme/widgets'), target })).rejects.toBeInstanceOf(
      ConnectRefusedError,
    );
    expect(await repo.projectIdByKey(target.workspaceId, 'fresh-key')).toBeNull();
  });

  it('connects the approved source through the BACK-131 policy, creating the project when missing, and is idempotent', async () => {
    const env = { KAWALYS_APPROVED_SOURCES: 'fresh-project=github:acme/widgets#777' };
    const repo = new EvidenceRepository(appPool, configuredApprovalPolicy(env));
    const deps = { repo, entries: approvedSourceEntries(env), target };
    const [first] = await connectApprovedGithubSources(deps);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await repo.projectIdByKey(target.workspaceId, 'fresh-project')).not.toBeNull();
    expect(await connectApprovedGithubSources(deps)).toEqual([first]);
    expect(await repo.hasActiveGrant(target.workspaceId, target.actor, first!)).toBe(true);
    const source = await repo.sourceForRefresh(target.workspaceId, first!);
    expect(source).toMatchObject({ projectKey: 'fresh-project', identity: { provider: 'github', externalRef: 'acme/widgets' } });
  });

  it('refuses an identity the policy does not approve for that project (BACK-131 still decides)', async () => {
    // The entries name acme/other, but the repository's policy only approves acme/widgets for this key.
    const repo = new EvidenceRepository(appPool, configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: 'fresh-project=github:acme/widgets#777' }));
    await expect(connectApprovedGithubSources({ repo, entries: approvedSourceEntries({ KAWALYS_APPROVED_SOURCES: 'fresh-project=github:acme/other#5' }), target })).rejects.toThrow();
  });

  it('finds the bound owner and their workspace, the same way the scheduler does', async () => {
    expect(await ownerRefreshActor(authPool, workspaces)).toEqual(target);
  });
});

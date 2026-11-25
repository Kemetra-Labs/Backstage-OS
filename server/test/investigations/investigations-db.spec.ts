// Investigation reads and the tightened decision write path, on the real store and over HTTP
// (BACK-50 server slice). Disposable Docker Postgres only.
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { createApp } from '../../src/create-app';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { NotVisibleError } from '../../src/evidence/evidence.types';
import { INVESTIGATION_LIMIT, InvestigationRepository } from '../../src/investigations/investigation.repository';
import { FakeIdentityVerifier, OWNER, TOKENS } from '../auth/_helpers';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

const ENV = { KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: OWNER.subject };
const savedEnv: Record<string, string | undefined> = {};

let db: KawalysDb | undefined;
let evidence: EvidenceRepository;
let investigations: InvestigationRepository;
let app: INestApplication;
let pools: pg.Pool[] = [];
let cookie = '';
let ws = '';
let owner = '';
let projectId = '';
let sourceId = '';
let investigationId = '';
let observationId = '';

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  db = await startKawalysDb();
  const appPool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
  const authPool = new pg.Pool({ connectionString: db.authUrl, max: 4 });
  pools = [appPool, authPool];
  app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool, authPool } });
  const res = await request(app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
  expect(res.status).toBe(200);
  cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  const me = (await new WorkspaceResolver(db.app, db.auth).forUser(res.body.user.id as string))!;
  ws = me.workspaceId;
  owner = me.userId;
  evidence = new EvidenceRepository(db.app);
  investigations = new InvestigationRepository(db.app);
  projectId = await evidence.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  sourceId = await evidence.connectSource(ws, owner, { projectId, provider: 'github', externalRef: 'kemetra-labs/backstage-os' });
  investigationId = await evidence.createInvestigation(ws, owner, { projectId, title: 'Build failures' });
  [observationId] = (await evidence.ingest(ws, [
    { sourceId, investigationId, type: 'Observation', state: 'unknown', sourceRef: 'github:kemetra-labs/backstage-os#pull/3', observedAt: new Date('2026-11-25T10:00:00Z'), payload: { reason: 'timeout' } },
  ])) as [string];
}, 180_000);

afterAll(async () => {
  await app?.close().catch(() => undefined);
  await Promise.all(pools.map((p) => p.end().catch(() => undefined)));
  await stopKawalysDb(db);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}, 60_000);

const evidenceRows = (inv: string) =>
  runWithWorkspaceContext(db!.app, ws, async (c) => Number((await c.query<{ n: string }>('SELECT count(*) AS n FROM evidence WHERE investigation_id = $1', [inv])).rows[0]!.n));

/** A project whose only source grant is revoked: it and its investigation no longer exist for the owner. */
async function hiddenInvestigation(key: string): Promise<{ project: string; investigation: string }> {
  const project = await evidence.createProject(ws, owner, { key, name: key });
  const src = await evidence.connectSource(ws, owner, { projectId: project, provider: 'github', externalRef: `kemetra-labs/${key}` });
  const investigation = await evidence.createInvestigation(ws, owner, { projectId: project, title: `In ${key}` });
  await evidence.disconnectSource(ws, owner, src);
  return { project, investigation };
}

describe('visibility', () => {
  it('the owner sees the investigation through a granted source', async () => {
    expect((await investigations.list(ws, owner, {})).map((i) => i.id)).toContain(investigationId);
    expect(await investigations.get(ws, owner, investigationId)).toMatchObject({ id: investigationId, projectId, title: 'Build failures', status: 'open' });
  });

  it('a user with no grant sees nothing', async () => {
    const stranger = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [stranger]);
    expect(await investigations.list(ws, stranger, {})).toEqual([]);
    expect(await investigations.get(ws, stranger, investigationId)).toBeNull();
  });

  it('a revoked grant hides the project and its investigation from list, get and the project filter', async () => {
    const { project, investigation } = await hiddenInvestigation('hidden-a');
    expect((await investigations.list(ws, owner, {})).map((i) => i.id)).not.toContain(investigation);
    expect(await investigations.list(ws, owner, { projectId: project })).toEqual([]);
    expect(await investigations.get(ws, owner, investigation)).toBeNull();
  });

  it("another workspace's investigation never appears", async () => {
    const otherOwner = randomUUID();
    const otherWs = randomUUID();
    await db!.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [otherOwner]);
    await runWithWorkspaceContext(db!.app, otherWs, async (c) => {
      await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [otherWs, otherOwner]);
      await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [otherWs, otherOwner]);
    });
    const theirProject = await evidence.createProject(otherWs, otherOwner, { key: 'theirs', name: 'Theirs' });
    await evidence.connectSource(otherWs, otherOwner, { projectId: theirProject, provider: 'github', externalRef: 'kemetra-labs/theirs' });
    const theirs = await evidence.createInvestigation(otherWs, otherOwner, { projectId: theirProject, title: 'Theirs' });
    expect(await investigations.get(ws, owner, theirs)).toBeNull();
    expect((await investigations.list(ws, owner, {})).map((i) => i.id)).not.toContain(theirs);
  });

  it('the project filter returns that project only; an unknown or malformed id gives []', async () => {
    expect((await investigations.list(ws, owner, { projectId })).every((i) => i.projectId === projectId)).toBe(true);
    expect(await investigations.list(ws, owner, { projectId: '00000000-0000-4000-8000-000000000000' })).toEqual([]);
    expect(await investigations.list(ws, owner, { projectId: 'nope' })).toEqual([]);
  });
});

describe('decisions follow the same visibility (tightened write path)', () => {
  it('a decision on an investigation the decider cannot see is refused and nothing is written', async () => {
    const { investigation } = await hiddenInvestigation('hidden-b');
    const before = await evidenceRows(investigation);
    await expect(
      evidence.recordDecision(ws, owner, { investigationId: investigation, decision: 'x', rationale: 'y', evidenceIds: [] }, null),
    ).rejects.toBeInstanceOf(NotVisibleError);
    expect(await evidenceRows(investigation)).toBe(before);
  });

  it('a decision on a visible investigation still works', async () => {
    const id = await evidence.recordDecision(ws, owner, { investigationId, decision: 'Retry the build', rationale: 'Timeout', evidenceIds: [observationId] }, null);
    expect((await evidence.list(ws, owner, { investigationId })).map((e) => e.id)).toContain(id);
  });
});

describe('the list cap', () => {
  it(`returns at most ${INVESTIGATION_LIMIT} investigations, newest first`, async () => {
    for (let i = 0; i < INVESTIGATION_LIMIT + 2; i++) await evidence.createInvestigation(ws, owner, { projectId, title: `Cap ${i}` });
    const listed = await investigations.list(ws, owner, {});
    expect(listed).toHaveLength(INVESTIGATION_LIMIT);
    const times = listed.map((i) => Date.parse(i.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  }, 120_000);
});

describe('HTTP', () => {
  const server = () => app.getHttpServer();
  const expectNotFound = (res: request.Response) => {
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  };

  it('needs a session; the persona header grants nothing', async () => {
    expectNotFound(await request(server()).get('/investigations'));
    expectNotFound(await request(server()).get('/investigations').set('x-kawalys-demo-persona', 'technical'));
    expectNotFound(await request(server()).get(`/investigations/${investigationId}`));
  });

  it('lists visible investigations over HTTP, filtered by project; another project gives none of them', async () => {
    const res = await request(server()).get('/investigations').query({ projectId }).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const items = res.body.items as { id: string; projectId: string }[];
    expect(items.map((i) => i.id)).toContain(investigationId);
    expect(items.every((i) => i.projectId === projectId)).toBe(true);
    const { project } = await hiddenInvestigation('hidden-e');
    expect((await request(server()).get('/investigations').query({ projectId: project }).set('Cookie', cookie)).body).toEqual({ items: [] });
  });

  it('returns one investigation with its evidence, type and state passed through as badges', async () => {
    const res = await request(server()).get(`/investigations/${investigationId}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: investigationId, projectId, title: 'Build failures', status: 'open' });
    const types = (res.body.evidence as { type: string; state: string; id: string }[]).map((e) => `${e.type}/${e.state}`);
    expect(types).toEqual(expect.arrayContaining(['Observation/unknown', 'HumanDecision/ok']));
  });

  it('404 for an unknown, malformed or invisible id; a repeated filter matches nothing', async () => {
    const { investigation } = await hiddenInvestigation('hidden-c');
    expectNotFound(await request(server()).get('/investigations/00000000-0000-4000-8000-000000000000').set('Cookie', cookie));
    expectNotFound(await request(server()).get('/investigations/not-a-uuid').set('Cookie', cookie));
    expectNotFound(await request(server()).get(`/investigations/${investigation}`).set('Cookie', cookie));
    const repeated = await request(server()).get(`/investigations?projectId=${projectId}&projectId=${projectId}`).set('Cookie', cookie);
    expect(repeated.body).toEqual({ items: [] });
  });

  it('POST a decision on an invisible investigation is 404, the same as GET', async () => {
    const { investigation } = await hiddenInvestigation('hidden-d');
    expectNotFound(await request(server()).post(`/investigations/${investigation}/decisions`).set('Cookie', cookie).send({ decision: 'x', rationale: 'y', evidenceIds: [] }));
    expect(await evidenceRows(investigation)).toBe(0);
  });
});

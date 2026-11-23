// Authorized evidence API on the #76 auth layer with Postgres sessions, and restart persistence
// (BACK-55 S3, gate A). The provider token check is faked (test/auth/_helpers); the owner directory, the
// session store and the evidence store are the real database ones.
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { createApp } from '../../src/create-app';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { FakeIdentityVerifier, OWNER, TOKENS } from '../auth/_helpers';

const COOKIE = '__Host-kawalys_session';
const ENV = { KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: OWNER.subject };

let db: KawalysDb | undefined;
const savedEnv: Record<string, string | undefined> = {};

interface Running {
  app: INestApplication;
  repo: EvidenceRepository;
  stop: () => Promise<void>;
}

/** A fresh process-equivalent: new pools, new Nest app. */
async function boot(): Promise<Running> {
  const appPool = new pg.Pool({ connectionString: db!.appUrl, max: 4 });
  const authPool = new pg.Pool({ connectionString: db!.authUrl, max: 4 });
  const app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool, authPool } });
  return {
    app,
    repo: new EvidenceRepository(appPool),
    stop: async () => {
      await app.close();
      await Promise.all([appPool.end(), authPool.end()]);
    },
  };
}

let first: Running;
let cookie = '';
let me: { userId: string; workspaceId: string };
let investigationId = '';
let observationId = '';

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  db = await startKawalysDb();
  first = await boot();
  const res = await request(first.app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
  expect(res.status).toBe(200);
  cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
  const userId = res.body.user.id as string;
  me = (await new WorkspaceResolver(db.app, db.auth).forUser(userId))!;
  const projectId = await first.repo.createProject(me.workspaceId, me.userId, { key: 'backstage-os', name: 'Backstage OS' });
  const sourceId = await first.repo.connectSource(me.workspaceId, me.userId, { projectId, provider: 'github', externalRef: 'Kemetra-Labs/Backstage-OS' });
  investigationId = await first.repo.createInvestigation(me.workspaceId, me.userId, { projectId, title: 'Build failures' });
  [observationId] = (await first.repo.ingest(me.workspaceId, [
    { sourceId, investigationId, type: 'Observation', state: 'unknown', sourceRef: 'github:Kemetra-Labs/Backstage-OS#pull/3', observedAt: new Date(), payload: { reason: 'http_403' } },
  ])) as [string];
}, 180_000);

afterAll(async () => {
  await first?.stop().catch(() => undefined);
  await stopKawalysDb(db);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}, 60_000);

const server = () => first.app.getHttpServer();
const expectNotFound = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('not_found');
};

describe('sign-in on the database', () => {
  it('gives the configured owner a database user id; strangers get nothing', async () => {
    expect(me.userId).toMatch(/^[0-9a-f-]{36}$/);
    const stranger = await request(server()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.stranger}`);
    expectNotFound(stranger);
    expect(Number((await db!.admin.query('SELECT count(*) AS n FROM kawalys.users')).rows[0].n)).toBe(1);
  });
});

describe('GET /evidence', () => {
  it('needs a session (404 otherwise, persona header ignored)', async () => {
    expectNotFound(await request(server()).get('/evidence'));
    expectNotFound(await request(server()).get('/evidence').set('x-kawalys-demo-persona', 'technical'));
    expectNotFound(await request(server()).get(`/evidence/${observationId}`));
    expectNotFound(await request(server()).get('/evidence').set('Cookie', `${COOKIE}=${'a'.repeat(43)}`));
  });

  it('lists visible evidence by investigation, keeping the unknown state', async () => {
    const res = await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([expect.objectContaining({ id: observationId, type: 'Observation', state: 'unknown' })]);
  });

  it('returns an empty list for an unknown or malformed filter, and 404 for an unknown id', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await request(server()).get('/evidence').query({ projectId: unknown }).set('Cookie', cookie)).body).toEqual({ items: [] });
    expect((await request(server()).get('/evidence').query({ sourceId: 'x' }).set('Cookie', cookie)).body).toEqual({ items: [] });
    expectNotFound(await request(server()).get(`/evidence/${unknown}`).set('Cookie', cookie));
    expectNotFound(await request(server()).get('/evidence/not-a-uuid').set('Cookie', cookie));
  });
});

describe('POST /investigations/:id/decisions', () => {
  const post = (body: unknown, id = investigationId) =>
    request(server()).post(`/investigations/${id}/decisions`).set('Cookie', cookie).send(body as object);

  it('refuses without a session', async () => {
    expectNotFound(await request(server()).post(`/investigations/${investigationId}/decisions`).send({ decision: 'x', rationale: 'y', evidenceIds: [] }));
  });

  it('validates the body', async () => {
    for (const body of [
      {},
      { decision: '', rationale: 'y', evidenceIds: [] },
      { decision: 'x', rationale: 'y', evidenceIds: 'nope' },
      { decision: 'x'.repeat(2001), rationale: 'y', evidenceIds: [] },
      { decision: 'a\u0000b', rationale: 'y', evidenceIds: [] },
      { decision: 'x', rationale: 'lone \uD800 surrogate', evidenceIds: [] },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
  });

  it('returns 404 for an unknown investigation or invisible evidence', async () => {
    expectNotFound(await post({ decision: 'x', rationale: 'y', evidenceIds: [] }, '00000000-0000-4000-8000-000000000000'));
    expectNotFound(await post({ decision: 'x', rationale: 'y', evidenceIds: ['00000000-0000-4000-8000-000000000001'] }));
  });

  it('refuses a cross-site style form post (urlencoded body is never parsed)', async () => {
    const before = (await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie)).body.items.length;
    const res = await request(server())
      .post(`/investigations/${investigationId}/decisions`)
      .set('Cookie', cookie)
      .type('form')
      .send(`decision=a&rationale=b&evidenceIds[0]=${observationId}`);
    expect(res.status).toBe(400);
    expect((await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie)).body.items.length).toBe(before);
  });

  it('records a decision citing visible evidence', async () => {
    const res = await post({ decision: 'Wait for the token fix', rationale: 'Source access was denied', evidenceIds: [observationId] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String) });
  });
});

describe('restart persistence (BACK-55 AC1)', () => {
  it('reads the same evidence, decision and session after a full restart with new pools', async () => {
    const before = (await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie)).body.items;
    expect(before.map((e: { type: string }) => e.type).sort()).toEqual(['HumanDecision', 'Observation']);
    await first.stop();
    first = await boot();
    const after = await request(server()).get('/evidence').query({ investigationId }).set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body.items).toEqual(before);
  });

  it('a signed-out session stays dead after a restart', async () => {
    const res = await request(server()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
    const c = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    expect((await request(server()).delete('/auth/session').set('Cookie', c)).status).toBe(204);
    await first.stop();
    first = await boot();
    expectNotFound(await request(server()).get('/evidence').set('Cookie', c));
  });
});

describe('without the database', () => {
  it('has no evidence routes', async () => {
    const plain = await createApp([], { verifier: new FakeIdentityVerifier() });
    try {
      expectNotFound(await request(plain.getHttpServer()).get('/evidence'));
    } finally {
      await plain.close();
    }
  });
});

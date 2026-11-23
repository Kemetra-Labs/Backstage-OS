// HTTP sign-in, session cookie, guards and non-disclosure (BACK-56, gate A).
import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RequireCapability, CapabilityGuard } from '../../src/auth/capability.guard';
import { DescopeVerifier } from '../../src/auth/descope-verifier';
import { PrincipalResolver } from '../../src/auth/principal-resolver';
import { SessionGuard } from '../../src/auth/session.guard';
import { SessionStore } from '../../src/auth/session-store';
import { createApp } from '../../src/create-app';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { makeSigner, PROJECT_ID, type Signer } from './jwt-fixtures';

const ORIGIN = 'http://127.0.0.1:5173';
const COOKIE = '__Host-kawalys_session';

@Controller('probe')
@UseGuards(SessionGuard, CapabilityGuard)
class ProbeController {
  @Get('read')
  @RequireCapability('evidence.read')
  read() {
    return { ok: true };
  }

  @Get('ingest')
  @RequireCapability('evidence.ingest')
  ingest() {
    return { ok: true };
  }
}

let db: KawalysDb | undefined;
let app: INestApplication;
let signer: Signer;

beforeAll(async () => {
  db = await startKawalysDb();
  signer = await makeSigner();
  app = await createApp([ProbeController], {
    auth: {
      verifier: new DescopeVerifier({ projectId: PROJECT_ID, jwks: signer.jwks }),
      sessions: new SessionStore(db.auth),
      principals: new PrincipalResolver({ authPool: db.auth, appPool: db.app, ownerEmail: 'owner@example.test' }),
      allowedOrigin: ORIGIN,
    },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await stopKawalysDb(db);
}, 60_000);

const ownerToken = () => signer.sign({ sub: 'U-owner-1', email: 'owner@example.test', email_verified: true });
const signIn = async () => {
  const res = await request(app.getHttpServer()).post('/auth/session').set('Origin', ORIGIN).send({ token: await ownerToken() });
  return res;
};
const cookieFrom = (res: request.Response) => {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${COOKIE}=`));
  return raw ? raw.split(';')[0] : undefined;
};
const expectNotFound = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('not_found');
  expect(res.headers['set-cookie']).toBeUndefined();
};

describe('POST /auth/session', () => {
  it('refuses a request without Origin or from another origin', async () => {
    const token = await ownerToken();
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').send({ token }));
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').set('Origin', 'https://evil.example').send({ token }));
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').set('Origin', 'null').send({ token }));
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').set('Origin', `${ORIGIN}/`).send({ token }));
  });

  it('revokes the session the browser already holds when it signs in again (no session pile-up)', async () => {
    const old = cookieFrom(await signIn())!;
    const res = await request(app.getHttpServer()).post('/auth/session').set('Origin', ORIGIN).set('Cookie', old).send({ token: await ownerToken() });
    expect(res.status).toBe(204);
    expectNotFound(await request(app.getHttpServer()).get('/me').set('Cookie', old));
    expect((await request(app.getHttpServer()).get('/me').set('Cookie', cookieFrom(res)!)).status).toBe(200);
  });

  it('refuses an invalid token with the same 404 as an unknown route', async () => {
    const forged = await (await makeSigner()).sign({ email: 'owner@example.test', email_verified: true });
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').set('Origin', ORIGIN).send({ token: forged }));
    expectNotFound(await request(app.getHttpServer()).post('/auth/session').set('Origin', ORIGIN).send({}));
  });

  it('signs the owner in with a host-only, HttpOnly, Secure, SameSite=Strict cookie', async () => {
    const res = await signIn();
    expect(res.status).toBe(204);
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join('\n');
    expect(raw).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict$`));
    expect(res.text).toBe('');
  });
});

describe('session guard and capabilities', () => {
  it('returns 404 for protected routes without a valid session, whatever the persona header says', async () => {
    const server = app.getHttpServer();
    expectNotFound(await request(server).get('/me'));
    expectNotFound(await request(server).get('/me').set('x-kawalys-demo-persona', 'owner'));
    expectNotFound(await request(server).get('/me').set('Cookie', `${COOKIE}=${'a'.repeat(43)}`));
    expectNotFound(await request(server).get('/probe/read').set('x-kawalys-demo-persona', 'technical'));
  });

  it('refuses two session cookies of the same name (cookie tossing)', async () => {
    const good = cookieFrom(await signIn())!;
    expectNotFound(await request(app.getHttpServer()).get('/me').set('Cookie', `${good}; ${COOKIE}=${'b'.repeat(43)}`));
  });

  it('returns the principal for a valid session and enforces capabilities with 404', async () => {
    const cookie = cookieFrom(await signIn())!;
    const me = await request(app.getHttpServer()).get('/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      userId: expect.any(String),
      workspaceId: expect.any(String),
      role: 'owner',
      capabilities: expect.arrayContaining(['evidence.read', 'decision.create']),
    });
    expect((await request(app.getHttpServer()).get('/probe/read').set('Cookie', cookie)).status).toBe(200);
    expectNotFound(await request(app.getHttpServer()).get('/probe/ingest').set('Cookie', cookie));
  });

  it('signs out: revokes the session and clears the cookie', async () => {
    const cookie = cookieFrom(await signIn())!;
    expectNotFound(await request(app.getHttpServer()).post('/auth/signout').set('Cookie', cookie));
    const out = await request(app.getHttpServer()).post('/auth/signout').set('Origin', ORIGIN).set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(([] as string[]).concat(out.headers['set-cookie'] ?? []).join('\n')).toMatch(new RegExp(`^${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict$`));
    expectNotFound(await request(app.getHttpServer()).get('/me').set('Cookie', cookie));
  });
});

describe('without auth configured', () => {
  it('has no auth routes at all (no unauthenticated fallback)', async () => {
    const plain = await createApp();
    try {
      expectNotFound(await request(plain.getHttpServer()).get('/me'));
      expectNotFound(await request(plain.getHttpServer()).post('/auth/session').set('Origin', ORIGIN).send({ token: 'x' }));
    } finally {
      await plain.close();
    }
  });
});

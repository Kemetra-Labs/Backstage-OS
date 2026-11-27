import { jest } from '@jest/globals';
// X02/X04 Task 2: uniform error headers (L2), demo route off with a database (L3), 5xx log line (L6).
import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type pg from 'pg';
import { createApp } from '../../src/create-app';
import { Public } from '../../src/auth/public.decorator';
import { FakeIdentityVerifier, shape, startApp, type TestApp } from '../auth/_helpers';

@Controller()
class BoomController {
  @Public()
  @Get('boom')
  boom(): never {
    throw new Error('secret-detail');
  }
}

const EVIL = 'https://evil.example';
const headersOf = (res: request.Response): Record<string, unknown> => (shape(res) as { headers: Record<string, unknown> }).headers;

describe('error responses are uniform (L2)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('a signed-out 404, an unknown-route 404 and an Origin refusal have identical status, body and headers', async () => {
    const server = t.app.getHttpServer();
    const signedOut = await request(server).get('/demo/evidence/E-1');
    const unknown = await request(server).get('/no-such-route');
    const refused = await request(server).post('/auth/session').set('Origin', EVIL);
    expect(signedOut.status).toBe(404);
    expect(signedOut.headers['cache-control']).toBe('no-store');
    expect(shape(unknown)).toEqual(shape(signedOut));
    expect(shape(refused)).toEqual(shape(signedOut));
  });

  it('OPTIONS reveals nothing more than for an unknown route', async () => {
    const server = t.app.getHttpServer();
    const onRoute = await request(server).options('/demo/evidence/E-1');
    const onAuth = await request(server).options('/auth/session');
    const unknown = await request(server).options('/no-such-route');
    expect(unknown.status).toBe(404);
    expect(shape(onRoute)).toEqual(shape(unknown));
    expect(shape(onAuth)).toEqual(shape(unknown));
    expect(onRoute.headers['allow']).toBeUndefined();
    expect(onRoute.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('every error status carries cache-control: no-store', async () => {
    const server = t.app.getHttpServer();
    const badBody = await request(server).post('/process').set('content-type', 'application/json').send('{"a":');
    expect(badBody.status).toBe(400);
    expect(headersOf(badBody)['cache-control']).toBe('no-store');
  });
});

describe('5xx log line (L6)', () => {
  let app: INestApplication;
  let errorLog: ReturnType<typeof jest.spyOn>;
  beforeAll(async () => {
    app = (await startApp([BoomController])).app;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs exactly one fixed line with the request id and the class name, never the message', async () => {
    const res = await request(app.getHttpServer()).get('/boom').set('x-request-id', 'req-aaaaaaaa');
    expect(res.status).toBe(500);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls[0]).toEqual(['kawalys-bff 5xx request_id=req-aaaaaaaa type=Error']);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret-detail');
  });

  it('logs nothing for a 4xx', async () => {
    await request(app.getHttpServer()).get('/nope');
    await request(app.getHttpServer()).post('/process').set('content-type', 'application/json').send('{"a":');
    expect(errorLog).not.toHaveBeenCalled();
  });
});

function registeredPaths(app: INestApplication): string[] {
  const stack = (app.getHttpAdapter().getInstance() as { router: { stack: { route?: { path: string } }[] } }).router.stack;
  return stack.flatMap((l) => (l.route ? [l.route.path] : []));
}

describe('demo evidence route exists only without a database (L3)', () => {
  const saved = { ...process.env };
  it('without a database the route is registered and answers as before', async () => {
    const t = await startApp();
    try {
      expect(registeredPaths(t.app)).toContain('/demo/evidence/:id');
      expect((await t.get('/demo/evidence/E-1', await t.signIn())).status).toBe(200);
    } finally {
      await t.app.close();
    }
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('with a database configured, GET /demo/evidence/:id is 404 like an unknown route', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['KAWALYS_DESCOPE_PROJECT_ID'] = 'PkawalysTest0001';
    process.env['KAWALYS_OWNER_SUBJECT'] = 'UkawalysOwner0001';
    // Pools are never queried: no request below reaches a repository.
    const pool = { query: () => Promise.reject(new Error('unused')), end: () => Promise.resolve() } as unknown as pg.Pool;
    const app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool: pool, authPool: pool } });
    try {
      const demo = await request(app.getHttpServer()).get('/demo/evidence/E-1');
      const unknown = await request(app.getHttpServer()).get('/no-such-route');
      expect(demo.status).toBe(404);
      expect(shape(demo)).toEqual(shape(unknown));
      // The guard would also answer 404 if the route existed, so check the router itself.
      expect(registeredPaths(app)).not.toContain('/demo/evidence/:id');
    } finally {
      await app.close();
    }
  });
});

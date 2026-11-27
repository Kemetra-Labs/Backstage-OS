import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { originCheck } from '../../src/http/origin-check';
import { shape, startApp, type TestApp } from '../auth/_helpers';

const ALLOWED = 'http://127.0.0.1:4178';
const EVIL = 'https://evil.example';

describe('origin check on the app (development/test: no header = allowed)', () => {
  let t: TestApp;
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    t = await startApp();
    app = t.app;
  });
  beforeEach(async () => {
    cookie = await t.signIn();
  });
  afterAll(async () => {
    await app.close();
  });

  const del = () => request(app.getHttpServer()).delete('/auth/session');
  const stillSignedIn = async () => (await t.get('/auth/me', cookie)).status === 200;

  it('refuses a cross-site Origin with the same envelope as a signed-out 404, and writes nothing', async () => {
    const signedOut = await del();
    const res = await del().set('Cookie', cookie).set('Origin', EVIL);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(shape(res)).toEqual(shape(signedOut));
    expect(await stillSignedIn()).toBe(true); // the session was not revoked: the handler never ran
  });

  it('refuses before the body is parsed (malformed JSON from a foreign Origin is 404, not 400)', async () => {
    const res = await request(app.getHttpServer()).post('/auth/session').set('Origin', EVIL).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(404);
  });

  it('refuses Sec-Fetch-Site cross-site and same-site without an allowlisted Origin', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const res = await del().set('Cookie', cookie).set('Sec-Fetch-Site', site);
      expect(res.status).toBe(404);
      expect(await stillSignedIn()).toBe(true);
    }
    const withEvil = await del().set('Cookie', cookie).set('Sec-Fetch-Site', 'same-site').set('Origin', EVIL);
    expect(withEvil.status).toBe(404);
    expect(await stillSignedIn()).toBe(true);
  });

  it('allows Sec-Fetch-Site same-origin and none', async () => {
    expect((await del().set('Cookie', cookie).set('Sec-Fetch-Site', 'same-origin')).status).toBe(204);
    cookie = await t.signIn();
    expect((await del().set('Cookie', cookie).set('Sec-Fetch-Site', 'none')).status).toBe(204);
  });

  it('allows an allowlisted Origin, even cross-site', async () => {
    const res = await del().set('Cookie', cookie).set('Origin', ALLOWED).set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(204);
  });

  it('does not touch GET', async () => {
    const res = await t.get('/auth/me', cookie).set('Origin', EVIL).set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(200);
  });
});

describe('originCheck middleware, production', () => {
  interface Out { status?: number; body?: unknown; passed: boolean }
  function run(production: boolean, method: string, headers: Record<string, string>): Out {
    const out: Out = { passed: false };
    const res = {
      setHeader: () => undefined,
      status(code: number) {
        out.status = code;
        return { json: (b: unknown) => void (out.body = b) };
      },
    };
    originCheck({ allowed: [ALLOWED], production })({ method, headers }, res, () => void (out.passed = true));
    return out;
  }

  it('refuses a state-changing request with neither header', () => {
    const out = run(true, 'POST', {});
    expect(out.passed).toBe(false);
    expect(out.status).toBe(404);
  });
  it('allows an allowlisted Origin and same-origin', () => {
    expect(run(true, 'POST', { origin: ALLOWED }).passed).toBe(true);
    expect(run(true, 'DELETE', { 'sec-fetch-site': 'same-origin' }).passed).toBe(true);
  });
  it('refuses a foreign Origin and cross-site', () => {
    expect(run(true, 'POST', { origin: EVIL }).passed).toBe(false);
    expect(run(true, 'POST', { 'sec-fetch-site': 'cross-site' }).passed).toBe(false);
  });
  it('never checks GET, HEAD or OPTIONS', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(run(true, m, {}).passed).toBe(true);
  });
  it('outside production allows a request with neither header', () => {
    expect(run(false, 'POST', {}).passed).toBe(true);
  });
});

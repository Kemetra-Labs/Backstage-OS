import { Controller, Get, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AuthConfigError } from '../../src/auth/auth.config';
import { Public } from '../../src/auth/public.decorator';
import { UnconfiguredVerifier } from '../../src/auth/identity/identity-verification.port';
import { SESSION_COOKIE } from '../../src/auth/session/session-cookie';
import { createApp } from '../../src/create-app';
import { OWNER, TOKENS, startApp, shape, FakeIdentityVerifier, type TestApp } from './_helpers';

// No decorator: must be denied purely because the guard is global (deny by default).
@Controller()
class UndecoratedController {
  @Get('undecorated')
  get() {
    return { reached: true };
  }
}

@Controller()
class OpenController {
  @Public()
  @Get('open')
  get() {
    return { open: true };
  }
}

const PERSONA = 'x-kawalys-demo-persona';
const HOUR = 3_600_000;

describe('Kawalys BFF authentication', () => {
  let t: TestApp;
  // Operator-facing error lines are asserted in 'logging'; silence them elsewhere so the output stays clean.
  let errorLog: ReturnType<typeof jest.spyOn>;
  beforeEach(async () => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    t = await startApp([UndecoratedController, OpenController]);
  });
  afterEach(async () => {
    errorLog.mockRestore();
    await t.app.close();
  });

  describe('sign-in exchange', () => {
    it('exchanges the owner provider token for a hardened session cookie', async () => {
      const res = await request(t.app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: 'kawalys-owner', role: 'owner' });
      expect(res.body.expires_at).toBe(new Date(t.clock.t + 8 * HOUR).toISOString());
      expect(res.headers['cache-control']).toBe('no-store');
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      for (const attr of [`${SESSION_COOKIE}=`, 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
        expect(cookie).toContain(attr);
      }
      // neither the provider token nor the subject comes back in the body
      expect(res.text).not.toContain(TOKENS.owner);
      expect(res.text).not.toContain(OWNER.subject);
    });

    it('lets the session read protected routes', async () => {
      const cookie = await t.signIn();
      const me = await t.get('/auth/me', cookie);
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ user: { id: 'kawalys-owner', role: 'owner' } });
      expect(me.headers['cache-control']).toBe('no-store');
      expect((await t.get('/demo/evidence/E-1', cookie)).status).toBe(200);
    });

    it('hands the verifier only the bearer token', async () => {
      await t.signIn();
      expect(t.verifier.seen).toEqual([TOKENS.owner]);
    });
  });

  describe('every failure looks the same', () => {
    it('no credential, bad credentials, outage, a stranger and a foreign issuer all return one identical response', async () => {
      const server = t.app.getHttpServer();
      const attempts: request.Response[] = [
        await request(server).post('/auth/session'),
        await request(server).post('/auth/session').set('Authorization', 'Basic abc'),
        await request(server).post('/auth/session').set('Authorization', 'Bearer not a token'),
        await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.refused}`),
        await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.unavailable}`),
        await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.stranger}`),
        await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.foreignIssuer}`),
        await t.get('/auth/me'),
        await t.get('/demo/evidence/E-1'),
        await t.get('/auth/me', `${SESSION_COOKIE}=${'a'.repeat(43)}`),
      ];
      const expected = shape(attempts[0]!) as { status: number; body: { error: { code: string } } };
      expect(expected.status).toBe(404);
      expect(expected.body.error.code).toBe('not_found');
      for (const res of attempts) {
        expect(shape(res)).toEqual(expected); // status, body and headers, ignoring only request_id and date
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      for (const res of attempts) {
        expect(res.text).not.toContain(OWNER.subject);
        expect(res.text).not.toContain(OWNER.issuer);
        expect(res.text).not.toMatch(/token|session|bearer|owner/i);
      }
    });

    it('an unconfigured deployment denies the real owner and never issues a cookie', async () => {
      const app = await createApp([], { verifier: new UnconfiguredVerifier() });
      const res = await request(app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
      expect(res.status).toBe(404);
      expect(res.headers['set-cookie']).toBeUndefined();
      await app.close();
    });
  });

  describe('deny by default', () => {
    it('denies a controller that has no decorator, until a session exists', async () => {
      expect((await t.get('/undecorated')).status).toBe(404);
      expect((await t.get('/undecorated', await t.signIn())).status).toBe(200);
    });

    it('serves only the routes marked public without a session', async () => {
      expect((await t.get('/open')).status).toBe(200);
      expect((await t.get('/process')).status).toBe(200);
    });

    it('a persona header is never authentication', async () => {
      for (const persona of ['technical', 'owner', 'nontechnical']) {
        const res = await t.get('/demo/evidence/E-1').set(PERSONA, persona);
        expect(res.status).toBe(404);
        expect((await t.get('/auth/me').set(PERSONA, persona)).status).toBe(404);
      }
    });

    it('with a session, the persona header still only decides what is displayed', async () => {
      const cookie = await t.signIn();
      expect((await t.get('/demo/evidence/E-5', cookie).set(PERSONA, 'technical')).status).toBe(200);
      expect((await t.get('/demo/evidence/E-5', cookie).set(PERSONA, 'nontechnical')).status).toBe(404);
    });

    it('does not accept the provider JWT as a session, in a header or in the cookie', async () => {
      expect((await t.get('/auth/me').set('Authorization', `Bearer ${TOKENS.owner}`)).status).toBe(404);
      expect((await t.get('/auth/me', `${SESSION_COOKIE}=${TOKENS.owner}`)).status).toBe(404);
    });

    it('does not accept a session passed in a header or the query string', async () => {
      const cookie = await t.signIn();
      const value = cookie.split('=')[1]!;
      expect((await t.get('/auth/me').set('Authorization', `Bearer ${value}`)).status).toBe(404);
      expect((await t.get(`/auth/me?session=${value}`)).status).toBe(404);
    });

    it('refuses a repeated session cookie even when one value is valid', async () => {
      const cookie = await t.signIn();
      const other = `${SESSION_COOKIE}=${'b'.repeat(43)}`;
      expect((await t.get('/auth/me', `${cookie}; ${other}`)).status).toBe(404);
      expect((await t.get('/auth/me', `${other}; ${cookie}`)).status).toBe(404);
    });
  });

  describe('expiry', () => {
    it('ends at the absolute limit', async () => {
      const cookie = await t.signIn();
      for (let i = 0; i < 7; i++) {
        t.clock.advance(HOUR - 60_000);
        expect((await t.get('/auth/me', cookie)).status).toBe(200);
      }
      t.clock.advance(HOUR);
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
    });

    it('ends after an idle gap', async () => {
      const cookie = await t.signIn();
      t.clock.advance(HOUR + 1);
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
    });
  });

  describe('revocation', () => {
    it('sign-out ends the session, clears the cookie, and a fresh sign-in works again', async () => {
      const cookie = await t.signIn();
      const out = await request(t.app.getHttpServer()).delete('/auth/session').set('Cookie', cookie);
      expect(out.status).toBe(204);
      expect((out.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
      const again = await t.signIn();
      expect(again).not.toBe(cookie);
      expect((await t.get('/auth/me', again)).status).toBe(200);
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
    });

    it('sign-out everywhere ends every session of the owner', async () => {
      const a = await t.signIn();
      const b = await t.signIn();
      const out = await request(t.app.getHttpServer()).delete('/auth/sessions').set('Cookie', a);
      expect(out.status).toBe(204);
      expect((await t.get('/auth/me', a)).status).toBe(404);
      expect((await t.get('/auth/me', b)).status).toBe(404);
    });

    it('sign-out without a session is denied like any other protected route', async () => {
      expect((await request(t.app.getHttpServer()).delete('/auth/sessions')).status).toBe(404);
    });

    it('a session dies when the owner configuration no longer matches, and so does a new sign-in', async () => {
      const cookie = await t.signIn();
      t.directory.owner = { ...OWNER, subject: 'UanotherOwner0003' };
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
      t.directory.owner = OWNER; // even restoring the owner does not revive the revoked session
      expect((await t.get('/auth/me', cookie)).status).toBe(404);
      expect((await t.get('/auth/me', await t.signIn())).status).toBe(200);
    });

    it('a user who is no longer in the directory cannot sign in', async () => {
      t.directory.owner = null;
      const res = await request(t.app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
      expect(res.status).toBe(404);
    });
  });

  describe('logging', () => {
    it('logs only fixed operator lines for an outage, nothing for a refusal, and never a token or subject', async () => {
      const server = t.app.getHttpServer();
      errorLog.mockClear();
      await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.refused}`);
      expect(errorLog).not.toHaveBeenCalled();
      await request(server).post('/auth/session').set('Authorization', `Bearer ${TOKENS.unavailable}`);
      expect(errorLog.mock.calls).toEqual([['identity provider unavailable']]);
      const logged = JSON.stringify(errorLog.mock.calls);
      for (const secret of [TOKENS.unavailable, TOKENS.refused, OWNER.subject]) expect(logged).not.toContain(secret);
    });
  });
});

describe('boot configuration', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('boots unconfigured outside production and denies everything protected', async () => {
    delete process.env['KAWALYS_DESCOPE_PROJECT_ID'];
    delete process.env['KAWALYS_OWNER_SUBJECT'];
    process.env['NODE_ENV'] = 'test';
    const app = await createApp();
    expect((await request(app.getHttpServer()).get('/process')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/demo/evidence/E-1')).status).toBe(404);
    expect((await request(app.getHttpServer()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`)).status).toBe(404);
    await app.close();
  });

  it('refuses to boot in production without the owner and project configuration', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['KAWALYS_DESCOPE_PROJECT_ID'];
    delete process.env['KAWALYS_OWNER_SUBJECT'];
    await expect(createApp()).rejects.toBeInstanceOf(AuthConfigError);
  });

  it('refuses a malformed value even outside production', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['KAWALYS_DESCOPE_PROJECT_ID'] = 'not/a/project';
    await expect(createApp()).rejects.toBeInstanceOf(AuthConfigError);
  });

  it('refuses injected test doubles in production, so a fake verifier can never run there', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['KAWALYS_DESCOPE_PROJECT_ID'] = 'PkawalysTest0001';
    process.env['KAWALYS_OWNER_SUBJECT'] = 'UkawalysOwner0001';
    await expect(createApp([], { verifier: new FakeIdentityVerifier() })).rejects.toBeInstanceOf(AuthConfigError);
  });
});

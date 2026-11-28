// GET /auth/session-state (BACK-127 SEC-02, owner decision E(a)): the read-only session check. It applies the same
// rules as the global AuthGuard but never slides the idle window, so a return-to-tab check cannot extend a session.
// Real Postgres sessions and directory; only the provider token check is faked (test/auth/_helpers).
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { SESSION_COOKIE } from '../../src/auth/session/session-cookie';
import { createApp } from '../../src/create-app';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { FakeIdentityVerifier, OWNER, TOKENS, shape } from './_helpers';

const ENV = { KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001', KAWALYS_OWNER_SUBJECT: OWNER.subject };
const PATH = '/auth/session-state';

let db: KawalysDb | undefined;
let app: INestApplication;
let appPool: pg.Pool;
let authPool: pg.Pool;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  db = await startKawalysDb();
  appPool = new pg.Pool({ connectionString: db.appUrl, max: 4 });
  authPool = new pg.Pool({ connectionString: db.authUrl, max: 4 });
  app = await createApp([], { verifier: new FakeIdentityVerifier() }, { database: { appPool, authPool } });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await Promise.all([appPool?.end(), authPool?.end()]);
  await stopKawalysDb(db);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}, 60_000);

const server = () => app.getHttpServer();
const hashOf = (cookie: string) => createHash('sha256').update(cookie.split('=')[1]!).digest();

async function signIn(): Promise<string> {
  const res = await request(server()).post('/auth/session').set('Authorization', `Bearer ${TOKENS.owner}`);
  expect(res.status).toBe(200);
  return ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
}
const state = (cookie?: string) => {
  const r = request(server()).get(PATH);
  return cookie === undefined ? r : r.set('Cookie', cookie);
};
const lastSeen = async (cookie: string): Promise<number> =>
  Number((await db!.admin.query('SELECT extract(epoch FROM last_seen_at) * 1000 AS ms FROM kawalys.sessions WHERE credential_hash = $1', [hashOf(cookie)])).rows[0].ms);
const setLink = (status: 'disabled' | 'active') =>
  db!.admin.query(
    status === 'disabled'
      ? `UPDATE kawalys.external_identity_links SET status = 'disabled', disabled_at = now()`
      : `UPDATE kawalys.external_identity_links SET status = 'active', disabled_at = NULL`,
  );

describe('GET /auth/session-state', () => {
  it('a live session answers 200 with the owner role, no-store, and never touches last_seen_at', async () => {
    const cookie = await signIn();
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '30 minutes' WHERE credential_hash = $1`, [hashOf(cookie)]);
    const before = await lastSeen(cookie);
    const res = await state(cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('owner');
    expect(typeof res.body.user.id).toBe('string');
    expect(Object.keys(res.body)).toEqual(['user']);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await lastSeen(cookie)).toBe(before);
  });

  it('control: GET /auth/me still slides last_seen_at', async () => {
    const cookie = await signIn();
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '30 minutes' WHERE credential_hash = $1`, [hashOf(cookie)]);
    const before = await lastSeen(cookie);
    expect((await request(server()).get('/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect(await lastSeen(cookie)).toBeGreaterThan(before);
  });

  it('every failure is the same 404 envelope with no-store', async () => {
    const failures: request.Response[] = [await state(), await state(`${SESSION_COOKIE}=not-a-token`), await state(`${SESSION_COOKIE}=${'A'.repeat(43)}`)];

    const revoked = await signIn();
    await request(server()).delete('/auth/session').set('Cookie', revoked);
    failures.push(await state(revoked));

    const expired = await signIn();
    await db!.admin.query(`UPDATE kawalys.sessions SET absolute_expires_at = now() - interval '1 second' WHERE credential_hash = $1`, [hashOf(expired)]);
    failures.push(await state(expired));

    const idle = await signIn();
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '2 hours' WHERE credential_hash = $1`, [hashOf(idle)]);
    failures.push(await state(idle));

    const gone = await signIn();
    await setLink('disabled');
    try {
      failures.push(await state(gone));
    } finally {
      await setLink('active');
    }

    const first = shape(failures[0]!) as { status: number; body: { error: { code: string } }; headers: Record<string, string> };
    expect(first.status).toBe(404);
    expect(first.body.error.code).toBe('not_found');
    expect(first.headers['cache-control']).toBe('no-store');
    for (const f of failures) expect(shape(f)).toEqual(first);
  });

  it('an owner who no longer resolves revokes the session, as the guard does', async () => {
    const cookie = await signIn();
    await setLink('disabled');
    try {
      expect((await state(cookie)).status).toBe(404);
    } finally {
      await setLink('active');
    }
    const row = (await db!.admin.query('SELECT revoked_at FROM kawalys.sessions WHERE credential_hash = $1', [hashOf(cookie)])).rows[0];
    expect(row.revoked_at).not.toBeNull();
  });

  it('cannot be used to extend a session past idle: a check near the edge does not slide the window', async () => {
    const cookie = await signIn();
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '59 minutes' WHERE credential_hash = $1`, [hashOf(cookie)]);
    expect((await state(cookie)).status).toBe(200);
    // Had the check slid the window, two more minutes would still be inside it. It did not: now it is idle.
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = last_seen_at - interval '2 minutes' WHERE credential_hash = $1`, [hashOf(cookie)]);
    expect((await state(cookie)).status).toBe(404);
  });

  it('is rate limited per client at 30 a minute', async () => {
    const cookie = await signIn();
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await state(cookie)).status === 429) limited += 1;
    expect(limited).toBeGreaterThan(0);
  });
});

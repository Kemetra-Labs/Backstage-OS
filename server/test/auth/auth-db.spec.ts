// Sign-in, single-owner bootstrap and sessions against a real Postgres (BACK-56, gate A).
import { createHash } from 'node:crypto';
import { AuthRefused, mayBindOwner, PrincipalResolver } from '../../src/auth/principal-resolver';
import { SessionStore } from '../../src/auth/session-store';
import type { VerifiedSubject } from '../../src/auth/identity-provider.port';
import { verifyRuntimeRole } from '../../src/db/runtime-role';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { sqlState } from '../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';

let db: KawalysDb | undefined;
let resolver: PrincipalResolver;
let sessions: SessionStore;
const OWNER_EMAIL = 'owner@example.test';
const ISS = 'https://api.descope.com/v1/apps/P2testproject0001';

const subject = (sub: string, email: string | null = OWNER_EMAIL, emailVerified = true): VerifiedSubject => ({
  providerKey: 'descope',
  issuer: ISS,
  subject: sub,
  email,
  emailVerified,
});

beforeAll(async () => {
  db = await startKawalysDb();
  resolver = new PrincipalResolver({ authPool: db.auth, appPool: db.app, ownerEmail: 'Owner@Example.test' });
  sessions = new SessionStore(db.auth);
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const count = async (sql: string) => Number((await db!.admin.query(sql)).rows[0].n);

describe('owner sign-in (single owner, Personal Alpha)', () => {
  it('refuses an unverified or missing email before any owner exists', async () => {
    await expect(resolver.signIn(subject('U-x', OWNER_EMAIL, false))).rejects.toBeInstanceOf(AuthRefused);
    await expect(resolver.signIn(subject('U-x', null))).rejects.toBeInstanceOf(AuthRefused);
    await expect(resolver.signIn(subject('U-x', 'someone@example.test'))).rejects.toBeInstanceOf(AuthRefused);
    expect(await count('SELECT count(*) AS n FROM kawalys.users')).toBe(0);
  });

  it('only one of two concurrent first sign-ins can become the owner', async () => {
    const results = await Promise.allSettled([resolver.signIn(subject('U-owner-1')), resolver.signIn(subject('U-rival-2'))]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    expect(await count('SELECT count(*) AS n FROM kawalys.owner_binding')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM kawalys.external_identity_links')).toBe(1);
  });

  it('binds the owner once: user, identity link, workspace, membership and one audit row', async () => {
    const binding = (await db!.admin.query('SELECT l.subject, b.user_id, b.owner_workspace_id AS workspace_id FROM kawalys.owner_binding b JOIN kawalys.external_identity_links l ON l.user_id = b.user_id')).rows[0];
    const p = await resolver.signIn(subject(binding.subject));
    expect(p).toMatchObject({ userId: binding.user_id, workspaceId: binding.workspace_id, role: 'owner' });
    expect(p.capabilities).toContain('evidence.read');
    expect(p.capabilities).not.toContain('evidence.ingest');
    const inWs = await runWithWorkspaceContext(db!.app, p.workspaceId, async (c) => ({
      ws: (await c.query('SELECT count(*) AS n FROM workspaces')).rows[0].n,
      members: (await c.query(`SELECT count(*) AS n FROM memberships WHERE user_id = $1 AND role = 'owner'`, [p.userId])).rows[0].n,
      audit: (await c.query(`SELECT count(*) AS n FROM audit_events WHERE action = 'owner.bound'`)).rows[0].n,
    }));
    expect(inWs).toEqual({ ws: '1', members: '1', audit: '1' });
  });

  it('a later sign-in of the same subject resolves the same principal, even without an email claim', async () => {
    const { subject: sub } = (await db!.admin.query('SELECT subject FROM kawalys.external_identity_links')).rows[0];
    const a = await resolver.signIn(subject(sub));
    const b = await resolver.signIn(subject(sub, null, false));
    expect(b).toEqual(a);
  });

  it('refuses any other subject once the owner is bound, even with the owner email', async () => {
    await expect(resolver.signIn(subject('U-intruder-3'))).rejects.toBeInstanceOf(AuthRefused);
    expect(await count('SELECT count(*) AS n FROM kawalys.users')).toBe(1);
  });

  it('refuses a disabled identity link and a disabled user', async () => {
    const { subject: sub, user_id } = (await db!.admin.query('SELECT subject, user_id FROM kawalys.external_identity_links')).rows[0];
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'disabled', disabled_at = now()`);
    await expect(resolver.signIn(subject(sub))).rejects.toBeInstanceOf(AuthRefused);
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'active', disabled_at = NULL`);
    await db!.admin.query(`UPDATE kawalys.users SET status = 'disabled' WHERE id = $1`, [user_id]);
    await expect(resolver.signIn(subject(sub))).rejects.toBeInstanceOf(AuthRefused);
    await expect(resolver.forUser(user_id)).resolves.toBeNull();
    await db!.admin.query(`UPDATE kawalys.users SET status = 'active' WHERE id = $1`, [user_id]);
  });
});

describe('owner subject pin (KAWALYS_OWNER_SUBJECT)', () => {
  it('when configured, only that exact subject may bind, even with the verified owner email', () => {
    expect(mayBindOwner(subject('U-pinned'), OWNER_EMAIL, 'U-pinned')).toBe(true);
    expect(mayBindOwner(subject('U-not-pinned'), OWNER_EMAIL, 'U-pinned')).toBe(false);
    expect(mayBindOwner(subject('U-any'), OWNER_EMAIL, undefined)).toBe(true);
    expect(mayBindOwner(subject('U-any', OWNER_EMAIL, false), OWNER_EMAIL, undefined)).toBe(false);
    expect(mayBindOwner(subject('U-pinned', 'other@example.test'), OWNER_EMAIL, 'U-pinned')).toBe(false);
    expect(() => new PrincipalResolver({ authPool: db!.auth, appPool: db!.app, ownerEmail: OWNER_EMAIL, ownerSubject: '' })).toThrow(/subject/);
  });
});

describe('sessions', () => {
  let userId = '';
  beforeAll(async () => {
    userId = (await db!.admin.query('SELECT user_id FROM kawalys.owner_binding')).rows[0].user_id;
  });

  it('stores only a SHA-256 hash of an opaque 256-bit token', async () => {
    const { token, sessionId } = await sessions.create(userId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = (await db!.admin.query('SELECT credential_hash FROM kawalys.sessions WHERE id = $1', [sessionId])).rows[0];
    expect(Buffer.from(row.credential_hash).equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(JSON.stringify(row)).not.toContain(token);
    await expect(sessions.findActive(token)).resolves.toEqual({ sessionId, userId });
  });

  it('refuses a revoked, an absolutely expired and an idle session', async () => {
    const revoked = await sessions.create(userId);
    await sessions.revoke(revoked.sessionId);
    await expect(sessions.findActive(revoked.token)).resolves.toBeNull();

    const expired = await sessions.create(userId);
    await db!.admin.query(`UPDATE kawalys.sessions SET absolute_expires_at = now() - interval '1 second' WHERE id = $1`, [expired.sessionId]);
    await expect(sessions.findActive(expired.token)).resolves.toBeNull();

    const idle = await sessions.create(userId);
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '13 hours' WHERE id = $1`, [idle.sessionId]);
    await expect(sessions.findActive(idle.token)).resolves.toBeNull();
  });

  it('refuses a session of a disabled user', async () => {
    const s = await sessions.create(userId);
    await db!.admin.query(`UPDATE kawalys.users SET status = 'disabled' WHERE id = $1`, [userId]);
    await expect(sessions.findActive(s.token)).resolves.toBeNull();
    await db!.admin.query(`UPDATE kawalys.users SET status = 'active' WHERE id = $1`, [userId]);
  });

  it('refuses a session once the user’s identity link is disabled', async () => {
    const s = await sessions.create(userId);
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'disabled', disabled_at = now()`);
    await expect(sessions.findActive(s.token)).resolves.toBeNull();
    await expect(resolver.forUser(userId)).resolves.toBeNull();
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'active', disabled_at = NULL`);
  });

  it('bounds sessions in the database: lifetime cap, one-way revocation, no future activity', async () => {
    const lifetime = await db!.auth
      .query(`INSERT INTO kawalys.sessions (user_id, credential_hash, absolute_expires_at) VALUES ($1, $2, now() + interval '30 days')`, [
        userId,
        Buffer.alloc(32, 7),
      ])
      .catch((e: unknown) => e);
    expect(sqlState(lifetime)).toBe('23514');
    const s = await sessions.create(userId);
    await sessions.revoke(s.sessionId);
    const unrevoke = await db!.auth.query('UPDATE kawalys.sessions SET revoked_at = NULL WHERE id = $1', [s.sessionId]).catch((e: unknown) => e);
    expect(sqlState(unrevoke)).toBe('42501');
    const live = await sessions.create(userId);
    const future = await db!.auth
      .query(`UPDATE kawalys.sessions SET last_seen_at = now() + interval '1 day' WHERE id = $1`, [live.sessionId])
      .catch((e: unknown) => e);
    expect(sqlState(future)).toBe('42501');
  });

  it('returns null for malformed tokens', async () => {
    for (const t of ['', 'short', 'x'.repeat(43) + '=', "' OR 1=1 --".padEnd(43, 'a')]) {
      await expect(sessions.findActive(t)).resolves.toBeNull();
    }
  });
});

describe('kawalys_auth role', () => {
  it('passes the runtime role check', async () => {
    await expect(verifyRuntimeRole(db!.auth, 'kawalys_auth')).resolves.toBeUndefined();
  });

  it('has no access to workspace tables, and cannot rewrite identity links or session hashes', async () => {
    for (const sql of [
      'SELECT 1 FROM kawalys.workspaces',
      'SELECT 1 FROM kawalys.memberships',
      'SELECT 1 FROM kawalys.audit_events',
      `UPDATE kawalys.sessions SET absolute_expires_at = now() + interval '1 year'`,
      'UPDATE kawalys.sessions SET user_id = user_id',
      `UPDATE kawalys.external_identity_links SET user_id = user_id`,
      `UPDATE kawalys.sessions SET credential_hash = credential_hash`,
      'DELETE FROM kawalys.sessions',
      'DELETE FROM kawalys.owner_binding',
    ]) {
      const err = await db!.auth.query(sql).catch((e: unknown) => e);
      expect(sqlState(err)).toBe('42501');
    }
  });
});

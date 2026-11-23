// Durable owner identity and sessions behind the #76 auth ports (BACK-56 on BACK-55, gate A).
import { createHash } from 'node:crypto';
import pg from 'pg';
import { DatabaseOwnerDirectory } from '../../src/auth/identity/database-owner-directory';
import { PostgresSessionStore } from '../../src/auth/session/postgres-session-store';
import { SessionService } from '../../src/auth/session/session.service';
import { WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { verifyRuntimeRole } from '../../src/db/runtime-role';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { sqlState } from '../db/pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { OWNER } from './_helpers';

let db: KawalysDb | undefined;
let workspaces: WorkspaceResolver;
let directory: DatabaseOwnerDirectory;
const POLICY = { absoluteTtlMs: 8 * 3600_000, idleTtlMs: 3600_000 };

beforeAll(async () => {
  db = await startKawalysDb();
  workspaces = new WorkspaceResolver(db.app, db.auth);
  directory = new DatabaseOwnerDirectory(OWNER, db.auth, workspaces);
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const count = async (sql: string) => Number((await db!.admin.query(sql)).rows[0].n);

describe('DatabaseOwnerDirectory (owner = the configured identity)', () => {
  it('resolves nobody but the configured triple, and creates nothing for strangers', async () => {
    await expect(directory.resolve({ ...OWNER, subject: 'UsomeoneElse0002' })).resolves.toBeNull();
    await expect(directory.resolve({ ...OWNER, issuer: 'https://api.descope.com/v1/apps/P2rtProject0001' })).resolves.toBeNull();
    await expect(new DatabaseOwnerDirectory(null, db!.auth, workspaces).resolve(OWNER)).resolves.toBeNull();
    expect(await count('SELECT count(*) AS n FROM kawalys.users')).toBe(0);
  });

  it('binds the owner exactly once, even for concurrent first sign-ins', async () => {
    const [a, b] = await Promise.all([directory.resolve(OWNER), directory.resolve(OWNER)]);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(a!.role).toBe('owner');
    expect(a!.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await count('SELECT count(*) AS n FROM kawalys.users')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM kawalys.owner_binding')).toBe(1);
  });

  it('creates the owner workspace, membership and one audit row', async () => {
    const p = await workspaces.forUser((await directory.resolve(OWNER))!.userId);
    expect(p).toMatchObject({ role: 'owner' });
    expect(p!.capabilities).toContain('evidence.read');
    expect(p!.capabilities).not.toContain('evidence.ingest');
    const inWs = await runWithWorkspaceContext(db!.app, p!.workspaceId, async (c) => ({
      members: (await c.query(`SELECT count(*) AS n FROM memberships WHERE user_id = $1`, [p!.userId])).rows[0].n,
      audit: (await c.query(`SELECT count(*) AS n FROM audit_events WHERE action = 'owner.bound'`)).rows[0].n,
    }));
    expect(inWs).toEqual({ members: '1', audit: '1' });
  });

  it('fails closed when the configured owner changes after binding', async () => {
    const changed = new DatabaseOwnerDirectory({ ...OWNER, subject: 'UnewOwner0003' }, db!.auth, workspaces);
    await expect(changed.resolve({ ...OWNER, subject: 'UnewOwner0003' })).resolves.toBeNull();
    expect(await count('SELECT count(*) AS n FROM kawalys.users')).toBe(1);
  });

  it('refuses a disabled identity link or user', async () => {
    const { userId } = (await directory.resolve(OWNER))!;
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'disabled', disabled_at = now()`);
    await expect(directory.resolve(OWNER)).resolves.toBeNull();
    await expect(workspaces.forUser(userId)).resolves.toBeNull();
    await db!.admin.query(`UPDATE kawalys.external_identity_links SET status = 'active', disabled_at = NULL`);
    await db!.admin.query(`UPDATE kawalys.users SET status = 'disabled' WHERE id = $1`, [userId]);
    await expect(directory.resolve(OWNER)).resolves.toBeNull();
    await db!.admin.query(`UPDATE kawalys.users SET status = 'active' WHERE id = $1`, [userId]);
  });

  it('has no workspace for a non-database user id (the in-memory owner id)', async () => {
    await expect(workspaces.forUser('kawalys-owner')).resolves.toBeNull();
  });
});

describe('PostgresSessionStore behind SessionService', () => {
  let sessions: SessionService;
  let userId = '';
  beforeAll(async () => {
    sessions = new SessionService(new PostgresSessionStore(db!.auth), Date.now, POLICY);
    userId = (await directory.resolve(OWNER))!.userId;
  });

  it('stores only the SHA-256 of the token, with the verified triple', async () => {
    const issued = await sessions.issue({ userId, role: 'owner' }, OWNER);
    const row = (await db!.admin.query('SELECT * FROM kawalys.sessions WHERE credential_hash = $1', [createHash('sha256').update(issued.rawToken).digest()])).rows[0];
    expect(row).toMatchObject({ user_id: userId, provider_key: OWNER.providerKey, issuer: OWNER.issuer, subject: OWNER.subject });
    expect(JSON.stringify(row)).not.toContain(issued.rawToken);
    const live = await sessions.authenticate(issued.rawToken);
    expect(live).toMatchObject({ userId, subject: OWNER });
  });

  it('survives a restart: a new pool and store read the same session', async () => {
    const issued = await sessions.issue({ userId, role: 'owner' }, OWNER);
    const pool = new pg.Pool({ connectionString: db!.authUrl, max: 1 });
    try {
      const fresh = new SessionService(new PostgresSessionStore(pool), Date.now, POLICY);
      await expect(fresh.authenticate(issued.rawToken)).resolves.toMatchObject({ userId });
    } finally {
      await pool.end();
    }
  });

  it('ends revoked, absolutely expired and idle sessions; revokeAllForUser counts', async () => {
    const r = await sessions.issue({ userId, role: 'owner' }, OWNER);
    expect(await sessions.revoke(r.rawToken)).toBe(true);
    await expect(sessions.authenticate(r.rawToken)).resolves.toBeNull();

    const expired = await sessions.issue({ userId, role: 'owner' }, OWNER);
    await db!.admin.query(`UPDATE kawalys.sessions SET absolute_expires_at = now() - interval '1 second' WHERE credential_hash = $1`, [
      createHash('sha256').update(expired.rawToken).digest(),
    ]);
    await expect(sessions.authenticate(expired.rawToken)).resolves.toBeNull();

    const idle = await sessions.issue({ userId, role: 'owner' }, OWNER);
    await db!.admin.query(`UPDATE kawalys.sessions SET last_seen_at = now() - interval '2 hours' WHERE credential_hash = $1`, [
      createHash('sha256').update(idle.rawToken).digest(),
    ]);
    await expect(sessions.authenticate(idle.rawToken)).resolves.toBeNull();

    await sessions.issue({ userId, role: 'owner' }, OWNER);
    expect(await sessions.revokeAllForUser(userId)).toBeGreaterThan(0);
    expect(await sessions.revokeAllForUser('kawalys-owner')).toBe(0);
  });

  it('never returns a session past its database expiry, even if the app clock runs behind', async () => {
    const behind = new SessionService(new PostgresSessionStore(db!.auth), () => Date.now() - 3 * 3600_000, POLICY);
    const s = await sessions.issue({ userId, role: 'owner' }, OWNER);
    await db!.admin.query(`UPDATE kawalys.sessions SET absolute_expires_at = now() - interval '1 second' WHERE credential_hash = $1`, [
      createHash('sha256').update(s.rawToken).digest(),
    ]);
    await expect(behind.authenticate(s.rawToken)).resolves.toBeNull();
  });

  it('refuses to store a session for a non-database user id', async () => {
    await expect(sessions.issue({ userId: 'kawalys-owner', role: 'owner' }, OWNER)).rejects.toThrow(/user id/);
  });

  it('bounds sessions in the database: lifetime cap, one-way revocation, no future activity', async () => {
    const lifetime = await db!.auth
      .query(
        `INSERT INTO kawalys.sessions (user_id, credential_hash, absolute_expires_at, provider_key, issuer, subject)
         VALUES ($1, $2, now() + interval '30 days', 'descope', 'i', 's')`,
        [userId, Buffer.alloc(32, 7)],
      )
      .catch((e: unknown) => e);
    expect(sqlState(lifetime)).toBe('23514');
    const futureInsert = await db!.auth
      .query(
        `INSERT INTO kawalys.sessions (user_id, credential_hash, absolute_expires_at, last_seen_at, provider_key, issuer, subject)
         VALUES ($1, $2, now() + interval '1 hour', now() + interval '1 day', 'descope', 'i', 's')`,
        [userId, Buffer.alloc(32, 8)],
      )
      .catch((e: unknown) => e);
    expect(sqlState(futureInsert)).toBe('42501');
    const s = await sessions.issue({ userId, role: 'owner' }, OWNER);
    const hash = createHash('sha256').update(s.rawToken).digest();
    await sessions.revoke(s.rawToken);
    expect(sqlState(await db!.auth.query('UPDATE kawalys.sessions SET revoked_at = NULL WHERE credential_hash = $1', [hash]).catch((e: unknown) => e))).toBe('42501');
    const live = await sessions.issue({ userId, role: 'owner' }, OWNER);
    const future = await db!.auth
      .query(`UPDATE kawalys.sessions SET last_seen_at = now() + interval '1 day' WHERE credential_hash = $1`, [
        createHash('sha256').update(live.rawToken).digest(),
      ])
      .catch((e: unknown) => e);
    expect(sqlState(future)).toBe('42501');
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
      expect(sqlState(await db!.auth.query(sql).catch((e: unknown) => e))).toBe('42501');
    }
  });
});

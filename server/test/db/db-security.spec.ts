// Security-negative tests for the Kawalys database foundation (BACK-55, gate A).
// Every isolation assertion connects as `kawalys_app` (NOSUPERUSER, NOBYPASSRLS, owns nothing).
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { insertAuditRowInTransaction } from '../../src/audit/audit-row.writer';
import { verifyRuntimeRole } from '../../src/db/runtime-role';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { sqlState } from './pg-container';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from './kawalys-db';

let db: KawalysDb | undefined;
const userA = randomUUID();
const userB = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

async function seedWorkspace(ws: string, user: string): Promise<void> {
  await runWithWorkspaceContext(db!.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, user]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, user]);
  });
}

beforeAll(async () => {
  db = await startKawalysDb();
  // Global identity rows are seeded by the admin: the app role has no grant on `users` in S1.
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [userA, userB]);
  await seedWorkspace(wsA, userA);
  await seedWorkspace(wsB, userB);
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

const countIn = async (ws: string, table: string) =>
  runWithWorkspaceContext(db!.app, ws, async (c) => Number((await c.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n));

describe('workspace isolation as kawalys_app', () => {
  it('sees only the current workspace', async () => {
    const seen = await runWithWorkspaceContext(db!.app, wsA, async (c) => ({
      workspaces: (await c.query('SELECT id FROM workspaces')).rows.map((r) => r.id),
      members: (await c.query('SELECT workspace_id FROM memberships')).rows.map((r) => r.workspace_id),
      other: (await c.query('SELECT id FROM workspaces WHERE id = $1', [wsB])).rowCount,
    }));
    expect(seen).toEqual({ workspaces: [wsA], members: [wsA], other: 0 });
  });

  it('sees nothing without a workspace context (fail closed)', async () => {
    const { rows } = await db!.app.query('SELECT (SELECT count(*) FROM workspaces) AS w, (SELECT count(*) FROM memberships) AS m');
    expect(rows[0]).toEqual({ w: '0', m: '0' });
  });

  it('refuses to write a row into another workspace', async () => {
    const attempt = runWithWorkspaceContext(db!.app, wsA, (c) =>
      c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [wsB, userA]),
    );
    await expect(attempt).rejects.toMatchObject({ code: '42501' });
    expect(await countIn(wsB, 'memberships')).toBe(1);
  });

  it('has no access to the global identity tables', async () => {
    for (const table of ['users', 'external_identity_links', 'sessions', 'schema_migrations']) {
      const err = await db!.app.query(`SELECT 1 FROM ${table} LIMIT 1`).catch((e: unknown) => e);
      expect(sqlState(err)).toBe('42501');
    }
  });

  it('cannot update or delete workspace rows (no grant)', async () => {
    for (const sql of ['UPDATE workspaces SET kind = kind', 'DELETE FROM memberships']) {
      const err = await runWithWorkspaceContext(db!.app, wsA, (c) => c.query(sql)).catch((e: unknown) => e);
      expect(sqlState(err)).toBe('42501');
    }
  });
});

describe('runWithWorkspaceContext', () => {
  it('does not leak the workspace to the next user of a pooled connection', async () => {
    const single = new pg.Pool({ connectionString: db!.appUrl, max: 1 });
    try {
      await runWithWorkspaceContext(single, wsA, (c) => c.query('SELECT 1'));
      const { rows } = await single.query(
        `SELECT nullif(current_setting('app.current_workspace', true), '') AS ws, (SELECT count(*) FROM workspaces) AS n`,
      );
      expect(rows[0]).toEqual({ ws: null, n: '0' });
    } finally {
      await single.end();
    }
  });

  it('rolls back, rethrows and releases the client when the work fails', async () => {
    const before = await countIn(wsA, 'audit_events');
    const attempt = runWithWorkspaceContext(db!.app, wsA, async (c) => {
      await insertAuditRowInTransaction(c, audit(wsA, userA));
      throw new Error('boom');
    });
    await expect(attempt).rejects.toThrow('boom');
    expect(await countIn(wsA, 'audit_events')).toBe(before);
    expect(db!.app.idleCount).toBe(db!.app.totalCount);
  });

  it('rejects a workspace id that is not a UUID before touching the database', async () => {
    let called = false;
    const attempt = runWithWorkspaceContext(db!.app, "x' OR true --", async () => {
      called = true;
    });
    await expect(attempt).rejects.toThrow(/UUID/);
    expect(called).toBe(false);
  });

  it('clears a session-level workspace that the work set, before the connection is reused', async () => {
    const single = new pg.Pool({ connectionString: db!.appUrl, max: 1 });
    try {
      await runWithWorkspaceContext(single, wsA, (c) => c.query(`SELECT set_config('app.current_workspace', $1, false)`, [wsB]));
      const { rows } = await single.query(
        `SELECT nullif(current_setting('app.current_workspace', true), '') AS ws, (SELECT count(*) FROM workspaces) AS n`,
      );
      expect(rows[0]).toEqual({ ws: null, n: '0' });
    } finally {
      await single.end();
    }
  });

  it('discards the connection after a failure instead of returning it to the pool', async () => {
    const single = new pg.Pool({ connectionString: db!.appUrl, max: 1 });
    try {
      const pid = async () => (await single.query('SELECT pg_backend_pid() AS p')).rows[0].p as number;
      const before = await pid();
      await runWithWorkspaceContext(single, wsA, async () => {
        throw new Error('boom');
      }).catch(() => undefined);
      expect(await pid()).not.toBe(before);
    } finally {
      await single.end();
    }
  });
});

describe('verifyRuntimeRole', () => {
  const pools: pg.Pool[] = [];
  const pool = (url: string) => {
    const p = new pg.Pool({ connectionString: url, max: 1 });
    pools.push(p);
    return p;
  };
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it('accepts kawalys_app', async () => {
    await expect(verifyRuntimeRole(db!.app, 'kawalys_app')).resolves.toBeUndefined();
  });

  it('refuses a role name other than the expected one', async () => {
    await expect(verifyRuntimeRole(db!.app, 'kawalys_other')).rejects.toThrow(/expected role/);
  });

  it('refuses a superuser', async () => {
    await expect(verifyRuntimeRole(db!.admin, 'test')).rejects.toThrow(/superuser/);
  });

  it('refuses a role that owns schema objects (the migrator)', async () => {
    const { rows } = await db!.admin.query(
      `SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'kawalys' AND pg_get_userbyid(c.relowner) = 'kawalys_migrator') AS n`,
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
    await expect(verifyRuntimeRole(db!.migrator, 'kawalys_migrator')).rejects.toThrow(/owns/);
  });

  it('refuses a BYPASSRLS role', async () => {
    await db!.admin.query(`CREATE ROLE kw_bypass LOGIN NOSUPERUSER BYPASSRLS PASSWORD 'kw-bypass-test-only'`);
    await db!.admin.query('GRANT CONNECT ON DATABASE kawalys TO kw_bypass');
    await expect(verifyRuntimeRole(pool(db!.urlFor('kw_bypass', 'kw-bypass-test-only')), 'kw_bypass')).rejects.toThrow(/BYPASSRLS/);
  });

  const testRole = async (name: string, attrs: string, extra: string[] = []): Promise<pg.Pool> => {
    await db!.admin.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS ${attrs} PASSWORD 'kw-test-only-pw'`);
    await db!.admin.query(`GRANT CONNECT ON DATABASE kawalys TO ${name}`);
    for (const sql of extra) await db!.admin.query(sql);
    return pool(db!.urlFor(name, 'kw-test-only-pw'));
  };

  it('refuses a role that is a member of another role (SET ROLE escalation)', async () => {
    const p = await testRole('kw_member', '', ['GRANT kawalys_migrator TO kw_member']);
    await expect(verifyRuntimeRole(p, 'kw_member')).rejects.toThrow(/member of/);
  });

  it('refuses CREATEROLE, CREATEDB and REPLICATION roles', async () => {
    for (const [name, attr] of [
      ['kw_createrole', 'CREATEROLE'],
      ['kw_createdb', 'CREATEDB'],
      ['kw_replication', 'REPLICATION'],
    ] as const) {
      const p = await testRole(name, attr);
      await expect(verifyRuntimeRole(p, name)).rejects.toThrow(new RegExp(attr));
    }
  });

  it('refuses a role with a stored default for app.current_workspace', async () => {
    const p = await testRole('kw_guc', '', [`ALTER ROLE kw_guc SET app.current_workspace = '${wsA}'`]);
    await expect(verifyRuntimeRole(p, 'kw_guc')).rejects.toThrow(/default/);
  });

  it('stores the runtime password as a SCRAM verifier', async () => {
    const { rows } = await db!.admin.query(`SELECT rolpassword FROM pg_authid WHERE rolname = 'kawalys_app'`);
    expect(String(rows[0].rolpassword)).toMatch(/^SCRAM-SHA-256\$4096:/);
  });

  it('refuses a login that switches role through connection options', async () => {
    const c = db!.container;
    const switched = pool(db!.urlFor(c.getUsername(), c.getPassword(), 'kawalys', '-c role=kawalys_app'));
    await expect(verifyRuntimeRole(switched, 'kawalys_app')).rejects.toThrow(/session_user/);
  });
});

function audit(ws: string, actor: string) {
  return { workspaceId: ws, actorUserId: actor, action: 'test.event', targetType: 'workspace', targetId: ws, requestId: null, metadata: {} };
}

describe('audit_events', () => {
  it('writes an audit row inside the workspace transaction, visible only there', async () => {
    await runWithWorkspaceContext(db!.app, wsA, (c) => insertAuditRowInTransaction(c, audit(wsA, userA)));
    const inA = await runWithWorkspaceContext(db!.app, wsA, async (c) =>
      Number((await c.query(`SELECT count(*) AS n FROM audit_events WHERE action = 'test.event'`)).rows[0].n),
    );
    const inB = await runWithWorkspaceContext(db!.app, wsB, async (c) =>
      Number((await c.query(`SELECT count(*) AS n FROM audit_events WHERE action = 'test.event'`)).rows[0].n),
    );
    expect(inA).toBeGreaterThan(0);
    expect(inB).toBe(0);
  });

  it('refuses an audit row for another workspace', async () => {
    const attempt = runWithWorkspaceContext(db!.app, wsA, (c) => insertAuditRowInTransaction(c, audit(wsB, userB)));
    await expect(attempt).rejects.toMatchObject({ code: '42501' });
  });

  it('does not let the app choose the audit id or timestamp', async () => {
    const err = await runWithWorkspaceContext(db!.app, wsA, (c) =>
      c.query(
        `INSERT INTO audit_events (workspace_id, action, target_type, target_id, occurred_at) VALUES ($1, 'x.y', 'workspace', $1, now() - interval '1 year')`,
        [wsA],
      ),
    ).catch((e: unknown) => e);
    expect(sqlState(err)).toBe('42501');
  });

  it('still refuses changes when a superuser sets session_replication_role = replica', async () => {
    await runWithWorkspaceContext(db!.app, wsA, (c) => insertAuditRowInTransaction(c, audit(wsA, userA)));
    const client = await db!.admin.connect();
    try {
      await client.query('SET session_replication_role = replica');
      for (const sql of [`UPDATE kawalys.audit_events SET action = 'tampered'`, 'DELETE FROM kawalys.audit_events', 'TRUNCATE kawalys.audit_events']) {
        const err = await client.query(sql).catch((e: unknown) => e);
        expect(sqlState(err)).toBe('42501');
      }
    } finally {
      await client.query('RESET session_replication_role').catch(() => undefined);
      client.release();
    }
  });

  it('is append-only under the default replication role, including for a superuser', async () => {
    // Statement-level triggers make this independent of whether rows exist.
    for (const sql of [
      `UPDATE kawalys.audit_events SET action = 'tampered'`,
      'DELETE FROM kawalys.audit_events',
      'TRUNCATE kawalys.audit_events',
    ]) {
      const err = await db!.admin.query(sql).catch((e: unknown) => e);
      expect(sqlState(err)).toBe('42501');
      expect(String((err as Error).message)).toMatch(/append-only/);
    }
  });
});

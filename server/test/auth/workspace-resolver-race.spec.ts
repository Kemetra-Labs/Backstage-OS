// WorkspaceResolver first-use race (BACK-56 on BACK-55). Under READ COMMITTED every statement takes a
// fresh snapshot, so a concurrent first sign-in could read "no membership", then see the winner's
// committed workspace, and fail closed with null. These tests force that interleaving deterministically
// with a test-only pool wrapper, and keep fail-closed for a genuinely inconsistent workspace.
// Each describe binds the singleton owner, so each gets its own disposable database.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { WorkspaceResolver } from '../../src/auth/workspace-resolver';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { OWNER } from './_helpers';

/** Binds the configured owner the way DatabaseOwnerDirectory.bind does; no workspace exists yet. */
async function bindOwner(auth: pg.Pool): Promise<{ userId: string; workspaceId: string }> {
  const userId = (await auth.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0]!.id;
  await auth.query('INSERT INTO external_identity_links (provider_key, issuer, subject, user_id) VALUES ($1, $2, $3, $4)', [
    OWNER.providerKey,
    OWNER.issuer,
    OWNER.subject,
    userId,
  ]);
  const workspaceId = randomUUID();
  await auth.query('INSERT INTO owner_binding (user_id, owner_workspace_id) VALUES ($1, $2)', [userId, workspaceId]);
  return { userId, workspaceId };
}

/**
 * Test-only: wraps a pool so the first client that is about to run `pauseBefore` stops there until
 * `release()` is called. Every other query, and every later client, runs untouched.
 */
function pausingPool(pool: pg.Pool, pauseBefore: RegExp) {
  let reachedResolve!: () => void;
  let releaseResolve!: () => void;
  const reached = new Promise<void>((r) => (reachedResolve = r));
  const released = new Promise<void>((r) => (releaseResolve = r));
  let used = false;
  const wrapped = {
    connect: async () => {
      const client = await pool.connect();
      const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
      return new Proxy(client, {
        get(target, prop, receiver) {
          if (prop !== 'query') return Reflect.get(target, prop, receiver);
          return async (...args: unknown[]) => {
            if (!used && typeof args[0] === 'string' && pauseBefore.test(args[0])) {
              used = true;
              reachedResolve();
              await released;
            }
            return query(...args);
          };
        },
      });
    },
  } as unknown as pg.Pool;
  return { pool: wrapped, reached, release: () => releaseResolve(), wasPaused: () => used };
}

describe('WorkspaceResolver: concurrent first use', () => {
  let db: KawalysDb | undefined;
  beforeAll(async () => {
    db = await startKawalysDb();
  }, 180_000);
  afterAll(async () => {
    await stopKawalysDb(db);
  }, 60_000);

  it('returns the owner to the caller that loses the race, instead of failing closed', async () => {
    const { userId, workspaceId } = await bindOwner(db!.auth);
    // B has already read "no membership"; it pauses before checking whether the workspace exists.
    const gate = pausingPool(db!.app, /^SELECT 1 FROM workspaces/);
    const loser = new WorkspaceResolver(gate.pool, db!.auth).forUser(userId);
    await Promise.race([
      gate.reached,
      loser.then((v) => {
        throw new Error(`loser settled before pausing: ${JSON.stringify(v)}`);
      }),
    ]);
    // A creates and commits the workspace, membership and audit row in that window.
    const winner = await new WorkspaceResolver(db!.app, db!.auth).forUser(userId);
    expect(winner).toMatchObject({ userId, workspaceId, role: 'owner' });
    gate.release();
    await expect(loser).resolves.toEqual(winner);
    expect(gate.wasPaused()).toBe(true);
    const audit = await runWithWorkspaceContext(db!.app, workspaceId, async (c) =>
      Number((await c.query(`SELECT count(*) AS n FROM audit_events WHERE action = 'owner.bound'`)).rows[0].n),
    );
    expect(audit).toBe(1);
  });
});

describe('WorkspaceResolver: inconsistent workspace', () => {
  let db: KawalysDb | undefined;
  beforeAll(async () => {
    db = await startKawalysDb();
  }, 180_000);
  afterAll(async () => {
    await stopKawalysDb(db);
  }, 60_000);

  it('fails closed when the bound workspace exists with no membership for the owner', async () => {
    const { userId, workspaceId } = await bindOwner(db!.auth);
    await runWithWorkspaceContext(db!.app, workspaceId, (c) =>
      c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [workspaceId, userId]),
    );
    await expect(new WorkspaceResolver(db!.app, db!.auth).forUser(userId)).resolves.toBeNull();
    const members = await runWithWorkspaceContext(db!.app, workspaceId, async (c) =>
      Number((await c.query('SELECT count(*) AS n FROM memberships')).rows[0].n),
    );
    expect(members).toBe(0);
  });
});

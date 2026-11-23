// runWithWorkspaceContext: the only way runtime code touches workspace-scoped tables (BACK-55).
// Adapted from Retail Tower services/backend-core/packages/db/src/middleware/tenant-context.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: the GUC is `app.current_workspace`; there is no platform-admin flag and no
// NIL-UUID sentinel, so there is no bypass path at all.
//
// Why a transaction: set_config(name, value, is_local := true) lasts only until COMMIT or
// ROLLBACK, so a pooled connection never carries the workspace into the next request.
// The caller must not issue BEGIN / COMMIT / ROLLBACK inside `work`.
import type pg from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runWithWorkspaceContext<T>(
  pool: pg.Pool,
  workspaceId: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
    throw new TypeError('runWithWorkspaceContext: workspaceId must be a UUID');
  }
  const client = await pool.connect();
  let result: T;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_workspace', $1, true)`, [workspaceId]);
    result = await work(client);
    await client.query('COMMIT');
    // `work` holds the raw client and could have set the GUC at session level; clear it.
    await client.query('RESET app.current_workspace');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Never return a connection in an unknown state to the pool: destroy it.
    client.release(err instanceof Error ? err : new Error('runWithWorkspaceContext failed'));
    throw err;
  }
  client.release();
  return result;
}

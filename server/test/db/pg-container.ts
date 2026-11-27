// Test-only helper: one disposable PostgreSQL container per test file (BACK-55, gate A).
// The container user is a SUPERUSER. Use it only for setup and for checks that must
// hold even for a superuser; every isolation assertion must run as `kawalys_app`.
// There is deliberately no "skip when Docker is missing" switch: no Docker, no pass.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

// BACK-113: PostgreSQL 18.7 is the owner-approved baseline (2026-11-27). Exact tag: no silent substitution;
// pg-version.spec.ts proves the running server really is 18.7.
export const PG_IMAGE = 'postgres:18.7-alpine';

export interface PgContainer {
  readonly container: StartedPostgreSqlContainer;
  readonly admin: pg.Pool;
  urlFor(user: string, password: string, database?: string, options?: string): string;
}

export async function startPgContainer(): Promise<PgContainer> {
  const container = await new PostgreSqlContainer(PG_IMAGE).withDatabase('kawalys').start();
  const host = container.getHost();
  const port = container.getPort();
  const admin = new pg.Pool({ connectionString: container.getConnectionUri(), max: 4 });
  const urlFor = (user: string, password: string, database = 'kawalys', options?: string): string => {
    const base = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    return options === undefined ? base : `${base}?options=${encodeURIComponent(options)}`;
  };
  return { container, admin, urlFor };
}

export async function stopPgContainer(env: PgContainer | undefined): Promise<void> {
  if (!env) return;
  await env.admin.end();
  await env.container.stop();
}

/** Run `work` in a transaction that is always rolled back. */
export async function inRolledBackTx<T>(pool: pg.Pool, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await work(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** The SQLSTATE of a pg error, or undefined. */
export function sqlState(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}

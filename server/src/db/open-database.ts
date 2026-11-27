// Opens the two database logins and checks each before anything is served (BACK-55).
import pg from 'pg';
import type { DatabaseConfig } from '../config/database-config';
import { ROLE_APP, ROLE_AUTH } from './provision';
import { verifyRuntimeRole } from './runtime-role';

export interface OpenDatabase {
  readonly appPool: pg.Pool;
  readonly authPool: pg.Pool;
  close(): Promise<void>;
}

// Close idle connections after 10 s so a serverless Postgres (Neon) can suspend between requests (BACK-115).
export const POOL_IDLE_TIMEOUT_MS = 10_000;

function pool(connectionString: string, max: number): pg.Pool {
  const p = new pg.Pool({ connectionString, max, idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS });
  // node-postgres emits 'error' when an idle client's backend goes away (for example a serverless database
  // scaling to zero). Without a listener Node crashes and prints the raw error. The pool already discards
  // that client; a fixed line is enough.
  p.on('error', () => {
    console.error('kawalys-bff: an idle database connection was closed');
  });
  return p;
}

export async function openDatabase(config: DatabaseConfig): Promise<OpenDatabase> {
  const appPool = pool(config.appUrl, 10);
  const authPool = pool(config.authUrl, 5);
  const close = async () => {
    await Promise.allSettled([appPool.end(), authPool.end()]);
  };
  try {
    await verifyRuntimeRole(appPool, ROLE_APP);
    await verifyRuntimeRole(authPool, ROLE_AUTH);
  } catch (err) {
    await close();
    throw err;
  }
  return { appPool, authPool, close };
}

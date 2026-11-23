// Test-only: a provisioned and migrated Kawalys database in a disposable container.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { provisionDatabase, provisionRoles, ROLE_APP, ROLE_MIGRATOR } from '../../src/db/provision';
import { startPgContainer, stopPgContainer, type PgContainer } from './pg-container';

export const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

export interface KawalysDb extends PgContainer {
  readonly migrator: pg.Pool;
  readonly app: pg.Pool;
  readonly appUrl: string;
  readonly appPassword: string;
}

export async function startKawalysDb(): Promise<KawalysDb> {
  const base = await startPgContainer();
  const passwords = { migrator: randomBytes(18).toString('hex'), app: randomBytes(18).toString('hex') };
  await provisionRoles(base.admin, passwords);
  await provisionDatabase(base.admin, 'kawalys');
  const migrator = new pg.Pool({ connectionString: base.urlFor(ROLE_MIGRATOR, passwords.migrator), max: 2 });
  await runMigrations(migrator, MIGRATIONS_DIR);
  const appUrl = base.urlFor(ROLE_APP, passwords.app);
  const app = new pg.Pool({ connectionString: appUrl, max: 4 });
  return { ...base, migrator, app, appUrl, appPassword: passwords.app };
}

export async function stopKawalysDb(db: KawalysDb | undefined): Promise<void> {
  if (!db) return;
  await db.app.end();
  await db.migrator.end();
  await stopPgContainer(db);
}

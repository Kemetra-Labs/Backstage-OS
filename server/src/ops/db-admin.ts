// Operator command (BACK-55): provision roles and schema, then run migrations, on the DIRECT endpoint.
//   node dist/ops/db-admin.js provision [--apply] [--plaintext-passwords]
//       roles, database grants, schema (admin login). Neon refuses pre-hashed passwords: pass --plaintext-passwords.
//   node dist/ops/db-admin.js migrate   [--apply]   migrations, as kawalys_migrator
// Without --apply it only prints what it would do. Run by a person, never by the service.
// Output names roles, the database and file names only: never URLs or passwords.
import { join } from 'node:path';
import pg from 'pg';
import { loadOperatorConfig } from './db-admin-config';
import { provisionDatabase, provisionRoles, ROLE_MIGRATOR } from '../db/provision';
import { runMigrations } from '../db/migrate';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

function asRole(adminUrl: string, role: string, password: string): string {
  const url = new URL(adminUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...flags] = argv;
  const apply = flags.includes('--apply');
  if (command !== 'provision' && command !== 'migrate') throw new Error('usage: db-admin <provision|migrate> [--apply]');
  const cfg = loadOperatorConfig(process.env);
  if (!apply) {
    console.log(`dry run: would ${command} database "${cfg.database}" (roles: ${ROLE_MIGRATOR}, kawalys_app, kawalys_auth). Add --apply.`);
    return;
  }
  if (command === 'provision') {
    const admin = new pg.Pool({ connectionString: cfg.adminUrl, max: 1 });
    try {
      await provisionRoles(admin, cfg.passwords, { passwordFormat: flags.includes('--plaintext-passwords') ? 'plaintext' : 'scram' });
      await provisionDatabase(admin, cfg.database);
      console.log('provisioned roles and schema kawalys');
    } finally {
      await admin.end();
    }
    return;
  }
  const migrator = new pg.Pool({ connectionString: asRole(cfg.adminUrl, ROLE_MIGRATOR, cfg.passwords.migrator), max: 1 });
  try {
    const done = await runMigrations(migrator, MIGRATIONS_DIR);
    console.log(done.length === 0 ? 'no pending migrations' : `applied: ${done.join(', ')}`);
  } finally {
    await migrator.end();
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(`db-admin: ${err instanceof Error ? err.message : 'failed'}`);
  process.exitCode = 1;
});

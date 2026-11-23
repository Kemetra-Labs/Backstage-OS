// Role and schema provisioning for the Kawalys database (BACK-55).
// Run ONCE by an operator with an admin login, before the first migration; never by the
// running service. Retail Tower `docs/operations/database-roles.md` is the REFERENCE
// pattern (separate migration and runtime roles, no superuser at runtime).
//
//   kawalys_migrator  owns schema `kawalys` and every table; runs migrations only.
//   kawalys_app       runtime DML; NOSUPERUSER, NOBYPASSRLS, owns nothing, so FORCE RLS applies.
//
// Passwords never reach the server: the caller's password is turned into a SCRAM-SHA-256
// verifier here, and only the verifier is sent (DDL can appear in server logs or
// pg_stat_statements). The verifier is quoted server-side with format(%L).
//
// Open for gate B (not proven here): provisioning as a NON-superuser admin (Neon's owner
// role) may need that admin to hold SET on kawalys_migrator for CREATE SCHEMA ... AUTHORIZATION
// and ALTER DEFAULT PRIVILEGES. The tests provision as a real superuser only.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import type pg from 'pg';

export const SCHEMA = 'kawalys';
export const ROLE_MIGRATOR = 'kawalys_migrator';
export const ROLE_APP = 'kawalys_app';

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

const ROLE_ATTRS = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION';

async function execFormatted(db: Queryable, template: string, ...args: string[]): Promise<void> {
  const { rows } = await db.query<{ sql: string }>(`SELECT format($1::text, ${args.map((_, i) => `$${i + 2}::text`).join(', ')}) AS sql`, [
    template,
    ...args,
  ]);
  await db.query(rows[0]!.sql);
}

const SCRAM_ITERATIONS = 4096;
// Printable ASCII only, so PostgreSQL's SASLprep leaves the password unchanged.
const SAFE_PASSWORD = /^[\x21-\x7e]{16,}$/;

/** PostgreSQL SCRAM-SHA-256 verifier (RFC 5802 / RFC 7677), as stored in pg_authid.rolpassword. */
export function scramSha256Verifier(password: string): string {
  if (!SAFE_PASSWORD.test(password)) {
    throw new Error('password must be at least 16 printable ASCII characters');
  }
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/** Cluster level: create both login roles. */
export async function provisionRoles(admin: Queryable, passwords: { migrator: string; app: string }): Promise<void> {
  for (const [role, password] of [
    [ROLE_MIGRATOR, passwords.migrator],
    [ROLE_APP, passwords.app],
  ] as const) {
    await execFormatted(admin, `CREATE ROLE %I ${ROLE_ATTRS} PASSWORD %L`, role, scramSha256Verifier(password));
    // pg_catalog first, so nothing in the kawalys schema can shadow a built-in.
    await execFormatted(admin, 'ALTER ROLE %I SET search_path = pg_catalog, %I', role, SCHEMA);
  }
}

/** Database level: run while connected to the target database as an admin. */
export async function provisionDatabase(admin: Queryable, database: string): Promise<void> {
  await execFormatted(admin, 'REVOKE ALL ON DATABASE %I FROM PUBLIC', database);
  await execFormatted(admin, 'GRANT CONNECT ON DATABASE %I TO %I, %I', database, ROLE_MIGRATOR, ROLE_APP);
  await admin.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  await execFormatted(admin, 'CREATE SCHEMA %I AUTHORIZATION %I', SCHEMA, ROLE_MIGRATOR);
  await execFormatted(admin, 'REVOKE ALL ON SCHEMA %I FROM PUBLIC', SCHEMA);
  await execFormatted(admin, 'GRANT USAGE ON SCHEMA %I TO %I', SCHEMA, ROLE_APP);
  // Functions are EXECUTE-able by PUBLIC by default; migrations grant explicitly instead.
  await execFormatted(admin, 'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', ROLE_MIGRATOR);
}

// BACK-114: provision and migrate as a NON-superuser admin shaped like Neon's owner role
// (LOGIN CREATEROLE BYPASSRLS NOSUPERUSER, owns the database), on the PostgreSQL 18.7 baseline.
// BACK-55 proved this only by hand on a Neon PG17 branch; every other container test provisions as
// the superuser. Plaintext passwords, because Neon refuses pre-hashed ones. No Neon is touched.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { provisionDatabase, provisionRoles, ROLE_APP, ROLE_AUTH, ROLE_MIGRATOR } from '../../src/db/provision';
import { verifyRuntimeRole } from '../../src/db/runtime-role';
import { MIGRATIONS_DIR } from './kawalys-db';
import { startPgContainer, stopPgContainer, type PgContainer } from './pg-container';

const OWNER = 'kw_managed_owner';
const DB = 'kawalys_managed';

describe('provisioning as a managed-provider owner role, not a superuser (BACK-114)', () => {
  let env: PgContainer | undefined;
  const pools: pg.Pool[] = [];
  const pool = (url: string, max = 2): pg.Pool => {
    const p = new pg.Pool({ connectionString: url, max });
    pools.push(p);
    return p;
  };
  const pw = (): string => randomBytes(18).toString('hex');
  const ownerPw = pw();
  const passwords = { migrator: pw(), app: pw(), auth: pw() };
  let migrated: string[] = [];

  beforeAll(async () => {
    env = await startPgContainer();
    // Superuser setup only: create the owner the way Neon does, then step away from the superuser.
    await env.admin.query(`CREATE ROLE ${OWNER} LOGIN CREATEROLE BYPASSRLS NOSUPERUSER PASSWORD '${ownerPw}'`);
    await env.admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER}`);

    const owner = pool(env.urlFor(OWNER, ownerPw, DB));
    await provisionRoles(owner, passwords, { passwordFormat: 'plaintext' });
    await provisionDatabase(owner, DB);
    migrated = await runMigrations(pool(env.urlFor(ROLE_MIGRATOR, passwords.migrator, DB)), MIGRATIONS_DIR);
  }, 180_000);

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
    await stopPgContainer(env);
  });

  it('the admin really is not a superuser', async () => {
    const owner = pool(env!.urlFor(OWNER, ownerPw, DB));
    const { rows } = await owner.query<{ s: boolean }>('SELECT rolsuper AS s FROM pg_roles WHERE rolname = current_user');
    expect(rows[0]!.s).toBe(false);
  });

  it('applies every migration as kawalys_migrator', () => {
    expect(migrated.length).toBeGreaterThan(0);
  });

  it('the runtime logins pass the boot role check', async () => {
    await expect(verifyRuntimeRole(pool(env!.urlFor(ROLE_APP, passwords.app, DB)), ROLE_APP)).resolves.not.toThrow();
    await expect(verifyRuntimeRole(pool(env!.urlFor(ROLE_AUTH, passwords.auth, DB)), ROLE_AUTH)).resolves.not.toThrow();
  });

  it('kawalys_app cannot create objects or become the migrator', async () => {
    const app = pool(env!.urlFor(ROLE_APP, passwords.app, DB));
    await expect(app.query('CREATE TABLE kawalys.kw_probe (x int)')).rejects.toMatchObject({ code: '42501' });
    await expect(app.query(`SET ROLE ${ROLE_MIGRATOR}`)).rejects.toMatchObject({ code: '42501' });
  });

  it('the schema belongs to the migrator, not to the admin', async () => {
    const owner = pool(env!.urlFor(OWNER, ownerPw, DB));
    const { rows } = await owner.query<{ o: string }>(
      "SELECT pg_get_userbyid(nspowner) AS o FROM pg_namespace WHERE nspname = 'kawalys'",
    );
    expect(rows[0]!.o).toBe(ROLE_MIGRATOR);
  });
});

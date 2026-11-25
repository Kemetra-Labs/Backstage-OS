// Developer command (BACK-61): `npm run local:up` builds, then runs this.
//   node dist/ops/local-up.js
// Starts docker-compose.local.yml, provisions the disposable loopback Postgres (roles only when missing), applies
// migrations and seeds SYNTHETIC data through the repository layer. Safe to run again. Refuses any non-loopback
// host and NODE_ENV=production. Passwords are random per machine (local-credentials.ts, gitignored file, 0600);
// none is hard-coded.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import pg from 'pg';
import { loadAuthConfig } from '../auth/auth.config';
import { loadOrCreateLocalCredentials } from './local-credentials';
import { formatSummary, LOCAL_SYNTHETIC_OWNER, localRuntimeUrls, prepareLocalDatabase, seedLocal } from './local-stack';

/** Matches docker-compose.local.yml. Loopback only. */
const LOCAL_ADMIN = { user: 'kawalys_local_admin', database: 'kawalys' } as const;
const SERVER_DIR = join(__dirname, '..', '..');
/** Fixed install locations only, never a PATH lookup; KAWALYS_DOCKER_BIN may name another absolute path. */
const DOCKER_CANDIDATES = ['/usr/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker', 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'];

function dockerBinary(env: NodeJS.ProcessEnv): string {
  const override = (env['KAWALYS_DOCKER_BIN'] ?? '').trim();
  if (override) {
    if (!isAbsolute(override) || !existsSync(override)) throw new Error('KAWALYS_DOCKER_BIN must be an absolute path to an existing docker binary');
    return override;
  }
  const found = DOCKER_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error(`docker not found in ${DOCKER_CANDIDATES.join(', ')}; set KAWALYS_DOCKER_BIN to its absolute path`);
  return found;
}

export const LOCAL_CREDENTIALS_FILE = join(SERVER_DIR, '.local-stack', 'credentials.json');

async function main(): Promise<void> {
  const port = (process.env['KAWALYS_LOCAL_PG_PORT'] ?? '').trim() || '55432';
  if (!/^\d{2,5}$/.test(port)) throw new Error('KAWALYS_LOCAL_PG_PORT must be a port number');
  if (process.env['NODE_ENV'] === 'production') throw new Error('refusing to run with NODE_ENV=production');
  const creds = loadOrCreateLocalCredentials(LOCAL_CREDENTIALS_FILE);
  // No shell: the password reaches compose only through this child's environment.
  execFileSync(dockerBinary(process.env), ['compose', '-f', 'docker-compose.local.yml', 'up', '-d', '--wait'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: { ...process.env, KAWALYS_LOCAL_PG_PASSWORD: creds.admin },
  });
  const adminUrl = `postgres://${LOCAL_ADMIN.user}:${encodeURIComponent(creds.admin)}@127.0.0.1:${port}/${LOCAL_ADMIN.database}`;

  const { provisioned, applied } = await prepareLocalDatabase(adminUrl, creds);
  console.log(provisioned ? 'provisioned roles kawalys_migrator, kawalys_app, kawalys_auth and schema kawalys' : 'roles already provisioned');
  console.log(applied.length === 0 ? 'no pending migrations' : `applied: ${applied.join(', ')}`);

  // With the owner's Descope settings in the environment, seed for that owner, so a later lab sign-in sees the data.
  const configured = loadAuthConfig(process.env).owner;
  const urls = localRuntimeUrls(adminUrl, creds);
  const app = new pg.Pool({ connectionString: urls.app, max: 2 });
  const auth = new pg.Pool({ connectionString: urls.auth, max: 2 });
  try {
    const summary = await seedLocal({ app, auth }, configured ?? LOCAL_SYNTHETIC_OWNER);
    console.log(`seeded for ${configured ? 'the configured Descope owner' : 'the synthetic local owner (no Descope configured)'}:`);
    console.log(formatSummary(summary));
  } finally {
    await Promise.allSettled([app.end(), auth.end()]);
  }
  console.log(`\nRun the BFF against it (local passwords from ${LOCAL_CREDENTIALS_FILE}):`);
  console.log(`  export KAWALYS_DATABASE_URL_APP='${urls.app}'`);
  console.log(`  export KAWALYS_DATABASE_URL_AUTH='${urls.auth}'`);
  console.log('  npm start   # protected routes stay deny-all (404) until Descope is configured');
}

main().catch((err: unknown) => {
  console.error(`local-up: ${err instanceof Error ? err.message : 'failed'}`);
  process.exitCode = 1;
});

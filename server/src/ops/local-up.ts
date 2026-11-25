// Developer command (BACK-61): `npm run local:up` starts docker-compose.local.yml, builds, then runs this.
//   node dist/ops/local-up.js
// Provisions the disposable loopback Postgres (roles only when missing), applies migrations and seeds
// SYNTHETIC data through the repository layer. Safe to run again. Refuses any non-loopback host and
// NODE_ENV=production. The printed URLs carry only the throwaway local passwords from local-stack.ts.
import pg from 'pg';
import { loadAuthConfig } from '../auth/auth.config';
import { formatSummary, LOCAL_SYNTHETIC_OWNER, localRuntimeUrls, prepareLocalDatabase, seedLocal } from './local-stack';

/** Matches docker-compose.local.yml. Throwaway, loopback only. */
const LOCAL_ADMIN = { user: 'kawalys_local_admin', password: 'kawalys-local-only', database: 'kawalys' } as const;

async function main(): Promise<void> {
  const port = (process.env['KAWALYS_LOCAL_PG_PORT'] ?? '').trim() || '55432';
  if (!/^\d{2,5}$/.test(port)) throw new Error('KAWALYS_LOCAL_PG_PORT must be a port number');
  const adminUrl = `postgres://${LOCAL_ADMIN.user}:${LOCAL_ADMIN.password}@127.0.0.1:${port}/${LOCAL_ADMIN.database}`;

  const { provisioned, applied } = await prepareLocalDatabase(adminUrl);
  console.log(provisioned ? 'provisioned roles kawalys_migrator, kawalys_app, kawalys_auth and schema kawalys' : 'roles already provisioned');
  console.log(applied.length === 0 ? 'no pending migrations' : `applied: ${applied.join(', ')}`);

  // With the owner's Descope settings in the environment, seed for that owner, so a later lab sign-in sees the data.
  const configured = loadAuthConfig(process.env).owner;
  const urls = localRuntimeUrls(adminUrl);
  const app = new pg.Pool({ connectionString: urls.app, max: 2 });
  const auth = new pg.Pool({ connectionString: urls.auth, max: 2 });
  try {
    const summary = await seedLocal({ app, auth }, configured ?? LOCAL_SYNTHETIC_OWNER);
    console.log(`seeded for ${configured ? 'the configured Descope owner' : 'the synthetic local owner (no Descope configured)'}:`);
    console.log(formatSummary(summary));
  } finally {
    await Promise.allSettled([app.end(), auth.end()]);
  }
  console.log('\nRun the BFF against it (local throwaway passwords):');
  console.log(`  export KAWALYS_DATABASE_URL_APP='${urls.app}'`);
  console.log(`  export KAWALYS_DATABASE_URL_AUTH='${urls.auth}'`);
  console.log('  npm start   # protected routes stay deny-all (404) until Descope is configured');
}

main().catch((err: unknown) => {
  console.error(`local-up: ${err instanceof Error ? err.message : 'failed'}`);
  process.exitCode = 1;
});

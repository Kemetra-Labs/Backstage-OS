// Test-only (BACK-51 P4): lives under test/, never src/, so no production path can select it.
// Builds the auth environment for the live e2e server. The owner matches the fake verifier's OWNER
// (test/auth/_helpers.ts). The sign-in limit is raised to its maximum (100 per minute) because one
// Playwright run signs in once per test and would otherwise hit the production default limit.
import { OWNER } from '../auth/_helpers';

const DATABASE_VARS = ['KAWALYS_DATABASE_URL_APP', 'KAWALYS_DATABASE_URL_AUTH'] as const;

export function e2eEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  if (env['NODE_ENV'] === 'production') throw new Error('e2e server: refused with NODE_ENV=production');
  for (const name of DATABASE_VARS) {
    if ((env[name] ?? '') !== '') throw new Error(`e2e server: ${name} must not be set (it only uses a disposable local database)`);
  }
  return {
    KAWALYS_DESCOPE_PROJECT_ID: 'PkawalysTest0001',
    KAWALYS_OWNER_SUBJECT: OWNER.subject,
    KAWALYS_AUTH_SIGN_IN_LIMIT_PER_MINUTE: '100',
  };
}

// Configuration for the operator command that provisions and migrates the Kawalys database (BACK-55).
// Fail fast, name variables, never values. Passwords come from the environment of the operator's shell,
// never from a file in the repository.
import { ConfigError, postgresUrl } from '../config/database-config';

const ADMIN = 'KAWALYS_ADMIN_DATABASE_URL';
const PASSWORD_VARS = {
  migrator: 'KAWALYS_ROLE_PASSWORD_MIGRATOR',
  app: 'KAWALYS_ROLE_PASSWORD_APP',
  auth: 'KAWALYS_ROLE_PASSWORD_AUTH',
} as const;

export interface OperatorConfig {
  readonly adminUrl: string;
  readonly database: string;
  readonly passwords: { readonly migrator: string; readonly app: string; readonly auth: string };
}

export function loadOperatorConfig(env: Readonly<Record<string, string | undefined>>): OperatorConfig {
  const value = (name: string): string => (env[name] ?? '').trim();
  const missing = [ADMIN, ...Object.values(PASSWORD_VARS)].filter((n) => value(n) === '');
  if (missing.length > 0) throw new ConfigError(`missing required configuration: ${missing.join(', ')}`);

  const adminUrl = value(ADMIN);
  const url = postgresUrl(ADMIN, adminUrl);
  // The runner holds a session advisory lock, which a transaction-mode pooler does not keep.
  if (url.hostname.split('.')[0]!.endsWith('-pooler')) {
    throw new ConfigError(`${ADMIN} must use the direct endpoint, not a pooler`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database === '') throw new ConfigError(`${ADMIN} must name a database`);

  const passwords = {
    migrator: value(PASSWORD_VARS.migrator),
    app: value(PASSWORD_VARS.app),
    auth: value(PASSWORD_VARS.auth),
  };
  if (new Set(Object.values(passwords)).size !== 3) {
    throw new ConfigError('the three role passwords must differ');
  }
  return { adminUrl, database, passwords };
}

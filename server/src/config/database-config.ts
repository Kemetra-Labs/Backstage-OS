// Database configuration (BACK-55, BACK-58 minimum). Fail fast, name variables, never values.
// Neither variable set: no database (in-memory sessions, no evidence routes). One set: both are required.
// Auth settings (Descope project, owner subject, session lifetimes) are read by auth.config.ts (#76).

export class ConfigError extends Error {}

export interface DatabaseConfig {
  readonly appUrl: string;
  readonly authUrl: string;
}

const APP = 'KAWALYS_DATABASE_URL_APP';
const AUTH = 'KAWALYS_DATABASE_URL_AUTH';

function postgresUrl(name: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be a postgres:// URL`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new ConfigError(`${name} must be a postgres:// URL`);
  if (!url.username) throw new ConfigError(`${name} must name a role`);
  return url;
}

export function loadDatabaseConfig(env: Readonly<Record<string, string | undefined>>): DatabaseConfig | null {
  const appUrl = (env[APP] ?? '').trim();
  const authUrl = (env[AUTH] ?? '').trim();
  if (appUrl === '' && authUrl === '') return null;
  const missing = [appUrl === '' ? APP : null, authUrl === '' ? AUTH : null].filter((n): n is string => n !== null);
  if (missing.length > 0) throw new ConfigError(`missing required configuration: ${missing.join(', ')}`);
  if (postgresUrl(APP, appUrl).username === postgresUrl(AUTH, authUrl).username) {
    throw new ConfigError(`${APP} and ${AUTH} must use different roles`);
  }
  return { appUrl, authUrl };
}

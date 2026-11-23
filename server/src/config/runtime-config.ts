// Real-mode configuration (BACK-56, BACK-58 minimum). Fail fast, name variables, never values.
// No variable set: synthetic routes only, and NO auth or real routes exist (there is no
// unauthenticated fallback). Any variable set: all are required.

export class ConfigError extends Error {}

export interface RuntimeConfig {
  readonly databaseUrlApp: string;
  readonly databaseUrlAuth: string;
  readonly descopeProjectId: string;
  readonly ownerEmail: string;
  readonly allowedOrigin: string;
  /** Optional KAWALYS_OWNER_SUBJECT: only this Descope subject may become the owner. */
  readonly ownerSubject?: string;
}

const OWNER_SUBJECT_VAR = 'KAWALYS_OWNER_SUBJECT';

const VARS = {
  databaseUrlApp: 'KAWALYS_DATABASE_URL_APP',
  databaseUrlAuth: 'KAWALYS_DATABASE_URL_AUTH',
  descopeProjectId: 'KAWALYS_DESCOPE_PROJECT_ID',
  ownerEmail: 'KAWALYS_OWNER_EMAIL',
  allowedOrigin: 'KAWALYS_ALLOWED_ORIGIN',
} as const;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

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

function origin(value: string): string {
  const name = VARS.allowedOrigin;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} must be an origin such as https://host`);
  }
  const isOriginOnly = url.origin === value;
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!isOriginOnly || !secure) throw new ConfigError(`${name} must be an https origin (http only for localhost), with no path`);
  return url.origin;
}

export function loadRuntimeConfig(env: Readonly<Record<string, string | undefined>>): RuntimeConfig | null {
  const raw = Object.fromEntries(Object.entries(VARS).map(([key, name]) => [key, (env[name] ?? '').trim()])) as Record<
    keyof typeof VARS,
    string
  >;
  const missing = (Object.keys(VARS) as (keyof typeof VARS)[]).filter((k) => raw[k] === '');
  if (missing.length === Object.keys(VARS).length) return null;
  if (missing.length > 0) throw new ConfigError(`missing required configuration: ${missing.map((k) => VARS[k]).join(', ')}`);

  const app = postgresUrl(VARS.databaseUrlApp, raw.databaseUrlApp);
  const auth = postgresUrl(VARS.databaseUrlAuth, raw.databaseUrlAuth);
  if (app.username === auth.username) throw new ConfigError(`${VARS.databaseUrlApp} and ${VARS.databaseUrlAuth} must use different roles`);
  if (!/^[A-Za-z0-9]{1,64}$/.test(raw.descopeProjectId)) throw new ConfigError(`${VARS.descopeProjectId} is malformed`);
  // ASCII only, checked BEFORE lower-casing (toLowerCase folds some non-ASCII, e.g. U+212A, to ASCII).
  if (!/^[\x21-\x3f\x41-\x7e]+@[\x21-\x3f\x41-\x7e]+\.[\x21-\x3f\x41-\x7e]+$/.test(raw.ownerEmail)) {
    throw new ConfigError(`${VARS.ownerEmail} is malformed`);
  }
  const ownerEmail = raw.ownerEmail.toLowerCase();
  const ownerSubject = (env[OWNER_SUBJECT_VAR] ?? '').trim();
  if (ownerSubject !== '' && !/^[\x21-\x7e]{1,256}$/.test(ownerSubject)) throw new ConfigError(`${OWNER_SUBJECT_VAR} is malformed`);

  return {
    databaseUrlApp: raw.databaseUrlApp,
    databaseUrlAuth: raw.databaseUrlAuth,
    descopeProjectId: raw.descopeProjectId,
    ownerEmail,
    allowedOrigin: origin(raw.allowedOrigin),
    ...(ownerSubject !== '' ? { ownerSubject } : {}),
  };
}

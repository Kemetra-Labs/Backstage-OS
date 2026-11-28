// GitHub App and refresh-interval configuration (BACK-52 slice A). Fail fast, name variables, never values.
// None of the three App variables set: GitHub is disabled (null). Some but not all: a ConfigError. The private key
// custody is BACK-128's decision; here the key only ever arrives through the environment of the process.
import { createPrivateKey } from 'node:crypto';
import { ConfigError } from './database-config';

export interface GithubAppConfig {
  readonly appId: number;
  readonly installationId: number;
  /** PEM with real newlines. A secret: never log it, never put it in an error. */
  readonly privateKeyPem: string;
}

const APP_ID = 'KAWALYS_GITHUB_APP_ID';
const INSTALLATION_ID = 'KAWALYS_GITHUB_INSTALLATION_ID';
const PRIVATE_KEY = 'KAWALYS_GITHUB_APP_PRIVATE_KEY';
const REFRESH_MINUTES = 'KAWALYS_GITHUB_REFRESH_MINUTES';

/** The least a refresh interval may be, in minutes: well inside GitHub's hourly rate limit, never a busy loop. */
export const MIN_REFRESH_MINUTES = 15;
/** One week. Also keeps minutes * 60000 far below the 2^31-1 ms limit above which setInterval silently becomes a 1 ms loop. */
export const MAX_REFRESH_MINUTES = 10_080;

type Env = Readonly<Record<string, string | undefined>>;

const value = (env: Env, name: string): string => (env[name] ?? '').trim();

function positiveInteger(name: string, text: string): number {
  // At most 15 digits keeps the value a safe integer; no sign, decimal point or exponent.
  if (!/^[1-9]\d{0,14}$/.test(text)) throw new ConfigError(`${name} must be a positive integer`);
  return Number(text);
}

/** Accepts the one-line form with `\n` escapes that environment files and secret stores often need. */
function normalisedPem(raw: string): string {
  return raw.includes('\n') ? raw : raw.replaceAll('\\n', '\n');
}

function checkedKey(pem: string): string {
  try {
    if (createPrivateKey(pem).asymmetricKeyType !== 'rsa') throw new Error('not rsa');
  } catch {
    throw new ConfigError(`${PRIVATE_KEY} must be an RSA private key in PEM form`);
  }
  return pem;
}

export function loadGithubAppConfig(env: Env): GithubAppConfig | null {
  const names = [APP_ID, INSTALLATION_ID, PRIVATE_KEY];
  const missing = names.filter((n) => value(env, n) === '');
  if (missing.length === names.length) return null;
  if (missing.length > 0) throw new ConfigError(`missing required configuration: ${missing.join(', ')}`);
  return {
    appId: positiveInteger(APP_ID, value(env, APP_ID)),
    installationId: positiveInteger(INSTALLATION_ID, value(env, INSTALLATION_ID)),
    privateKeyPem: checkedKey(normalisedPem(value(env, PRIVATE_KEY))),
  };
}

/** Minutes between refreshes (decision S): null (nothing runs) when unset; an integer of at least 15 otherwise. */
export function loadRefreshMinutes(env: Env): number | null {
  const raw = value(env, REFRESH_MINUTES);
  if (raw === '') return null;
  const minutes = /^\d{1,9}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(minutes >= MIN_REFRESH_MINUTES && minutes <= MAX_REFRESH_MINUTES)) {
    throw new ConfigError(`${REFRESH_MINUTES} must be an integer from ${MIN_REFRESH_MINUTES} to ${MAX_REFRESH_MINUTES}`);
  }
  return minutes;
}

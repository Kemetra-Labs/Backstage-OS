// Origins allowed to make state-changing requests (BACK-47 decision pack, audit M1). Unset means the Vite app
// origin on loopback. Set, it is a comma-separated list of exact origins `scheme://host[:port]` and nothing else:
// never `*` or `null`, no path, no trailing slash, no credentials. The error names the variable, never the value.
// Origin serialisation idea adapted from Retail-Tower-Erp services/backend-core/apps/api/src/auth/origin-check.ts
// (last commit touching the file e173468; repository HEAD 032877b); the rule itself differs (exact-match allowlist, no Host-derived origin).
import { ConfigError } from './database-config';

const NAME = 'KAWALYS_ALLOWED_ORIGINS';
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['http://127.0.0.1:4178', 'http://localhost:4178'];

function isExactOrigin(entry: string): boolean {
  if (!/^https?:\/\/[^/\s?#@\\*]+$/.test(entry)) return false; // no `*` anywhere: the guard never expands wildcards
  try {
    return new URL(entry).origin === entry; // canonical form only: lowercase host, no default port
  } catch {
    return false;
  }
}

export function allowedOrigins(env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const raw = (env[NAME] ?? '').trim();
  if (raw === '') return DEFAULT_ALLOWED_ORIGINS;
  const entries = raw.split(',').map((e) => e.trim());
  if (!entries.every(isExactOrigin)) {
    throw new ConfigError(`${NAME} must be a comma-separated list of exact origins (scheme://host[:port], no path, no wildcard)`);
  }
  return entries;
}

// Local-only database credentials for the disposable BACK-61 stack. Nothing is hard-coded: on first use each
// password is 24 random bytes (base64url), written to a gitignored file readable by the owner only (0600) and
// reused on later runs, because the Postgres volume keeps the roles it was created with.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LocalCredentials {
  /** The container superuser (POSTGRES_PASSWORD). */
  readonly admin: string;
  readonly migrator: string;
  readonly app: string;
  readonly auth: string;
}

const KEYS = ['admin', 'migrator', 'app', 'auth'] as const;
const VALID = /^[A-Za-z0-9_-]{32}$/;

export function generateLocalCredentials(): LocalCredentials {
  const one = () => randomBytes(24).toString('base64url');
  return { admin: one(), migrator: one(), app: one(), auth: one() };
}

/**
 * Reads the credentials file, or creates it when absent. A file that exists but is not four valid passwords
 * throws: regenerating would lock the existing volume out, so the fix is `npm run local:down`.
 */
export function loadOrCreateLocalCredentials(file: string): LocalCredentials {
  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      parsed = null;
    }
    const rec = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
    if (!KEYS.every((k) => typeof rec[k] === 'string' && VALID.test(rec[k] as string))) {
      throw new Error(`${file} is not valid; run npm run local:down, delete it, then npm run local:up`);
    }
    return { admin: rec['admin'] as string, migrator: rec['migrator'] as string, app: rec['app'] as string, auth: rec['auth'] as string };
  }
  const created = generateLocalCredentials();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(created, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(file, 0o600);
  return created;
}

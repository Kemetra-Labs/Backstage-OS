// Host names the BFF answers to (BACK-172 G5, owner decision K). KAWALYS_ALLOWED_HOSTS is a comma-separated list of
// host names with an optional :port, matched case-insensitively against the Host header; an entry without a port
// allows any port. Never `*`, no scheme, path or credentials. Required when NODE_ENV=production (startup fails
// without it, like the Descope settings); unset elsewhere means the check is off (null), so local and test runs
// are unchanged. The error names the variable, never the value.
import { ConfigError } from './database-config';

const NAME = 'KAWALYS_ALLOWED_HOSTS';
const ENTRY = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::([0-9]{1,5}))?$/;

function validEntry(entry: string): boolean {
  const m = ENTRY.exec(entry);
  if (!m) return false;
  if (m[1] === undefined) return true;
  const port = Number(m[1]);
  return port >= 1 && port <= 65535;
}

export function allowedHosts(env: Readonly<Record<string, string | undefined>>): readonly string[] | null {
  const raw = (env[NAME] ?? '').trim();
  if (raw === '') {
    if (env['NODE_ENV'] === 'production') throw new ConfigError(`missing required configuration: ${NAME}`);
    return null;
  }
  const entries = raw.split(',').map((e) => e.trim().toLowerCase());
  if (!entries.every(validEntry)) {
    throw new ConfigError(`${NAME} must be a comma-separated list of host names with an optional port (no scheme, path or wildcard)`);
  }
  return entries;
}

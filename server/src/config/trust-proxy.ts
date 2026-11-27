// Trusted reverse proxies (BACK-64). Unset means no proxy is trusted: X-Forwarded-For is ignored and the
// sign-in limiter keys on the socket address. Set, it is a comma-separated list of IP addresses or CIDR
// ranges (the pilot proxy network) and nothing else: never `true`, `*` or a hop count, and never a range that
// matches every address. The error names the variable, never the value.
import { isIP } from 'node:net';
import { ConfigError } from './database-config';

const NAME = 'KAWALYS_TRUST_PROXY';

function isTrustedEntry(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || address === undefined) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  // /0 would trust every address, which is the same as trusting any client-sent X-Forwarded-For.
  return bits >= 1 && bits <= (family === 4 ? 32 : 128);
}

export function trustProxy(env: Readonly<Record<string, string | undefined>>): readonly string[] | null {
  const raw = (env[NAME] ?? '').trim();
  if (raw === '') return null;
  const entries = raw.split(',').map((e) => e.trim());
  if (!entries.every(isTrustedEntry)) {
    throw new ConfigError(`${NAME} must be a comma-separated list of IP addresses or CIDR ranges (no /0)`);
  }
  return entries;
}

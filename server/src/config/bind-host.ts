// BFF bind host (BACK-64). Loopback by default; 0.0.0.0 only for the container, behind the private proxy network.
// The error names the variable, never the value.
import { ConfigError } from './database-config';

const NAME = 'KAWALYS_BFF_HOST';
const ALLOWED: ReadonlySet<string> = new Set(['127.0.0.1', '::1', '0.0.0.0']);

export function bindHost(env: NodeJS.ProcessEnv): string {
  const raw = env[NAME];
  if (raw === undefined || raw === '') return '127.0.0.1';
  if (!ALLOWED.has(raw)) throw new ConfigError(`${NAME} must be one of 127.0.0.1, ::1 or 0.0.0.0`);
  return raw;
}

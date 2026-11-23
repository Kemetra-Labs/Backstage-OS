// Session cookie (BACK-56). `__Host-` prefix: Secure, Path=/, no Domain, so it is host-only.
// SameSite=Strict plus the Origin check on state-changing routes covers CSRF.
import { SESSION_ABSOLUTE_HOURS } from './session-store';

export const SESSION_COOKIE = '__Host-kawalys_session';
const ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Strict';

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_ABSOLUTE_HOURS * 3600}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; ${ATTRS.replace('Path=/; ', '')}`;
}

/**
 * The value of `name` in a Cookie header. Null when absent, malformed, or present more than
 * once (an attacker on a sibling host could plant a second cookie of the same name).
 */
export function readCookie(header: string | string[] | undefined, name: string): string | null {
  if (typeof header !== 'string') return null;
  const values = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 && values[0] !== '' ? values[0]! : null;
}

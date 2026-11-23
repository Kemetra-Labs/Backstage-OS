// Session transport: one `__Host-` cookie (Secure, Path=/, no Domain, so it cannot be set by a sibling
// subdomain), HttpOnly, SameSite=Strict. No CORS is enabled and the session is never read from a header or a
// query string, so cross-site pages cannot ride it. Browsers treat http://localhost as secure for `Secure` cookies.
import { RAW_TOKEN_RE } from "./session.service";

export const SESSION_COOKIE = "__Host-kawalys_session";

const ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Strict";

/**
 * The session token from a Cookie header, or null. A repeated session cookie is refused outright: which of
 * two values a server picks is ambiguous, and an attacker-planted second cookie must not win.
 */
export function readSessionToken(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header.join("; ") : header;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8_192) return null;
  let found: string | null = null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    if (found !== null) return null;
    found = part.slice(eq + 1).trim();
  }
  return found !== null && RAW_TOKEN_RE.test(found) ? found : null;
}

export function setSessionCookie(rawToken: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${rawToken}; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}

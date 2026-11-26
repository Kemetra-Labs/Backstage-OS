// The one request module (BACK-51 P1, owner decisions D1 (a) and D2 (a), 2026-11-26). The app calls the Kawalys server only in
// live mode (VITE_KAWALYS_LIVE=1, off by default), same origin, through this file: live.guard.test.ts allows no other file to
// make a request. Paths are relative `/api/...` only; a reverse proxy (vite.config.ts locally) strips `/api` and forwards to the
// BFF. No CORS: the session cookie is `__Host-`, SameSite=Strict, so a cross-origin call could never carry it anyway.
//
// Results are typed, never thrown. The server answers 401 and 404 the same on purpose (a hidden record must read like a missing
// one), so both are `not_found`. A gateway that cannot reach the server (502/503/504) is `unavailable`, like a network failure.
// A failure never carries the server's body, and a 2xx body that is not JSON is an error, never an empty answer.

export type HttpFailure = 'not_found' | 'invalid' | 'rate_limited' | 'unavailable' | 'error';

export type HttpResult =
  | { readonly ok: true; readonly status: number; readonly body: unknown }
  | {
      readonly ok: false;
      readonly failure: HttpFailure;
      readonly status: number | null;
      readonly aborted?: true;
      /**
       * Set on every not_found. A 401 and a 404 look the same on purpose, so the caller cannot tell an expired session from a
       * hidden case; re-checking SESSION_CHECK_PATH can (BACK-51 P2 acts on it).
       */
      readonly recheckSession?: true;
    };

/** The session check to run after a not_found: GET /auth/me on the server, through the same-origin proxy. */
export const SESSION_CHECK_PATH = '/api/auth/me';

/** The request function: the global one, or a fake injected by tests. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiRequestInit {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  /** Sent as JSON. Absent: no body and no content type. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /** Injected in tests; the global fetch otherwise. */
  readonly fetcher?: Fetcher;
}

/**
 * A relative `/api/` path with no traversal, empty segment, backslash, fragment or whitespace; null otherwise. The route part may
 * not hold an encoded dot, slash or backslash either (`%2e`, `%2f`, `%5c`): a browser decodes `%2e%2e` as `..`, which would
 * step out of the proxied `/api` space onto the app's own routes.
 */
export function apiPath(path: string): string | null {
  if (!/^\/api\/[^\s\\#]+$/.test(path)) return null;
  const route = path.split('?')[0]!;
  if (/%(2e|2f|5c)/i.test(route)) return null;
  return route.split('/').slice(1).every((seg) => seg !== '' && seg !== '.' && seg !== '..') ? path : null;
}

export function failureOf(status: number): HttpFailure {
  if (status === 401 || status === 404) return 'not_found';
  if (status === 400) return 'invalid';
  if (status === 429) return 'rate_limited';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  return 'error';
}

const isAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

export async function apiRequest(path: string, init: ApiRequestInit = {}): Promise<HttpResult> {
  const url = apiPath(path);
  if (url === null) return { ok: false, failure: 'invalid', status: null };
  const hasBody = init.body !== undefined;
  const headers: Record<string, string> = hasBody ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' };
  const doFetch = init.fetcher ?? globalThis.fetch;
  let status: number;
  let text: string;
  try {
    const res = await doFetch(url, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    status = res.status;
    text = await res.text();
  } catch (e) {
    return isAbort(e) ? { ok: false, failure: 'unavailable', status: null, aborted: true } : { ok: false, failure: 'unavailable', status: null };
  }
  if (status < 200 || status > 299) {
    const failure = failureOf(status);
    return failure === 'not_found' ? { ok: false, failure, status, recheckSession: true } : { ok: false, failure, status };
  }
  if (status === 204 || text === '') return { ok: true, status, body: null };
  try {
    return { ok: true, status, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, failure: 'error', status };
  }
}

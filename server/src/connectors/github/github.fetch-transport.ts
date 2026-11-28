// Real read-only GitHub transport (BACK-52 slice A). Kawalys-owned BUILD that implements the single-method
// GitHubReadTransport port with an INJECTED fetch: nothing here imports a network client, so every test uses a fake.
//
// Rules (docs/planning/BACK-52/real-transport-plan.md section 3):
// - GET only, to one fixed base. The base is a constant, never configuration.
// - Only the three paths the observer reads are allowed: `/repos/<approved owner/repo>` and its `/pulls` and `/issues`
//   list paths (a query is fine on the lists, not on the root). The path is normalised the
//   way fetch would normalise it BEFORE it is checked, so `..`, `%2e%2e`, `//host` and absolute URLs cannot escape.
//   A path that fails is a programming error and throws before any request.
// - Redirects are never followed (`redirect: 'manual'`): a 3xx is returned as the answer, so the observer records
//   unexpected_status instead of sending a bearer token to another place.
// - A 10 s timeout covers the request and the body. A timeout or abort is `timeout`; any other thrown fetch error is
//   `network`. The original error is dropped (no message, no cause), so a token can never travel in an error.
import { REPO_REF } from './github.observer';
import { GitHubTransportFailure, type GitHubReadTransport, type GitHubResponse } from './github.transport';

/** The one host this module talks to (also used by the token provider). */
export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_USER_AGENT = 'kawalys-pilot';
export const GITHUB_TIMEOUT_MS = 10_000;
/** A repository, pull request or issue page is far below this; a larger body is treated as unreadable. */
const MAX_BODY_CHARS = 5_000_000;

/** The subset of the global fetch this module uses. */
export type FetchFn = (
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; redirect: 'manual'; signal: AbortSignal },
) => Promise<Response>;

/** Source of the installation token (github.app-token.ts). May throw GitHubTokenError. */
export interface InstallationTokenSource {
  current(): Promise<string>;
}

export class GitHubPathError extends Error {
  constructor() {
    super('github transport: path not allowed');
    this.name = 'GitHubPathError';
  }
}

/** True for the errors a fetch raises when the timeout signal fires or the request is aborted. */
export function isAbort(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null && 'name' in err ? (err as { name: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

export function standardHeaders(): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GITHUB_API_VERSION, 'User-Agent': GITHUB_USER_AGENT };
}

/** The path normalised exactly as fetch would send it, or throws GitHubPathError. */
function allowedUrl(path: unknown, repo: string): string {
  if (typeof path !== 'string' || !path.startsWith('/') || /[\\\s\u0000-\u001f]/.test(path) || /%2f|%5c/i.test(path)) throw new GitHubPathError();
  let url: URL;
  try {
    url = new URL(path, GITHUB_API_BASE);
  } catch {
    throw new GitHubPathError();
  }
  const root = `/repos/${repo}`;
  const inside = url.pathname === root || url.pathname === `${root}/pulls` || url.pathname === `${root}/issues`;
  // `?x=1` directly on the repository root is not one of the paths the observer uses.
  const rootWithQuery = url.pathname === root && path.slice(root.length) !== '';
  if (url.origin !== GITHUB_API_BASE || url.hash !== '' || !inside || rootWithQuery) throw new GitHubPathError();
  return url.href;
}

function lowerCaseHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

async function parsedBody(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  // A non-2xx answer is classified by status and headers alone: its body is never decoded, so a broken body on a
  // 401 cannot turn into a network failure.
  if (res.status < 200 || res.status >= 300 || !/json/i.test(type)) {
    await res.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const text = await res.text();
  if (text.length > MAX_BODY_CHARS) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createFetchTransport(deps: {
  fetch: FetchFn;
  tokens: InstallationTokenSource;
  repo: string;
  /** Awaited after the token resolves and immediately before the request is dispatched; a throw sends nothing. */
  beforeSend?: () => Promise<void>;
}): GitHubReadTransport {
  const { fetch, tokens, repo, beforeSend } = deps;
  if (!REPO_REF.test(repo)) throw new TypeError('github transport: repo must be an approved lower-case owner/repo');
  return {
    async get(path: string): Promise<GitHubResponse> {
      const url = allowedUrl(path, repo);
      // A token failure (GitHubTokenError) propagates unchanged: the observer maps it, and no request is made.
      const token = await tokens.current();
      // Outside the try: its error (a revoke) must not be mistaken for a network failure.
      await beforeSend?.();
      try {
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
          headers: { ...standardHeaders(), Authorization: `Bearer ${token}` },
        });
        return { status: res.status, body: await parsedBody(res), headers: lowerCaseHeaders(res.headers) };
      } catch (err) {
        throw new GitHubTransportFailure(isAbort(err) ? 'timeout' : 'network');
      }
    },
  };
}

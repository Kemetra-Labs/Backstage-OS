// GitHub App installation-token provider (BACK-52 slice A, decision P). Kawalys-owned BUILD.
//
// The server signs a short-lived App JWT (RS256, jose) and exchanges it for an installation token that is
// DOWN-SCOPED on every mint: one repository id and three read permissions. That POST is the only non-GET call in the
// GitHub path, it goes to GitHub's token endpoint, and it cannot change a repository. The token lives in memory only,
// is renewed 5 minutes before `expires_at`, and is never logged, stored or returned. Messages of GitHubTokenError are
// fixed strings: the key, the JWT, the token and GitHub's own text never appear in an error.
import { createPrivateKey, type KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';
import { GITHUB_API_BASE, GITHUB_TIMEOUT_MS, standardHeaders, type FetchFn, type InstallationTokenSource } from './github.fetch-transport';
import { GitHubTokenError } from './github.transport';

export { GitHubTokenError };

const JWT_BACKDATE_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 9 * 60;
const RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const MINT_PERMISSIONS = { metadata: 'read', pull_requests: 'read', issues: 'read' } as const;

export interface AppTokenDeps {
  readonly fetch: FetchFn;
  readonly appId: number;
  readonly installationId: number;
  /** PEM, PKCS#8 or PKCS#1 (GitHub issues PKCS#1). Never logged. */
  readonly privateKeyPem: string;
  /** The immutable repository id the token is scoped to. */
  readonly repositoryId: number;
  readonly now?: () => Date;
}

/** Reads the key once. The error text is fixed: it must never echo the key material. */
function readKey(pem: string): KeyObject {
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not rsa');
    return key;
  } catch {
    throw new TypeError('github app private key is not a readable RSA key');
  }
}

interface Cached {
  readonly token: string;
  readonly renewAtMs: number;
}

function parseMinted(body: unknown, nowMs: number): Cached {
  const o = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  const token = o?.['token'];
  const expires = typeof o?.['expires_at'] === 'string' ? new Date(o['expires_at']).getTime() : Number.NaN;
  if (typeof token !== 'string' || token === '' || !Number.isFinite(expires) || expires <= nowMs) throw new GitHubTokenError('unavailable');
  return { token, renewAtMs: expires - RENEW_BEFORE_EXPIRY_MS };
}

export function createAppTokenProvider(deps: AppTokenDeps): InstallationTokenSource {
  const { fetch, appId, installationId, repositoryId } = deps;
  const clock = deps.now ?? (() => new Date());
  const key = readKey(deps.privateKeyPem);
  let cached: Cached | undefined;
  let inFlight: Promise<string> | undefined;

  async function appJwt(nowMs: number): Promise<string> {
    const seconds = Math.floor(nowMs / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(String(appId))
      .setIssuedAt(seconds - JWT_BACKDATE_SECONDS)
      .setExpirationTime(seconds + JWT_LIFETIME_SECONDS)
      .sign(key);
  }

  async function mint(): Promise<string> {
    const nowMs = clock().getTime();
    let res: Response;
    try {
      const jwt = await appJwt(nowMs);
      res = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
        headers: { ...standardHeaders(), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository_ids: [repositoryId], permissions: MINT_PERMISSIONS }),
      });
    } catch {
      // Network, timeout or signing failure alike: the original error is dropped on purpose (no message, no cause).
      throw new GitHubTokenError('unavailable');
    }
    try {
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 422) {
        await res.body?.cancel().catch(() => undefined);
        throw new GitHubTokenError('denied');
      }
      if (res.status !== 201) {
        await res.body?.cancel().catch(() => undefined);
        throw new GitHubTokenError('unavailable');
      }
      const minted = parseMinted(await res.json(), nowMs);
      cached = minted;
      return minted.token;
    } catch (err) {
      throw err instanceof GitHubTokenError ? err : new GitHubTokenError('unavailable');
    }
  }

  return {
    current(): Promise<string> {
      const c = cached;
      if (c !== undefined && clock().getTime() < c.renewAtMs) return Promise.resolve(c.token);
      inFlight ??= mint().finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}

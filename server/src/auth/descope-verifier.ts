// Descope session-JWT verifier (BACK-56).
// Adapted from Retail Tower services/backend-core/apps/api/src/pos-operators/descope-verifier.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: separate Kawalys Descope project; the token is only exchanged once for a
// local session, so the token-age cap is 15 minutes (not the donor's 8.5 h) and there are no
// env overrides; the verified subject carries the email claim for the owner binding.
//
//   - signature: this project's JWKS only; algorithm allow-list RS256 (no none, no HMAC);
//   - iss: canonical https://api.descope.com/v1/apps/<projectId>, legacy forms accepted
//     (the signature still pins the project), the canonical form is what is recorded;
//   - aud: the project id; exp and iat required; only session tokens (drn "DS");
//     impersonation tokens (act / dact) refused.
// Any failure throws ONE generic error; jose errors can carry decoded claims, so only
// jose's fixed ERR_* code survives.
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey, type JWTVerifyOptions } from 'jose';
import { IdentityTokenRejected, type IdentityProviderPort, type VerifiedSubject } from './identity-provider.port';

export const DESCOPE_PROVIDER_KEY = 'descope';
const DESCOPE_API_BASE = 'https://api.descope.com';
const PROJECT_ID = /^[A-Za-z0-9]{1,64}$/;
const SESSION_TOKEN_DRN = 'DS';
const ASCII_EMAIL = /^[\x21-\x7e]{3,320}$/;
const MAX_TOKEN_AGE_SECONDS = 15 * 60;
const CLOCK_TOLERANCE_SECONDS = 5;
const JWKS_TIMEOUT_MS = 5_000;
const SAFE_ERROR_CODE = /^ERR_[A-Z_]{1,64}$/;

function assertProjectId(projectId: string): string {
  if (!PROJECT_ID.test(projectId)) throw new Error('Descope project id is malformed');
  return projectId;
}

export function descopeIssuer(projectId: string): string {
  return `${DESCOPE_API_BASE}/v1/apps/${assertProjectId(projectId)}`;
}

export function descopeJwksUrl(projectId: string): string {
  return `${DESCOPE_API_BASE}/${assertProjectId(projectId)}/.well-known/jwks.json`;
}

/** Production JWKS. Building it makes no request; keys are fetched on first use. */
export function remoteDescopeJwks(projectId: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(descopeJwksUrl(projectId)), { timeoutDuration: JWKS_TIMEOUT_MS });
}

function rejected(err?: unknown): IdentityTokenRejected {
  const code = (err as { code?: unknown } | undefined)?.code;
  return new IdentityTokenRejected(typeof code === 'string' && SAFE_ERROR_CODE.test(code) ? `identity token rejected (${code})` : 'identity token rejected');
}

export interface DescopeVerifierOptions {
  readonly projectId: string;
  readonly jwks: JWTVerifyGetKey;
}

export class DescopeVerifier implements IdentityProviderPort {
  private readonly issuer: string;
  private readonly verifyOptions: JWTVerifyOptions;

  constructor(private readonly options: DescopeVerifierOptions) {
    const projectId = assertProjectId(options.projectId);
    this.issuer = descopeIssuer(projectId);
    this.verifyOptions = {
      issuer: [this.issuer, `${DESCOPE_API_BASE}/${projectId}`, projectId],
      audience: projectId,
      algorithms: ['RS256'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['exp', 'iat', 'sub'],
      maxTokenAge: MAX_TOKEN_AGE_SECONDS,
    };
  }

  async verifyIdentityToken(rawToken: string): Promise<VerifiedSubject> {
    if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > 8192) throw rejected();
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(rawToken, this.options.jwks, this.verifyOptions));
    } catch (err) {
      throw rejected(err);
    }
    // Allowlist: only a Descope session token (drn "DS", always present per Descope's token
    // claims docs). Refresh tokens ("DSR"), access keys and anything else refuse.
    if (payload['drn'] !== SESSION_TOKEN_DRN || payload['token_type'] === 'refresh') throw rejected();
    // Impersonation: Descope writes the impersonator into `act` (or `dact` when a JWT template
    // overrides `act`). An impersonated session is never a Kawalys credential.
    if (payload['act'] !== undefined || payload['dact'] !== undefined) throw rejected();
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 256) throw rejected();
    const rawEmail = payload['email'];
    // ASCII only, compared exactly after lower-casing: no Unicode case-folding collisions.
    const email = typeof rawEmail === 'string' && ASCII_EMAIL.test(rawEmail.trim()) ? rawEmail.trim().toLowerCase() : null;
    return {
      providerKey: DESCOPE_PROVIDER_KEY,
      issuer: this.issuer,
      subject: sub,
      email,
      emailVerified: email !== null && payload['email_verified'] === true,
    };
  }
}

// Adapted from Kemetra-Labs/Retail-Tower-Erp at 9b68e33aabaa5b8f83a8b47d83790ce7c7a2e9c2,
// services/backend-core/apps/api/src/pos-operators/descope-verifier.ts (candidate I5). Apache-2.0,
// Copyright 2026 Kemetra-Labs. See THIRD_PARTY.md.
//
// Kept from the donor: jose JWKS verification, RS256 only (no none, HMAC or EC), exp / sub / iat required,
// a token-age cap, a 5 s clock tolerance, refresh tokens (drn=DSR) refused, and errors that carry no cause,
// claims or token.
// Changed for Kawalys:
//   - returns a VerifyResult (BACK-14 section 4) instead of throwing, and tells an outage (unavailable)
//     from a bad token (refused) using jose's fixed ERR_* codes only;
//   - the audience is required and is the project id; there is one pinned issuer, no legacy forms;
//   - the token-age default is Kawalys's own (the JWT is exchanged once for a Kawalys session, it is not
//     the session), not RT's 8 h POS policy;
//   - env names are KAWALYS_*-prefixed (auth.config.ts), so no RT configuration path is shared.
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey, type JWTVerifyOptions } from "jose";
import type { IdentityVerificationPort, VerifyResult } from "./identity-verification.port";

export const DESCOPE_PROVIDER_KEY = "descope";
export const DESCOPE_API_BASE = "https://api.descope.com";

/** Descope project ids are short alphanumeric strings; anything else is a config error. */
export const PROJECT_ID_RE = /^[A-Za-z0-9]{1,64}$/;

const ALLOWED_ALGORITHMS = ["RS256"];
const CLOCK_TOLERANCE_SECONDS = 5;
const JWKS_TIMEOUT_MS = 5_000;
const SESSION_TOKEN_DRN = "DS";
const MAX_TOKEN_CHARS = 8_192;
const MAX_SUBJECT_CHARS = 256;

/** The canonical issuer Descope stamps on session JWTs (RT rt9 lab, 2026-10-21; unverified for Kawalys until K-ID-1b). */
export function descopeIssuer(projectId: string): string {
  return `${DESCOPE_API_BASE}/v1/apps/${projectId}`;
}

export function descopeJwksUrl(projectId: string): string {
  return `${DESCOPE_API_BASE}/${projectId}/.well-known/jwks.json`;
}

export interface DescopeVerifierOptions {
  readonly issuer: string;
  /** Required. Descope stamps the project id as `aud`. */
  readonly audience: string;
  readonly maxTokenAgeSeconds: number;
  readonly jwks: JWTVerifyGetKey;
}

/**
 * jose codes that mean "this token is bad". Everything else (a JWKS timeout, a non-200 JWKS answer, a network
 * error, an unknown failure) is classified `unavailable`. Both deny; the split is for operators only.
 */
const REFUSED_CODES: ReadonlySet<string> = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
]);

const REFUSED: VerifyResult = { kind: "refused" };
const UNAVAILABLE: VerifyResult = { kind: "unavailable" };

class AbortedError extends Error {}

function classify(err: unknown): VerifyResult {
  // Only the fixed code is read; the message and payload can carry claims and are never touched.
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && REFUSED_CODES.has(code) ? REFUSED : UNAVAILABLE;
}

function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new AbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function toVerifyOptions(options: DescopeVerifierOptions): JWTVerifyOptions {
  return {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: ALLOWED_ALGORITHMS,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    requiredClaims: ["exp", "sub", "iat"],
    maxTokenAge: options.maxTokenAgeSeconds,
  };
}

export class DescopeVerifier implements IdentityVerificationPort {
  private readonly verifyOptions: JWTVerifyOptions;

  constructor(private readonly options: DescopeVerifierOptions) {
    this.verifyOptions = toVerifyOptions(options);
  }

  async verify(rawToken: string, signal: AbortSignal): Promise<VerifyResult> {
    if (signal.aborted) return UNAVAILABLE;
    if (typeof rawToken !== "string" || rawToken.length === 0 || rawToken.length > MAX_TOKEN_CHARS) return REFUSED;
    let payload: JWTPayload;
    try {
      ({ payload } = await withAbort(jwtVerify(rawToken, this.options.jwks, this.verifyOptions), signal));
    } catch (err) {
      return classify(err);
    }
    // Allowlist, not denylist: only a Descope session token (drn "DS", always present per Descope's
    // token-claims docs). Refresh tokens ("DSR"), access keys and other kinds are refused.
    if (payload["drn"] !== SESSION_TOKEN_DRN || payload["token_type"] === "refresh") return REFUSED;
    // Impersonation: Descope writes the impersonator into `act` (or `dact` when a JWT template overrides
    // `act`) while `sub` is the impersonated user. An impersonated owner session is never a Kawalys credential.
    if (payload["act"] !== undefined || payload["dact"] !== undefined) return REFUSED;
    const sub: unknown = payload.sub;
    if (typeof sub !== "string" || sub.length === 0 || sub.length > MAX_SUBJECT_CHARS) return REFUSED;
    // jose has already proven iss equals the pinned issuer, so the pinned value is the one recorded.
    return { kind: "verified", subject: { providerKey: DESCOPE_PROVIDER_KEY, issuer: this.options.issuer, subject: sub } };
  }
}

/** Builds the production verifier. Building the remote JWKS makes no request; it is fetched on first use. */
export function createDescopeVerifier(projectId: string, issuer: string, maxTokenAgeSeconds: number): DescopeVerifier {
  return new DescopeVerifier({
    issuer,
    audience: projectId,
    maxTokenAgeSeconds,
    jwks: createRemoteJWKSet(new URL(descopeJwksUrl(projectId)), { timeoutDuration: JWKS_TIMEOUT_MS }),
  });
}

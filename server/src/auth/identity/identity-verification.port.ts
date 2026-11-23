// Provider-neutral identity verification boundary. The shape is BACK-14 section 4; Retail Tower's
// `identity-provider.port.ts` (candidate I1, origin/main d720c51de949dfbea0c91625b61c061f6a7434d7) was a reference only.
// Only a verified subject crosses this port. No provider claim, token or cause does.
// A result other than "verified" always means deny; the kinds exist for operators, never for clients.

/** The full triple a local identity link is matched on. The issuer is part of the match. */
export interface VerifiedSubject {
  readonly providerKey: string;
  readonly issuer: string;
  readonly subject: string;
}

/** Registered claim names a refusal may name. The name only, never the value. */
export const REFUSAL_CLAIMS = ["iss", "aud", "exp", "nbf", "iat", "sub", "drn"] as const;
export type RefusalClaim = (typeof REFUSAL_CLAIMS)[number];

/**
 * Why a token was refused, safe for an operator log: a fixed code (a jose ERR_* value or a KAWALYS_* one) and,
 * for a claim check, the claim's name. It never carries a claim value, a message, a subject or a project id.
 */
export interface RefusalReason {
  readonly code: string;
  readonly claim?: RefusalClaim;
}

export type VerifyResult =
  | { readonly kind: "verified"; readonly subject: VerifiedSubject }
  | { readonly kind: "refused"; readonly reason?: RefusalReason } // the credential is not valid
  | { readonly kind: "unavailable" } // the provider could not be reached or answered badly
  | { readonly kind: "unconfigured" }; // no provider is configured

export interface IdentityVerificationPort {
  verify(rawToken: string, signal: AbortSignal): Promise<VerifyResult>;
}

/** Verifier used when no provider is configured. It never touches the network. */
export class UnconfiguredVerifier implements IdentityVerificationPort {
  verify(): Promise<VerifyResult> {
    return Promise.resolve({ kind: "unconfigured" });
  }
}

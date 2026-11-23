// Provider-neutral identity seam (BACK-56).
// Adapted from Retail Tower services/backend-core/apps/api/src/auth/identity-provider.port.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: only verification is on the port (no invite, create, reset or link
// operations: the alpha has one owner); the verified email is carried for the one-shot
// owner binding only. Provider-specific claims never pass this boundary.

export interface VerifiedSubject {
  /** Which provider verified the token, e.g. "descope". */
  readonly providerKey: string;
  /** The provider's canonical issuer. */
  readonly issuer: string;
  /** The provider's stable subject (`sub`). */
  readonly subject: string;
  /** Lower-cased email claim, or null when absent. */
  readonly email: string | null;
  /** True only when the provider explicitly marks the email as verified. */
  readonly emailVerified: boolean;
}

/** The only error a verifier throws for a bad token. Its message never carries claims. */
export class IdentityTokenRejected extends Error {}

export interface IdentityProviderPort {
  /** Verify a raw provider token. MUST throw on any failure, with a generic message. */
  verifyIdentityToken(rawToken: string): Promise<VerifiedSubject>;
}

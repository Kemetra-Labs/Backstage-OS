// Test-only: locally generated RS256 keys and Descope-shaped session JWTs. No network.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { descopeIssuer } from '../../src/auth/descope-verifier';

export const PROJECT_ID = 'P2testproject0001';

export interface Signer {
  readonly jwks: JWTVerifyGetKey;
  sign(claims?: JWTPayload, opts?: { iat?: number; exp?: number; iss?: string; aud?: string; kid?: string }): Promise<string>;
}

export async function makeSigner(kid = 'k1'): Promise<Signer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const now = () => Math.floor(Date.now() / 1000);
  return {
    jwks,
    sign: async (claims = {}, opts = {}) =>
      new SignJWT({ sub: 'U-owner-1', drn: 'DS', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? kid })
        .setIssuer(opts.iss ?? descopeIssuer(PROJECT_ID))
        .setAudience(opts.aud ?? PROJECT_ID)
        .setIssuedAt(opts.iat ?? now())
        .setExpirationTime(opts.exp ?? now() + 600)
        .sign(privateKey),
  };
}

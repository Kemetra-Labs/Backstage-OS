import { SignJWT, base64url } from 'jose';
import { DescopeVerifier, descopeIssuer, descopeJwksUrl } from '../../src/auth/descope-verifier';
import { makeSigner, PROJECT_ID, type Signer } from './jwt-fixtures';

let signer: Signer;
let other: Signer;
let verifier: DescopeVerifier;
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  signer = await makeSigner('k1');
  other = await makeSigner('k1');
  verifier = new DescopeVerifier({ projectId: PROJECT_ID, jwks: signer.jwks });
});

const refuse = async (token: string) => {
  const err = await verifier.verifyIdentityToken(token).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(Error);
  const msg = String((err as Error).message);
  expect(msg).toMatch(/^identity token rejected/);
  // Never echo claims (subject or email) in the error.
  expect(msg).not.toMatch(/U-owner-1|owner@example\.test/);
  return msg;
};

describe('DescopeVerifier', () => {
  it('returns a provider-neutral subject with the canonical issuer and a verified email', async () => {
    const token = await signer.sign({ email: 'Owner@Example.test', email_verified: true });
    await expect(verifier.verifyIdentityToken(token)).resolves.toEqual({
      providerKey: 'descope',
      issuer: descopeIssuer(PROJECT_ID),
      subject: 'U-owner-1',
      email: 'owner@example.test',
      emailVerified: true,
    });
  });

  it('accepts the legacy issuer forms but records the canonical one', async () => {
    for (const iss of [`https://api.descope.com/${PROJECT_ID}`, PROJECT_ID]) {
      const s = await verifier.verifyIdentityToken(await signer.sign({}, { iss }));
      expect(s.issuer).toBe(descopeIssuer(PROJECT_ID));
    }
  });

  it('reports an email as unverified unless email_verified is exactly true', async () => {
    for (const claims of [{ email: 'a@b.test' }, { email: 'a@b.test', email_verified: 'true' }, { email: 42, email_verified: true }]) {
      const s = await verifier.verifyIdentityToken(await signer.sign(claims));
      expect(s.emailVerified).toBe(false);
    }
  });

  it('refuses a token signed by another key', async () => {
    await refuse(await other.sign({ email: 'owner@example.test' }));
  });

  it('refuses a wrong issuer, a wrong audience and another project', async () => {
    await refuse(await signer.sign({}, { iss: 'https://evil.example/v1/apps/x' }));
    await refuse(await signer.sign({}, { aud: 'someone-else' }));
    await refuse(await signer.sign({}, { iss: descopeIssuer('P2otherproject9') }));
  });

  it('refuses an expired token and one issued too long ago', async () => {
    await refuse(await signer.sign({}, { iat: now() - 3600, exp: now() - 60 }));
    await refuse(await signer.sign({}, { iat: now() - 20 * 60, exp: now() + 600 }));
  });

  it('refuses a refresh token and a token without a subject', async () => {
    await refuse(await signer.sign({ drn: 'DSR' }));
    await refuse(await signer.sign({ sub: '' }));
  });

  it('accepts only Descope session tokens (drn DS): no drn, other kinds and refresh token_type refuse', async () => {
    await refuse(await signer.sign({ drn: undefined }));
    await refuse(await signer.sign({ drn: 'AK' }));
    await refuse(await signer.sign({ token_type: 'refresh' }));
  });

  it('refuses impersonation tokens (act or dact claim)', async () => {
    await refuse(await signer.sign({ act: { sub: 'U-impersonator' }, email: 'owner@example.test', email_verified: true }));
    await refuse(await signer.sign({ dact: { sub: 'U-impersonator' } }));
  });

  it('treats a non-ASCII email as absent (no Unicode case-folding tricks)', async () => {
    const s = await verifier.verifyIdentityToken(await signer.sign({ email: 'Kate@example.test', email_verified: true }));
    expect(s.email).toBeNull();
    expect(s.emailVerified).toBe(false);
  });

  it('refuses alg none, HS256 and garbage', async () => {
    const enc = (o: object) => base64url.encode(JSON.stringify(o));
    const claims = { sub: 'U-owner-1', iss: descopeIssuer(PROJECT_ID), aud: PROJECT_ID, iat: now(), exp: now() + 600 };
    await refuse(`${enc({ alg: 'none', typ: 'JWT' })}.${enc(claims)}.`);
    const hs = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('x'.repeat(32)));
    await refuse(hs);
    await refuse('not-a-jwt');
    await refuse('');
  });

  it('refuses a malformed project id at construction', () => {
    expect(() => new DescopeVerifier({ projectId: 'bad/id', jwks: signer.jwks })).toThrow(/project id/);
    expect(descopeJwksUrl(PROJECT_ID)).toBe(`https://api.descope.com/${PROJECT_ID}/.well-known/jwks.json`);
  });
});

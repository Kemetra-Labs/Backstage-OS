// Adapted from Kemetra-Labs/Retail-Tower-Erp at 9b68e33aabaa5b8f83a8b47d83790ce7c7a2e9c2,
// services/backend-core/apps/api/test/pos-operators/descope-verifier.unit.spec.ts. Apache-2.0,
// Copyright 2026 Kemetra-Labs.
// Offline: every token is signed with a key generated here and the JWKS is local, so no request reaches Descope.
// Changed from the donor: results are VerifyResult values (refused / unavailable), the audience is required,
// there is one issuer, and the Kawalys-only cases (a Retail Tower shaped token, outage vs refusal) are new.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SignJWT,
  createLocalJWKSet,
  createRemoteJWKSet,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from 'jose';
import {
  DESCOPE_PROVIDER_KEY,
  DescopeVerifier,
  createDescopeVerifier,
  descopeIssuer,
  descopeJwksUrl,
} from '../../src/auth/identity/descope-verifier';
import type { VerifyResult } from '../../src/auth/identity/identity-verification.port';

const PROJECT_ID = 'PkawalysTest0001';
const ISSUER = descopeIssuer(PROJECT_ID);
const SUB = 'UkawalysOwner0001';
const KID = 'test-kid-1';
const MAX_AGE = 900;
const UNAVAILABLE: VerifyResult = { kind: 'unavailable' };

let privateKey: KeyLike;
let publicKey: KeyLike;
let publicJwk: JWK;
let otherPrivateKey: KeyLike;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
});

const nowSeconds = (): number => Math.floor(Date.now() / 1000);
const signal = (): AbortSignal => new AbortController().signal;

interface TokenOptions {
  readonly key?: KeyLike;
  readonly alg?: string;
  readonly kid?: string;
  readonly issuer?: string;
  readonly sub?: string | null;
  readonly audience?: string | null;
  readonly expiresIn?: number | null;
  readonly iatAgo?: number | null;
  readonly nbfIn?: number;
  readonly drn?: string | null;
  readonly extra?: Record<string, unknown>;
}

async function token(opts: TokenOptions = {}): Promise<string> {
  const now = nowSeconds();
  let jwt = new SignJWT({ ...(opts.drn === null ? {} : { drn: opts.drn ?? 'DS' }), ...(opts.extra ?? {}) })
    .setProtectedHeader({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID })
    .setIssuer(opts.issuer ?? ISSUER);
  if (opts.iatAgo !== null) jwt = jwt.setIssuedAt(now - (opts.iatAgo ?? 0));
  if (opts.sub !== null) jwt = jwt.setSubject(opts.sub ?? SUB);
  if (opts.audience !== null) jwt = jwt.setAudience(opts.audience ?? PROJECT_ID);
  if (opts.expiresIn !== null) jwt = jwt.setExpirationTime(now + (opts.expiresIn ?? 300));
  if (opts.nbfIn !== undefined) jwt = jwt.setNotBefore(now + opts.nbfIn);
  return jwt.sign(opts.key ?? privateKey);
}

function verifier(): DescopeVerifier {
  return new DescopeVerifier({
    issuer: ISSUER,
    audience: PROJECT_ID,
    maxTokenAgeSeconds: MAX_AGE,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  });
}

function verifierWith(jwks: ConstructorParameters<typeof DescopeVerifier>[0]['jwks']): DescopeVerifier {
  return new DescopeVerifier({ issuer: ISSUER, audience: PROJECT_ID, maxTokenAgeSeconds: MAX_AGE, jwks });
}

describe('descopeIssuer / descopeJwksUrl', () => {
  it('derives the issuer and the JWKS URL from the project id', () => {
    expect(descopeIssuer(PROJECT_ID)).toBe(`https://api.descope.com/v1/apps/${PROJECT_ID}`);
    expect(descopeJwksUrl(PROJECT_ID)).toBe(`https://api.descope.com/${PROJECT_ID}/.well-known/jwks.json`);
  });
});

describe('DescopeVerifier: accepts', () => {
  it('returns the full verified triple, with the pinned issuer', async () => {
    await expect(verifier().verify(await token(), signal())).resolves.toEqual({
      kind: 'verified',
      subject: { providerKey: DESCOPE_PROVIDER_KEY, issuer: ISSUER, subject: SUB },
    });
  });

  it('accepts an nbf within the 5 s clock tolerance', async () => {
    const r = await verifier().verify(await token({ nbfIn: 2 }), signal());
    expect(r.kind).toBe('verified');
  });

  it('accepts a token issued within the age cap', async () => {
    const r = await verifier().verify(await token({ iatAgo: MAX_AGE - 120 }), signal());
    expect(r.kind).toBe('verified');
  });
});

type Claim = 'iss' | 'aud' | 'exp' | 'nbf' | 'iat' | 'sub' | 'drn';
const CLAIM_FAILED = 'ERR_JWT_CLAIM_VALIDATION_FAILED';

/** A refusal carries a reason: a fixed code, plus the name (never the value) of a registered claim when jose names one. */
function expectRefused(result: VerifyResult, code: string, claim?: Claim): void {
  expect(result).toEqual({ kind: 'refused', reason: claim === undefined ? { code } : { code, claim } });
}

describe('DescopeVerifier: refuses', () => {
  const cases: Array<[string, () => Promise<string>, string, Claim?]> = [
    ['a bad signature (signed by another key)', () => token({ key: otherPrivateKey }), 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'],
    ['a wrong issuer', () => token({ issuer: 'https://api.descope.com/v1/apps/PotherProject' }), CLAIM_FAILED, 'iss'],
    ['an expired token', () => token({ expiresIn: -600 }), 'ERR_JWT_EXPIRED', 'exp'],
    ['a token without exp', () => token({ expiresIn: null }), CLAIM_FAILED, 'exp'],
    ['a token without iat (the age cap needs it)', () => token({ iatAgo: null }), CLAIM_FAILED, 'iat'],
    ['a missing sub', () => token({ sub: null }), CLAIM_FAILED, 'sub'],
    ['an empty sub', () => token({ sub: '' }), 'KAWALYS_BAD_SUBJECT'],
    ['an over-long sub', () => token({ sub: 'U'.repeat(300) }), 'KAWALYS_BAD_SUBJECT'],
    ['a wrong audience', () => token({ audience: 'PotherProject' }), CLAIM_FAILED, 'aud'],
    ['a missing audience (audience is required)', () => token({ audience: null }), CLAIM_FAILED, 'aud'],
    ['a Descope refresh token (drn=DSR)', () => token({ drn: 'DSR' }), 'KAWALYS_TOKEN_KIND'],
    // Kawalys (BACK-55/56 integration, security review): allowlist session tokens, refuse impersonation.
    ['a token without drn (only Descope session tokens, drn=DS)', () => token({ drn: null }), 'KAWALYS_TOKEN_KIND'],
    ['another Descope token kind (drn=AK)', () => token({ drn: 'AK' }), 'KAWALYS_TOKEN_KIND'],
    ['a token_type=refresh token', () => token({ extra: { token_type: 'refresh' } }), 'KAWALYS_TOKEN_KIND'],
    ['an impersonation token (act claim) for the owner subject', () => token({ extra: { act: { sub: 'Uimpersonator' } } }), 'KAWALYS_IMPERSONATION'],
    ['an impersonation token (dact claim, JWT template override)', () => token({ extra: { dact: { sub: 'Uimpersonator' } } }), 'KAWALYS_IMPERSONATION'],
    ['an nbf beyond the clock tolerance', () => token({ nbfIn: 60 }), CLAIM_FAILED, 'nbf'],
    ['a token issued longer ago than the age cap', () => token({ iatAgo: MAX_AGE + 600 }), 'ERR_JWT_EXPIRED', 'iat'],
    ['a token issued in the future', () => token({ iatAgo: -3600, expiresIn: 7200 }), CLAIM_FAILED, 'iat'],
    [
      'a Retail Tower shaped token (another project: its issuer and audience)',
      () => token({ issuer: 'https://api.descope.com/v1/apps/P2rtProject0001', audience: 'P2rtProject0001' }),
      CLAIM_FAILED,
      'iss',
    ],
    ['an unknown kid (ERR_JWKS_NO_MATCHING_KEY)', () => token({ kid: 'rotated-away' }), 'ERR_JWKS_NO_MATCHING_KEY'],
  ];

  // A rest parameter keeps the callback's arity at 0: jest hands rows shorter than the callback a `done` callback.
  it.each(cases)('%s', async (...row) => {
    const [, make, code, claim] = row;
    expectRefused(await verifier().verify(await make(), signal()), code, claim);
  });

  it('a disallowed algorithm (ES256 key published in the JWKS)', async () => {
    const ec = await generateKeyPair('ES256');
    const ecJwk = { ...(await exportJWK(ec.publicKey)), kid: 'ec-kid', alg: 'ES256' };
    const v = verifierWith(createLocalJWKSet({ keys: [publicJwk, ecJwk] }));
    const t = await token({ key: ec.privateKey, alg: 'ES256', kid: 'ec-kid' });
    expectRefused(await v.verify(t, signal()), 'ERR_JOSE_ALG_NOT_ALLOWED');
  });

  it('an unsigned (alg=none) token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: SUB, iss: ISSUER, aud: PROJECT_ID, iat: nowSeconds(), exp: nowSeconds() + 300 }),
    ).toString('base64url');
    const r = await verifier().verify(`${header}.${body}.`, signal());
    expect(r.kind).toBe('refused');
    expect(r).toMatchObject({ reason: { code: expect.stringMatching(/^ERR_J/) } });
  });

  it('an HS256 token signed with the RSA public key as the HMAC secret', async () => {
    const secret = new TextEncoder().encode(await exportSPKI(publicKey));
    const t = await new SignJWT({ drn: 'DS' })
      .setProtectedHeader({ alg: 'HS256', kid: KID })
      .setIssuer(ISSUER)
      .setSubject(SUB)
      .setAudience(PROJECT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    // A key getter that hands back the public key for any header, so the algorithm allow-list is what refuses it.
    expectRefused(await verifierWith(async () => publicKey).verify(t, signal()), 'ERR_JOSE_ALG_NOT_ALLOWED');
  });

  it.each(['', 'x'.repeat(9000)])('empty or oversized input %#', async (input) => {
    expectRefused(await verifier().verify(input, signal()), 'KAWALYS_INPUT');
  });

  it.each(['not-a-jwt', 'a.b.c'])('garbage input %#', async (input) => {
    const r = await verifier().verify(input, signal());
    expect(r.kind).toBe('refused');
    expect(r).toMatchObject({ reason: { code: expect.stringMatching(/^ERR_JW/) } });
    expect(Object.keys((r as { reason: object }).reason)).toEqual(['code']);
  });
});

describe('DescopeVerifier: unavailable (an outage is never a bad token, and still denies)', () => {
  it('a JWKS getter that throws a plain error', async () => {
    const v = verifierWith(async () => {
      throw new Error('network down');
    });
    await expect(v.verify(await token(), signal())).resolves.toEqual(UNAVAILABLE);
  });

  it('a JWKS timeout (ERR_JWKS_TIMEOUT)', async () => {
    const v = verifierWith(async () => {
      throw Object.assign(new Error('timed out'), { code: 'ERR_JWKS_TIMEOUT' });
    });
    await expect(v.verify(await token(), signal())).resolves.toEqual(UNAVAILABLE);
  });

  it('a signal that is already aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(verifier().verify(await token(), c.signal)).resolves.toEqual(UNAVAILABLE);
  });

  it('a signal aborted while the JWKS is pending', async () => {
    const c = new AbortController();
    const v = verifierWith(() => new Promise(() => undefined));
    const pending = v.verify(await token(), c.signal);
    setTimeout(() => c.abort(), 10);
    await expect(pending).resolves.toEqual(UNAVAILABLE);
  });
});

describe('DescopeVerifier: remote JWKS over HTTP (local server)', () => {
  let server: Server;
  let baseUrl: string;
  let status = 200;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      if (status !== 200) {
        res.writeHead(status).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  // A fresh remote key set per case: jose caches a fetched JWKS.
  it('verifies against a fetched JWKS', async () => {
    status = 200;
    const v = verifierWith(createRemoteJWKSet(new URL(baseUrl)));
    expect((await v.verify(await token(), signal())).kind).toBe('verified');
  });

  it('is unavailable when the JWKS answers 500', async () => {
    status = 500;
    const v = verifierWith(createRemoteJWKSet(new URL(baseUrl)));
    await expect(v.verify(await token(), signal())).resolves.toEqual(UNAVAILABLE);
  });

  it('is unavailable when the JWKS host refuses the connection', async () => {
    const closed = createServer();
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}/jwks.json`;
    await new Promise<void>((done) => closed.close(() => done()));
    const v = verifierWith(createRemoteJWKSet(new URL(url)));
    await expect(v.verify(await token(), signal())).resolves.toEqual(UNAVAILABLE);
  });
});

describe('DescopeVerifier: nothing leaks', () => {
  it('a refusal or an outage carries no token, subject, claim or cause', async () => {
    const t = await token({ issuer: 'https://api.descope.com/v1/apps/PotherProject' });
    const refused = await verifier().verify(t, signal());
    const outage = await verifierWith(async () => {
      throw new Error(`secret ${SUB} ${t}`);
    }).verify(await token(), signal());
    expect(Object.keys(refused).sort()).toEqual(['kind', 'reason']);
    expect(Object.keys(outage)).toEqual(['kind']);
    for (const r of [refused, outage]) {
      const text = JSON.stringify(r);
      expect(text).not.toContain(SUB);
      expect(text).not.toContain(t);
      expect(text).not.toContain('secret');
    }
  });

  it('a Retail Tower shaped token gives a reason with neither its project id nor its subject', async () => {
    const rtSub = 'U2rtOperator0001';
    const t = await token({
      issuer: 'https://api.descope.com/v1/apps/P2rtProject0001',
      audience: 'P2rtProject0001',
      sub: rtSub,
    });
    const r = await verifier().verify(t, signal());
    expect(r.kind).toBe('refused');
    const text = JSON.stringify((r as { reason: unknown }).reason);
    for (const secret of ['P2rtProject0001', rtSub, SUB, PROJECT_ID, t]) expect(text).not.toContain(secret);
  });

  it('keeps only the allowlisted claim name from jose, and never a message or a claim value', async () => {
    const throwing = (extra: Record<string, unknown>) =>
      verifierWith(async () => {
        throw Object.assign(new Error(`secret ${SUB}`), { code: CLAIM_FAILED, ...extra });
      });
    const tok = await token();
    for (const claim of ['secretclaim', 'jti', 42, undefined, {}]) {
      const r = await throwing({ claim, reason: `secret ${SUB}` }).verify(tok, signal());
      expectRefused(r, CLAIM_FAILED);
      expect(JSON.stringify(r)).not.toContain('secret');
    }
    expectRefused(await throwing({ claim: 'nbf', payload: { sub: SUB } }).verify(tok, signal()), CLAIM_FAILED, 'nbf');
  });
});

describe('createDescopeVerifier', () => {
  it('builds the production verifier without any request (the JWKS is fetched on first use)', () => {
    expect(createDescopeVerifier(PROJECT_ID, ISSUER, MAX_AGE)).toBeInstanceOf(DescopeVerifier);
  });
});

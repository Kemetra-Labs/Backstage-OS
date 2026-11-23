// Test-only. The fake verifier lives under test/ so no production code path or environment value can select it.
import type { Type, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/create-app';
import type { AuthOverrides } from '../../src/auth/build-auth';
import type { IdentityVerificationPort, VerifyResult } from '../../src/auth/identity/identity-verification.port';
import type { IdentityDirectory, LocalUser } from '../../src/auth/identity/identity-directory';
import type { VerifiedSubject } from '../../src/auth/identity/identity-verification.port';

export const OWNER: VerifiedSubject = {
  providerKey: 'descope',
  issuer: 'https://api.descope.com/v1/apps/PkawalysTest0001',
  subject: 'UkawalysOwner0001',
};

/** Fake provider tokens. Each is a JWT-looking string so the Bearer parser accepts it. */
export const TOKENS = {
  owner: 'owner.valid.token',
  stranger: 'stranger.valid.token', // verified, but not the configured owner
  foreignIssuer: 'foreign.issuer.token', // the owner's subject from another issuer
  refused: 'refused.bad.token',
  unavailable: 'unavailable.idp.token',
} as const;

export class FakeIdentityVerifier implements IdentityVerificationPort {
  readonly seen: string[] = [];
  private readonly table: Record<string, VerifyResult> = {
    [TOKENS.owner]: { kind: 'verified', subject: OWNER },
    [TOKENS.stranger]: { kind: 'verified', subject: { ...OWNER, subject: 'UsomeoneElse0002' } },
    [TOKENS.foreignIssuer]: {
      kind: 'verified',
      subject: { ...OWNER, issuer: 'https://api.descope.com/v1/apps/P2rtProject0001' },
    },
    [TOKENS.unavailable]: { kind: 'unavailable' },
  };

  verify(rawToken: string): Promise<VerifyResult> {
    this.seen.push(rawToken);
    return Promise.resolve(this.table[rawToken] ?? { kind: 'refused' });
  }
}

/** A directory the test can repoint, to prove sessions die when the owner configuration changes. */
export class SwitchableDirectory implements IdentityDirectory {
  constructor(public owner: VerifiedSubject | null) {}
  resolve(subject: VerifiedSubject): Promise<LocalUser | null> {
    const o = this.owner;
    const ok = o !== null && o.providerKey === subject.providerKey && o.issuer === subject.issuer && o.subject === subject.subject;
    return Promise.resolve(ok ? { userId: 'kawalys-owner', role: 'owner' } : null);
  }
}

export class FakeClock {
  t = Date.UTC(2026, 10, 23, 9, 0, 0);
  readonly now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface TestApp {
  readonly app: INestApplication;
  readonly clock: FakeClock;
  readonly verifier: FakeIdentityVerifier;
  readonly directory: SwitchableDirectory;
  /** Exchanges the owner's provider token and returns the Cookie header value. */
  signIn(token?: string): Promise<string>;
  get(path: string, cookie?: string): request.Test;
}

export async function startApp(extraControllers: Type<unknown>[] = [], overrides: AuthOverrides = {}): Promise<TestApp> {
  const clock = new FakeClock();
  const verifier = new FakeIdentityVerifier();
  const directory = new SwitchableDirectory(OWNER);
  const app = await createApp(extraControllers, { verifier, directory, clock: clock.now, ...overrides });
  const server = app.getHttpServer();
  return {
    app,
    clock,
    verifier,
    directory,
    async signIn(token = TOKENS.owner) {
      const res = await request(server).post('/auth/session').set('Authorization', `Bearer ${token}`);
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      return setCookie[0]!.split(';')[0]!;
    },
    get(path, cookie) {
      const req = request(server).get(path);
      return cookie === undefined ? req : req.set('Cookie', cookie);
    },
  };
}

/** Status, body and headers with the per-request noise removed, for indistinguishability checks. */
export function shape(res: request.Response): unknown {
  const body = JSON.parse(res.text || 'null');
  if (body?.error) delete body.error.request_id;
  const headers = { ...res.headers };
  delete headers['date'];
  delete headers['x-request-id'];
  delete headers['content-length'];
  delete headers['etag'];
  return { status: res.status, body, headers };
}

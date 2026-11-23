import { InMemorySessionStore } from '../../src/auth/session/in-memory-session-store';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from '../../src/auth/session/session-cookie';
import { RAW_TOKEN_RE, SessionService } from '../../src/auth/session/session.service';
import type { SessionRecord, SessionStore, TokenHash } from '../../src/auth/session/session.types';
import { generateRawToken, hashToken } from '../../src/auth/tokens';

const SUBJECT = { providerKey: 'descope', issuer: 'https://api.descope.com/v1/apps/PkawalysTest0001', subject: 'UkawalysOwner0001' };
const OWNER = { userId: 'kawalys-owner', role: 'owner' } as const;
const HOUR = 3_600_000;
const POLICY = { absoluteTtlMs: 8 * HOUR, idleTtlMs: HOUR };

function setup(store: SessionStore = new InMemorySessionStore()) {
  const clock = { t: Date.UTC(2026, 10, 23, 9, 0, 0) };
  const service = new SessionService(store, () => clock.t, POLICY);
  return { clock, service, store };
}

describe('SessionService', () => {
  it('issues a 43-char base64url token and stores only its SHA-256', async () => {
    const { service, store } = setup();
    const issued = await service.issue(OWNER, SUBJECT);
    expect(issued.rawToken).toMatch(RAW_TOKEN_RE);
    const record = await store.get(hashToken(issued.rawToken) as TokenHash);
    expect(record).not.toBeNull();
    expect(JSON.stringify(record)).not.toContain(issued.rawToken);
    expect(record?.subject).toEqual(SUBJECT);
    expect(issued.maxAgeSeconds).toBe(8 * 3600);
  });

  it('authenticates a live session and slides its last-seen time', async () => {
    const { service, clock } = setup();
    const { rawToken } = await service.issue(OWNER, SUBJECT);
    clock.t += 10 * 60_000;
    const record = await service.authenticate(rawToken);
    expect(record?.userId).toBe('kawalys-owner');
    expect(record?.lastSeenAt).toBe(clock.t);
  });

  it('never queries the store for a token that cannot be one of ours', async () => {
    const calls: string[] = [];
    const inner = new InMemorySessionStore();
    const spy: SessionStore = {
      create: (r) => inner.create(r),
      get: (h) => (calls.push('get'), inner.get(h)),
      touch: (h, a) => inner.touch(h, a),
      revoke: (h) => (calls.push('revoke'), inner.revoke(h)),
      revokeAllForUser: (u) => inner.revokeAllForUser(u),
    };
    const { service } = setup(spy);
    for (const bad of ['', 'short', 'a'.repeat(44), 'a'.repeat(42) + '=', 'a'.repeat(42) + '!']) {
      await expect(service.authenticate(bad)).resolves.toBeNull();
      await expect(service.revoke(bad)).resolves.toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('denies an unknown well-formed token', async () => {
    const { service } = setup();
    await expect(service.authenticate(generateRawToken())).resolves.toBeNull();
  });

  it('expires at the absolute limit even with constant activity', async () => {
    const { service, clock } = setup();
    const { rawToken } = await service.issue(OWNER, SUBJECT);
    for (let i = 0; i < 7; i++) {
      clock.t += HOUR - 60_000;
      expect(await service.authenticate(rawToken)).not.toBeNull();
    }
    clock.t = Date.UTC(2026, 10, 23, 9, 0, 0) + 8 * HOUR;
    await expect(service.authenticate(rawToken)).resolves.toBeNull();
  });

  it('expires after an idle gap, and stays dead', async () => {
    const { service, clock } = setup();
    const { rawToken } = await service.issue(OWNER, SUBJECT);
    clock.t += HOUR;
    await expect(service.authenticate(rawToken)).resolves.toBeNull();
    clock.t -= HOUR / 2; // even if the clock were to look earlier again, the session is gone
    await expect(service.authenticate(rawToken)).resolves.toBeNull();
  });

  it('revoke ends a session; a second revoke reports nothing removed', async () => {
    const { service } = setup();
    const { rawToken } = await service.issue(OWNER, SUBJECT);
    await expect(service.revoke(rawToken)).resolves.toBe(true);
    await expect(service.authenticate(rawToken)).resolves.toBeNull();
    await expect(service.revoke(rawToken)).resolves.toBe(false);
  });

  it('revokeAllForUser ends every session of that user and no one else', async () => {
    const { service } = setup();
    const a = await service.issue(OWNER, SUBJECT);
    const b = await service.issue(OWNER, SUBJECT);
    const other = await service.issue({ userId: 'someone-else', role: 'owner' }, { ...SUBJECT, subject: 'UsomeoneElse' });
    await expect(service.revokeAllForUser('kawalys-owner')).resolves.toBe(2);
    await expect(service.authenticate(a.rawToken)).resolves.toBeNull();
    await expect(service.authenticate(b.rawToken)).resolves.toBeNull();
    await expect(service.authenticate(other.rawToken)).resolves.not.toBeNull();
  });
});

describe('InMemorySessionStore', () => {
  it('sweeps sessions past their absolute expiry when a new one is created', async () => {
    const { service, clock, store } = setup();
    const old = await service.issue(OWNER, SUBJECT);
    clock.t += 9 * HOUR;
    await service.issue(OWNER, SUBJECT);
    await expect(store.get(hashToken(old.rawToken) as TokenHash)).resolves.toBeNull();
  });

  it('does not mutate a record it already returned', async () => {
    const { service, clock, store } = setup();
    const { rawToken } = await service.issue(OWNER, SUBJECT);
    const hash = hashToken(rawToken) as TokenHash;
    const before = (await store.get(hash)) as SessionRecord;
    clock.t += 1000;
    await store.touch(hash, clock.t);
    expect(before.lastSeenAt).not.toBe(clock.t);
  });
});

describe('session cookie', () => {
  const token = generateRawToken();

  it('is a __Host- cookie: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain', () => {
    const header = setSessionCookie(token, 28_800);
    expect(header.startsWith(`${SESSION_COOKIE}=${token};`)).toBe(true);
    expect(SESSION_COOKIE.startsWith('__Host-')).toBe(true);
    for (const attr of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
      expect(header).toContain(attr);
    }
    expect(header).not.toMatch(/Domain=/i);
  });

  it('clears with Max-Age=0 and an empty value', () => {
    const header = clearSessionCookie();
    expect(header.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
  });

  it('reads the token among other cookies', () => {
    expect(readSessionToken(`a=1; ${SESSION_COOKIE}=${token}; b=2`)).toBe(token);
    expect(readSessionToken([`a=1`, `${SESSION_COOKIE}=${token}`])).toBe(token);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another cookie name', `kawalys_session=${'a'.repeat(43)}`],
    ['the name without the __Host- prefix', `x__Host-kawalys_session=${'a'.repeat(43)}`],
    ['a malformed value', `${SESSION_COOKIE}=not a token`],
    ['an oversized header', `${SESSION_COOKIE}=${'a'.repeat(9000)}`],
  ])('reads null for %s', (_label, header) => {
    expect(readSessionToken(header)).toBeNull();
  });

  it('refuses a repeated session cookie, even if one value is valid', () => {
    expect(readSessionToken(`${SESSION_COOKIE}=${token}; ${SESSION_COOKIE}=${generateRawToken()}`)).toBeNull();
    expect(readSessionToken(`${SESSION_COOKIE}=${generateRawToken()}; ${SESSION_COOKIE}=${token}`)).toBeNull();
  });
});

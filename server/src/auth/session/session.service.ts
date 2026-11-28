// Kawalys sessions. The Descope JWT is exchanged once for an opaque session token (32 random bytes). Only
// its SHA-256 is stored. A session ends at its absolute expiry, after an idle gap, or on revocation, and the
// store is behind a port. Pattern after Retail Tower `session.repository.ts` (reference only: absolute cap plus
// a sliding idle window); RT's Postgres, Redis cache and tenant context are not used.
import type { VerifiedSubject } from "../identity/identity-verification.port";
import type { LocalUser } from "../identity/identity-directory";
import { generateRawToken, hashToken, tokenHashesEqual } from "../tokens";
import type { RawToken, SessionRecord, SessionStore, TokenHash } from "./session.types";

export interface SessionPolicy {
  readonly absoluteTtlMs: number;
  readonly idleTtlMs: number;
}

export interface IssuedSession {
  readonly rawToken: RawToken;
  readonly expiresAt: number;
  /** Lifetime for the cookie's Max-Age, from the same clock and policy as expiresAt. */
  readonly maxAgeSeconds: number;
}

/** 32 random bytes as unpadded base64url. Anything else cannot be one of our tokens and is not even hashed. */
export const RAW_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const hashOf = (raw: string): TokenHash => hashToken(raw) as TokenHash;

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => number,
    private readonly policy: SessionPolicy,
  ) {}

  async issue(user: LocalUser, subject: VerifiedSubject): Promise<IssuedSession> {
    const rawToken = generateRawToken() as RawToken;
    const issuedAt = this.now();
    const record: SessionRecord = {
      tokenHash: hashOf(rawToken),
      userId: user.userId,
      subject: { ...subject },
      issuedAt,
      lastSeenAt: issuedAt,
      absoluteExpiresAt: issuedAt + this.policy.absoluteTtlMs,
    };
    await this.store.create(record);
    return { rawToken, expiresAt: record.absoluteExpiresAt, maxAgeSeconds: Math.floor(this.policy.absoluteTtlMs / 1000) };
  }

  /** Returns the live session for a presented token, or null (unknown, malformed, expired, idle or revoked). */
  async authenticate(raw: string): Promise<SessionRecord | null> {
    if (!RAW_TOKEN_RE.test(raw)) return null;
    const hash = hashOf(raw);
    const record = await this.store.get(hash);
    if (record === null || !tokenHashesEqual(record.tokenHash, hash)) return null;
    const at = this.now();
    if (at >= record.absoluteExpiresAt || at - record.lastSeenAt >= this.policy.idleTtlMs) {
      await this.store.revoke(hash);
      return null;
    }
    return this.store.touch(hash, at);
  }

  /**
   * The same verdict as authenticate (unknown, malformed, expired, idle or revoked is null) but a pure read: it never touches
   * last_seen_at, so a check on return to the tab cannot extend the idle window, and it revokes nothing. It returns the stored
   * record; the caller still rechecks the directory.
   */
  async peek(raw: string): Promise<SessionRecord | null> {
    if (!RAW_TOKEN_RE.test(raw)) return null;
    const hash = hashOf(raw);
    const record = await this.store.get(hash);
    if (record === null || !tokenHashesEqual(record.tokenHash, hash)) return null;
    const at = this.now();
    if (at >= record.absoluteExpiresAt || at - record.lastSeenAt >= this.policy.idleTtlMs) return null;
    return record;
  }

  async revoke(raw: string): Promise<boolean> {
    return RAW_TOKEN_RE.test(raw) ? this.store.revoke(hashOf(raw)) : false;
  }

  revokeAllForUser(userId: string): Promise<number> {
    return this.store.revokeAllForUser(userId);
  }
}

// Branded token types, re-derived from Retail Tower `packages/auth/src/types.ts` at
// b6ddc755f07a10165b2365a7307001e5fadea84d (technique only; RT's tenant, store and POS types are dropped).
// Assigning a plain string to RawToken, or a RawToken where a TokenHash is expected, is a compile error,
// which stops the wire token being persisted in place of its hash.
import type { VerifiedSubject } from "../identity/identity-verification.port";

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** The opaque session token as sent to the client once, in a cookie. Never persisted. */
export type RawToken = Brand<string, "RawToken">;

/** SHA-256 of the raw token: the only form the store sees. */
export type TokenHash = Brand<Buffer, "TokenHash">;

/** Times are epoch milliseconds from the injected clock. Records are never mutated; the store replaces them. */
export interface SessionRecord {
  readonly tokenHash: TokenHash;
  readonly userId: string;
  /** The verified provider triple the session was issued for, rechecked against the directory on every request. */
  readonly subject: VerifiedSubject;
  readonly issuedAt: number;
  readonly lastSeenAt: number;
  readonly absoluteExpiresAt: number;
}

/** Durable storage waits for the database decision (BACK-55); this is the seam it plugs into. */
export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  get(tokenHash: TokenHash): Promise<SessionRecord | null>;
  /** Returns the updated record, or null when the session no longer exists. */
  touch(tokenHash: TokenHash, at: number): Promise<SessionRecord | null>;
  /** Revocation: the session stops existing. Returns whether one was removed. */
  revoke(tokenHash: TokenHash): Promise<boolean>;
  /** Returns how many sessions were revoked. */
  revokeAllForUser(userId: string): Promise<number>;
}

import type { SessionRecord, SessionStore, TokenHash } from "./session.types";

const keyOf = (hash: TokenHash): string => hash.toString("hex");

/**
 * Process-local store. A restart drops every session (the owner signs in again), so a revoked session can
 * never come back; with several instances it is wrong, which is why a durable store is a gated follow-up.
 */
export class InMemorySessionStore implements SessionStore {
  private sessions: ReadonlyMap<string, SessionRecord> = new Map();

  create(record: SessionRecord): Promise<void> {
    const next = new Map<string, SessionRecord>();
    // Sweep sessions past their absolute expiry so the map is bounded by the session lifetime.
    for (const [key, existing] of this.sessions) {
      if (existing.absoluteExpiresAt > record.issuedAt) next.set(key, existing);
    }
    next.set(keyOf(record.tokenHash), record);
    this.sessions = next;
    return Promise.resolve();
  }

  get(tokenHash: TokenHash): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(keyOf(tokenHash)) ?? null);
  }

  touch(tokenHash: TokenHash, at: number): Promise<SessionRecord | null> {
    const key = keyOf(tokenHash);
    const existing = this.sessions.get(key);
    if (existing === undefined) return Promise.resolve(null);
    const updated: SessionRecord = { ...existing, lastSeenAt: at };
    this.sessions = new Map(this.sessions).set(key, updated);
    return Promise.resolve(updated);
  }

  revoke(tokenHash: TokenHash): Promise<boolean> {
    const key = keyOf(tokenHash);
    if (!this.sessions.has(key)) return Promise.resolve(false);
    const next = new Map(this.sessions);
    next.delete(key);
    this.sessions = next;
    return Promise.resolve(true);
  }

  revokeAllForUser(userId: string): Promise<number> {
    const next = new Map<string, SessionRecord>();
    for (const [key, record] of this.sessions) {
      if (record.userId !== userId) next.set(key, record);
    }
    const revoked = this.sessions.size - next.size;
    this.sessions = next;
    return Promise.resolve(revoked);
  }
}

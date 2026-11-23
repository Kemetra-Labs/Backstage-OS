// Kawalys sessions (BACK-56): opaque 256-bit cookie token, stored only as a SHA-256 hash.
// Adapted from Retail Tower services/backend-core/apps/api/src/auth/session.repository.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: plain `pg` (no drizzle), no cache interface, no active tenant/store,
// hashing with node:crypto instead of @data-pulse-2/auth, disabled users are refused.
// Idle timeout 12 h (sliding), absolute cap 24 h; activity never extends the absolute cap.
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export const SESSION_IDLE_HOURS = 12;
export const SESSION_ABSOLUTE_HOURS = 24;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash('sha256').update(token).digest();

export interface ActiveSession {
  readonly sessionId: string;
  readonly userId: string;
}

export class SessionStore {
  constructor(private readonly authPool: pg.Pool) {}

  async create(userId: string): Promise<{ token: string; sessionId: string }> {
    const token = randomBytes(32).toString('base64url');
    const { rows } = await this.authPool.query<{ id: string }>(
      `INSERT INTO sessions (user_id, credential_hash, absolute_expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3)) RETURNING id`,
      [userId, hashToken(token), SESSION_ABSOLUTE_HOURS],
    );
    return { token, sessionId: rows[0]!.id };
  }

  /** The live session for a raw cookie token, or null. Never throws on a malformed token. */
  async findActive(token: string): Promise<ActiveSession | null> {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const { rows } = await this.authPool.query<{ id: string; user_id: string; last_seen_at: Date }>(
      `SELECT s.id, s.user_id, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id AND u.status = 'active'
        WHERE s.credential_hash = $1
          AND s.revoked_at IS NULL
          AND s.absolute_expires_at > now()
          AND s.last_seen_at > now() - make_interval(hours => $2)
          AND EXISTS (SELECT 1 FROM external_identity_links l WHERE l.user_id = s.user_id AND l.status = 'active')`,
      [hashToken(token), SESSION_IDLE_HOURS],
    );
    const row = rows[0];
    if (!row) return null;
    if (Date.now() - row.last_seen_at.getTime() >= TOUCH_INTERVAL_MS) {
      // Best effort: a failed touch only shortens the idle window, it never extends access.
      await this.authPool
        .query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND revoked_at IS NULL AND absolute_expires_at > now()`, [row.id])
        .catch(() => undefined);
    }
    return { sessionId: row.id, userId: row.user_id };
  }

  /** Idempotent; keeps the first revocation time. */
  async revoke(sessionId: string): Promise<void> {
    await this.authPool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
  }
}

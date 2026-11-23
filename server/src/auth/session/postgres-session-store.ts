// Durable SessionStore (BACK-56 on BACK-55): the seam #76 left for BACK-55. Runs on the kawalys_auth
// pool. Only the SHA-256 token hash is stored. Revocation sets revoked_at (one-way, no DELETE grant)
// instead of removing the row; a revoked row is never returned. Activity times are capped at the
// database clock (the database refuses future activity).
// Pattern after Retail Tower services/backend-core/apps/api/src/auth/session.repository.ts at
// dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (reference only; see server/THIRD_PARTY.md).
import type pg from 'pg';
import type { SessionRecord, SessionStore, TokenHash } from './session.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = 'credential_hash, user_id, provider_key, issuer, subject, created_at, last_seen_at, absolute_expires_at';

interface Row {
  credential_hash: Buffer;
  user_id: string;
  provider_key: string;
  issuer: string;
  subject: string;
  created_at: Date;
  last_seen_at: Date;
  absolute_expires_at: Date;
}

const toRecord = (r: Row): SessionRecord => ({
  tokenHash: r.credential_hash as TokenHash,
  userId: r.user_id,
  subject: { providerKey: r.provider_key, issuer: r.issuer, subject: r.subject },
  issuedAt: r.created_at.getTime(),
  lastSeenAt: r.last_seen_at.getTime(),
  absoluteExpiresAt: r.absolute_expires_at.getTime(),
});

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly authPool: pg.Pool) {}

  async create(record: SessionRecord): Promise<void> {
    if (!UUID.test(record.userId)) throw new Error('session user id must be a database user id');
    await this.authPool.query(
      `INSERT INTO sessions (user_id, credential_hash, absolute_expires_at, last_seen_at, provider_key, issuer, subject)
       VALUES ($1, $2, to_timestamp($3 / 1000.0), least(to_timestamp($4 / 1000.0), now()), $5, $6, $7)`,
      [
        record.userId,
        record.tokenHash,
        record.absoluteExpiresAt,
        record.lastSeenAt,
        record.subject.providerKey,
        record.subject.issuer,
        record.subject.subject,
      ],
    );
  }

  async get(tokenHash: TokenHash): Promise<SessionRecord | null> {
    const { rows } = await this.authPool.query<Row>(
      `SELECT ${COLUMNS} FROM sessions WHERE credential_hash = $1 AND revoked_at IS NULL AND absolute_expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async touch(tokenHash: TokenHash, at: number): Promise<SessionRecord | null> {
    const { rows } = await this.authPool.query<Row>(
      `UPDATE sessions SET last_seen_at = least(to_timestamp($2 / 1000.0), now())
        WHERE credential_hash = $1 AND revoked_at IS NULL AND absolute_expires_at > now()
        RETURNING ${COLUMNS}`,
      [tokenHash, at],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async revoke(tokenHash: TokenHash): Promise<boolean> {
    const res = await this.authPool.query('UPDATE sessions SET revoked_at = now() WHERE credential_hash = $1 AND revoked_at IS NULL', [
      tokenHash,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    if (!UUID.test(userId)) return 0;
    const res = await this.authPool.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    return res.rowCount ?? 0;
  }
}

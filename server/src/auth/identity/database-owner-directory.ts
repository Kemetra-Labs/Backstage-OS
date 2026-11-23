// Database-backed IdentityDirectory (BACK-56 on BACK-55). Same contract as ConfiguredOwnerDirectory (#76):
// only the one configured owner triple resolves. The database adds a stable local user id (uuid), the
// identity link and the owner's personal workspace, so sessions and evidence survive a restart.
//
// The first resolve binds the configured identity in ONE transaction (user, link, owner_binding); the
// singleton primary key on owner_binding means a concurrent duplicate fails and simply reads the winner
// back. If the configured owner later changes, the new identity cannot bind: fail closed.
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { WorkspaceResolver } from '../workspace-resolver';
import type { IdentityDirectory, LocalUser, OwnerIdentity } from './identity-directory';
import type { VerifiedSubject } from './identity-verification.port';

const isUniqueViolation = (err: unknown) => (err as { code?: unknown })?.code === '23505';

const sameTriple = (a: VerifiedSubject, b: VerifiedSubject) =>
  a.providerKey === b.providerKey && a.issuer === b.issuer && a.subject === b.subject;

export class DatabaseOwnerDirectory implements IdentityDirectory {
  constructor(
    private readonly owner: OwnerIdentity | null,
    private readonly authPool: pg.Pool,
    private readonly workspaces: WorkspaceResolver,
  ) {}

  async resolve(subject: VerifiedSubject): Promise<LocalUser | null> {
    if (this.owner === null || !sameTriple(this.owner, subject)) return null;
    let userId = await this.linkedUser(subject);
    if (userId === undefined) userId = await this.bind(subject);
    if (!userId) return null;
    const principal = await this.workspaces.forUser(userId);
    return principal ? { userId, role: principal.role } : null;
  }

  /** The linked user id; null when the link or the user is disabled; undefined when there is no link yet. */
  private async linkedUser(subject: VerifiedSubject): Promise<string | null | undefined> {
    const { rows } = await this.authPool.query<{ user_id: string; active: boolean }>(
      `SELECT l.user_id, (l.status = 'active' AND u.status = 'active') AS active
         FROM external_identity_links l JOIN users u ON u.id = l.user_id
        WHERE l.provider_key = $1 AND l.issuer = $2 AND l.subject = $3`,
      [subject.providerKey, subject.issuer, subject.subject],
    );
    const row = rows[0];
    if (!row) return undefined;
    return row.active ? row.user_id : null;
  }

  private async bind(subject: VerifiedSubject): Promise<string | null> {
    const client = await this.authPool.connect();
    let userId = '';
    let failure: unknown;
    try {
      await client.query('BEGIN');
      userId = (await client.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0]!.id;
      await client.query(
        'INSERT INTO external_identity_links (provider_key, issuer, subject, user_id) VALUES ($1, $2, $3, $4)',
        [subject.providerKey, subject.issuer, subject.subject, userId],
      );
      await client.query('INSERT INTO owner_binding (user_id, owner_workspace_id) VALUES ($1, $2)', [userId, randomUUID()]);
      await client.query('COMMIT');
    } catch (err) {
      failure = err;
      await client.query('ROLLBACK').catch(() => undefined);
    }
    // A failed connection is destroyed, never returned to the pool.
    client.release(failure === undefined ? undefined : new Error('owner binding failed'));
    if (failure === undefined) return userId;
    if (!isUniqueViolation(failure)) throw failure;
    // Lost a race to the same identity (read the winner back), or another owner is already bound (null).
    return (await this.linkedUser(subject)) ?? null;
  }
}

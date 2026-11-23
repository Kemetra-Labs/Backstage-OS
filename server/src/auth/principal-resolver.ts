// Maps a verified provider subject to a Kawalys principal (BACK-56, Personal Alpha).
//
// Single owner. The FIRST sign-in whose provider-verified email equals the configured owner
// email binds that subject as the owner: user, identity link and owner_binding are written in
// ONE transaction, and the singleton primary key on owner_binding makes a concurrent second
// binding fail and roll back. After that the binding is pinned to (provider, issuer, subject):
// the email is never consulted again, and every other subject is refused.
//
// Every refusal is the same AuthRefused with no reason attached (callers map it to 404).
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { insertAuditRowInTransaction } from '../audit/audit-row.writer';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { capabilitiesFor, type Capability, type Role } from './capabilities';
import type { VerifiedSubject } from './identity-provider.port';

export class AuthRefused extends Error {
  constructor() {
    super('authentication refused');
  }
}

export interface Principal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: Role;
  readonly capabilities: readonly Capability[];
}

export interface PrincipalResolverOptions {
  readonly authPool: pg.Pool;
  readonly appPool: pg.Pool;
  readonly ownerEmail: string;
  /**
   * Optional out-of-band pin (KAWALYS_OWNER_SUBJECT): when set, only this provider subject may
   * become the owner. Recommended before the first real sign-in, because otherwise the first
   * token with the verified owner email wins permanently (security review S2, MEDIUM 3).
   */
  readonly ownerSubject?: string;
}

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown) => (err as { code?: unknown })?.code === UNIQUE_VIOLATION;

/** The pre-binding gate: provider-verified owner email, and the pinned subject when configured. */
export function mayBindOwner(subject: VerifiedSubject, ownerEmail: string, ownerSubject: string | undefined): boolean {
  if (!subject.emailVerified || subject.email !== ownerEmail) return false;
  return ownerSubject === undefined || subject.subject === ownerSubject;
}

export class PrincipalResolver {
  private readonly ownerEmail: string;

  constructor(private readonly options: PrincipalResolverOptions) {
    // ASCII check BEFORE lower-casing: toLowerCase folds some non-ASCII (e.g. U+212A) to ASCII.
    const raw = options.ownerEmail.trim();
    if (!/^[\x21-\x3f\x41-\x7e]+@[\x21-\x3f\x41-\x7e]+$/.test(raw)) throw new Error('owner email is malformed');
    this.ownerEmail = raw.toLowerCase();
    if (options.ownerSubject !== undefined && !/^[\x21-\x7e]{1,256}$/.test(options.ownerSubject)) {
      throw new Error('owner subject is malformed');
    }
  }

  async signIn(subject: VerifiedSubject): Promise<Principal> {
    const userId = (await this.linkedUser(subject)) ?? (await this.bindOwner(subject));
    const principal = await this.forUser(userId);
    if (!principal) throw new AuthRefused();
    return principal;
  }

  /** The principal of an active user, or null. */
  async forUser(userId: string): Promise<Principal | null> {
    const { rows } = await this.options.authPool.query<{ workspace_id: string }>(
      `SELECT b.owner_workspace_id AS workspace_id FROM owner_binding b JOIN users u ON u.id = b.user_id AND u.status = 'active'
        WHERE b.user_id = $1
          AND EXISTS (SELECT 1 FROM external_identity_links l WHERE l.user_id = b.user_id AND l.status = 'active')`,
      [userId],
    );
    const workspaceId = rows[0]?.workspace_id;
    if (!workspaceId) return null;
    const role = await this.ensureOwnerWorkspace(workspaceId, userId);
    return role ? { userId, workspaceId, role, capabilities: [...capabilitiesFor(role)] } : null;
  }

  private async linkedUser(subject: VerifiedSubject): Promise<string | null> {
    const { rows } = await this.options.authPool.query<{ user_id: string; link_status: string; user_status: string }>(
      `SELECT l.user_id, l.status AS link_status, u.status AS user_status
         FROM external_identity_links l JOIN users u ON u.id = l.user_id
        WHERE l.provider_key = $1 AND l.issuer = $2 AND l.subject = $3`,
      [subject.providerKey, subject.issuer, subject.subject],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.link_status !== 'active' || row.user_status !== 'active') throw new AuthRefused();
    return row.user_id;
  }

  private async bindOwner(subject: VerifiedSubject): Promise<string> {
    if (!mayBindOwner(subject, this.ownerEmail, this.options.ownerSubject)) throw new AuthRefused();
    const client = await this.options.authPool.connect();
    let userId = '';
    let failure: unknown;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
      userId = rows[0]!.id;
      await client.query(
        'INSERT INTO external_identity_links (provider_key, issuer, subject, user_id) VALUES ($1, $2, $3, $4)',
        [subject.providerKey, subject.issuer, subject.subject, userId],
      );
      await client.query('INSERT INTO owner_binding (user_id, owner_workspace_id, bound_email) VALUES ($1, $2, $3)', [
        userId,
        randomUUID(),
        this.ownerEmail,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      failure = err;
      await client.query('ROLLBACK').catch(() => undefined);
    }
    // A failed connection is destroyed, never returned to the pool.
    client.release(failure === undefined ? undefined : new Error('owner binding failed'));
    if (failure !== undefined) throw isUniqueViolation(failure) ? new AuthRefused() : failure;
    return userId;
  }

  /** The member's role in its workspace, creating the owner workspace on first use. */
  private async ensureOwnerWorkspace(workspaceId: string, userId: string): Promise<Role | null> {
    const attempt = () =>
      runWithWorkspaceContext(this.options.appPool, workspaceId, async (c) => {
        const member = await c.query<{ role: Role }>('SELECT role FROM memberships WHERE user_id = $1', [userId]);
        if (member.rows[0]) return member.rows[0].role;
        const existing = await c.query('SELECT 1 FROM workspaces');
        if ((existing.rowCount ?? 0) > 0) return null; // inconsistent state: fail closed
        await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [workspaceId, userId]);
        await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [workspaceId, userId]);
        await insertAuditRowInTransaction(c, {
          workspaceId,
          actorUserId: userId,
          action: 'owner.bound',
          targetType: 'workspace',
          targetId: workspaceId,
          requestId: null,
          metadata: {},
        });
        return 'owner' as const;
      });
    try {
      return await attempt();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return attempt(); // a concurrent first use created it; read it back
    }
  }
}

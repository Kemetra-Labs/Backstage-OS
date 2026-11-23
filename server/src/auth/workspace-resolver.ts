// The signed-in user's workspace, role and capabilities (BACK-56 on BACK-55). The global AuthGuard (#76)
// proves who the user is; this adds where they work and what they may do. Capabilities are server-side
// and deny by default; the demo persona header never grants anything.
import type pg from 'pg';
import { insertAuditRowInTransaction } from '../audit/audit-row.writer';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { capabilitiesFor, type Capability, type Role } from './capabilities';

export interface WorkspacePrincipal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: Role;
  readonly capabilities: readonly Capability[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUniqueViolation = (err: unknown) => (err as { code?: unknown })?.code === '23505';

export class WorkspaceResolver {
  constructor(
    private readonly appPool: pg.Pool,
    private readonly authPool: pg.Pool,
  ) {}

  /** The workspace principal of an active, linked owner, creating the owner workspace on first use; else null. */
  async forUser(userId: string): Promise<WorkspacePrincipal | null> {
    if (!UUID.test(userId)) return null;
    const { rows } = await this.authPool.query<{ workspace_id: string }>(
      `SELECT b.owner_workspace_id AS workspace_id
         FROM owner_binding b JOIN users u ON u.id = b.user_id AND u.status = 'active'
        WHERE b.user_id = $1
          AND EXISTS (SELECT 1 FROM external_identity_links l WHERE l.user_id = b.user_id AND l.status = 'active')`,
      [userId],
    );
    const workspaceId = rows[0]?.workspace_id;
    if (!workspaceId) return null;
    const role = await this.ensureOwnerWorkspace(workspaceId, userId);
    return role ? { userId, workspaceId, role, capabilities: [...capabilitiesFor(role)] } : null;
  }

  private async ensureOwnerWorkspace(workspaceId: string, userId: string): Promise<Role | null> {
    const attempt = () =>
      runWithWorkspaceContext(this.appPool, workspaceId, async (c) => {
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

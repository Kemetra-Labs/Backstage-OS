// An audit row written INSIDE the caller's transaction (BACK-55), so a change and its audit
// row commit or roll back together. Call it on the client given by runWithWorkspaceContext.
// Adapted from Retail Tower services/backend-core/apps/api/src/audit/audit-row.writer.ts
// at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c (Apache-2.0); see server/THIRD_PARTY.md.
// Kawalys changes: workspace instead of tenant, no store, id from the database default.
// Ids, codes and labels only in `metadata`: never raw source content or secrets.
import type pg from 'pg';

export interface TransactionalAuditRow {
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requestId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const INSERT_SQL = `INSERT INTO audit_events (workspace_id, actor_user_id, action, target_type, target_id, request_id, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`;

export async function insertAuditRowInTransaction(
  client: Pick<pg.PoolClient, 'query'>,
  row: TransactionalAuditRow,
): Promise<void> {
  await client.query(INSERT_SQL, [
    row.workspaceId,
    row.actorUserId,
    row.action,
    row.targetType,
    row.targetId,
    row.requestId,
    JSON.stringify(row.metadata),
  ]);
}

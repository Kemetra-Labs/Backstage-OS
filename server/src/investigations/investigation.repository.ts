// Investigation reads (BACK-50 server slice). Runs in the workspace context (forced RLS). An
// investigation is visible exactly when its project is (PROJECT_VISIBLE: an active grant on one of
// the project's sources), so these routes never reveal a project the reader cannot see (GET /evidence
// has one pre-existing exception for uncited decisions; see Known limits in server/README.md).
// Kawalys-owned BUILD on the BACK-55 store; no schema change.
import type pg from 'pg';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { UUID } from '../evidence/evidence.types';
import { PROJECT_VISIBLE } from '../evidence/visibility';

/** At most this many investigations, newest first. Documented in server/README.md. */
export const INVESTIGATION_LIMIT = 100;

export interface InvestigationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: 'open' | 'closed';
  readonly createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  title: string;
  status: 'open' | 'closed';
  created_at: Date;
}

const toRecord = (r: Row): InvestigationRecord => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

export class InvestigationRepository {
  constructor(private readonly pool: pg.Pool) {}

  /** Visible investigations, optionally of one project; an unknown or invisible project gives []. */
  async list(workspaceId: string, user: string, filter: { projectId?: string }): Promise<InvestigationRecord[]> {
    if (filter.projectId !== undefined && !UUID.test(filter.projectId)) return [];
    return runWithWorkspaceContext(this.pool, workspaceId, async (c) => {
      const { rows } = await c.query<Row>(
        `SELECT i.id, i.project_id, i.title, i.status, i.created_at FROM investigations i
          WHERE ($2::uuid IS NULL OR i.project_id = $2) AND ${PROJECT_VISIBLE('i.project_id')}
          ORDER BY i.created_at DESC, i.id
          LIMIT ${INVESTIGATION_LIMIT}`,
        [user, filter.projectId ?? null],
      );
      return rows.map(toRecord);
    });
  }

  /** One visible investigation; null when it is absent, malformed or invisible (callers answer 404). */
  async get(workspaceId: string, user: string, id: string): Promise<InvestigationRecord | null> {
    if (!UUID.test(id)) return null;
    return runWithWorkspaceContext(this.pool, workspaceId, async (c) => {
      const { rows } = await c.query<Row>(
        `SELECT i.id, i.project_id, i.title, i.status, i.created_at FROM investigations i
          WHERE i.id = $2 AND ${PROJECT_VISIBLE('i.project_id')}`,
        [user, id],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    });
  }
}

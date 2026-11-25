// Portfolio reads (BACK-49 slice 2). A thin fetch; the states are derived in portfolio.model.ts.
// Runs in the workspace context (forced RLS). A project is visible only through a source the
// reader holds an active grant on, and only granted sources are listed or counted, so the
// portfolio never reveals that a project or source exists to a reader without a grant.
// Kawalys-owned BUILD on the BACK-55 evidence store; no schema change.
import type pg from 'pg';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { UUID } from '../evidence/evidence.types';
import { summarizeProject, summarizeSource, type BatchRow, type ProjectSummary } from './portfolio.model';

/** At most this many projects, ordered by key. Documented in server/README.md. */
export const PROJECT_LIMIT = 100;

/** $1 holds an active grant on source `alias`. */
const GRANTED = (alias: string) =>
  `EXISTS (SELECT 1 FROM source_grants g WHERE g.source_id = ${alias}.id AND g.user_id = $1 AND g.revoked_at IS NULL)`;

interface SourceRow {
  project_id: string;
  project_key: string;
  project_name: string;
  source_id: string;
  provider: string;
  external_ref: string;
}

interface EvidenceRow {
  id: string;
  source_id: string;
  state: BatchRow['state'];
  source_ref: string;
  observed_at: Date;
  payload: Record<string, unknown>;
}

// The latest read of a source is the newest ingest batch (one transaction, one database-set
// received_at) that holds a repository-level record. Newer rows of another kind for the same
// source (a later Correlation, for example) never hide the read.
const LATEST_READ = `
  WITH latest AS (
    SELECT e.source_id, max(e.received_at) AS at
      FROM evidence e
     WHERE e.source_id = ANY($2::uuid[]) AND e.type = 'Observation'
       AND (e.payload->>'kind' = 'repository'
            OR (e.payload->>'kind' = 'source_status' AND e.payload->>'endpoint' = 'repository'))
     GROUP BY e.source_id)
  SELECT e.id, e.source_id, e.state, e.source_ref, e.observed_at, e.payload
    FROM evidence e
    JOIN latest l ON l.source_id = e.source_id AND e.received_at = l.at
    JOIN sources s ON s.id = e.source_id
   WHERE e.type = 'Observation' AND ${GRANTED('s')}
   ORDER BY e.source_id, e.source_ref, e.id`;

export class PortfolioRepository {
  constructor(private readonly pool: pg.Pool) {}

  /** Every visible project with its granted sources; `withItems` adds the latest read's items. */
  async list(workspaceId: string, user: string, options: { projectId?: string; withItems: boolean }): Promise<ProjectSummary[]> {
    if (options.projectId !== undefined && !UUID.test(options.projectId)) return [];
    return runWithWorkspaceContext(this.pool, workspaceId, async (c) => {
      const { rows: sources } = await c.query<SourceRow>(
        `WITH visible AS (
           SELECT p.id, p.key, p.name FROM projects p
            WHERE ($2::uuid IS NULL OR p.id = $2)
              AND EXISTS (SELECT 1 FROM sources s WHERE s.project_id = p.id AND ${GRANTED('s')})
            ORDER BY p.key LIMIT ${PROJECT_LIMIT})
         SELECT v.id AS project_id, v.key AS project_key, v.name AS project_name,
                s.id AS source_id, s.provider, s.external_ref
           FROM visible v JOIN sources s ON s.project_id = v.id
          WHERE ${GRANTED('s')}
          ORDER BY v.key, s.external_ref, s.id`,
        [user, options.projectId ?? null],
      );
      if (sources.length === 0) return [];
      const { rows: evidence } = await c.query<EvidenceRow>(LATEST_READ, [user, sources.map((s) => s.source_id)]);
      return assemble(sources, evidence, options.withItems);
    });
  }
}

function assemble(sources: readonly SourceRow[], evidence: readonly EvidenceRow[], withItems: boolean): ProjectSummary[] {
  const batches = new Map<string, BatchRow[]>();
  for (const e of evidence) {
    const batch = batches.get(e.source_id) ?? [];
    batch.push({ id: e.id, state: e.state, sourceRef: e.source_ref, observedAt: e.observed_at.toISOString(), payload: e.payload });
    batches.set(e.source_id, batch);
  }
  const projects = new Map<string, { ref: { id: string; key: string; name: string }; sources: ReturnType<typeof summarizeSource>[] }>();
  for (const s of sources) {
    const entry = projects.get(s.project_id) ?? { ref: { id: s.project_id, key: s.project_key, name: s.project_name }, sources: [] };
    const summary = summarizeSource({ id: s.source_id, provider: s.provider, externalRef: s.external_ref }, batches.get(s.source_id) ?? []);
    entry.sources.push(withItems ? summary : { ...summary, items: [] });
    projects.set(s.project_id, entry);
  }
  return [...projects.values()].map((p) => summarizeProject(p.ref, p.sources));
}

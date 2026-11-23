// Evidence persistence (BACK-55 S3). Every call runs in its workspace context (forced RLS),
// and every read also requires an active source grant for the reading user, so a count, a
// filter or a decision can never see a hidden row. Writes that change permissions or record
// a decision commit together with their audit row. Kawalys-owned BUILD (no donor code fits).
import type pg from 'pg';
import { insertAuditRowInTransaction, type TransactionalAuditRow } from '../audit/audit-row.writer';
import { runWithWorkspaceContext } from '../db/workspace-context';
import {
  EVIDENCE_STATES,
  NotVisibleError,
  UUID,
  type EvidenceFilter,
  type EvidenceRecord,
  type EvidenceState,
  type EvidenceType,
} from './evidence.types';

export interface ObservationInput {
  readonly sourceId: string;
  /** Source-derived types only; HumanDecision goes through recordDecision. */
  readonly type: Exclude<EvidenceType, 'HumanDecision'>;
  readonly state: EvidenceState;
  readonly sourceRef: string;
  readonly observedAt: Date;
  readonly investigationId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DecisionInput {
  readonly investigationId: string;
  readonly decision: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
}

type AuditWriter = (client: Pick<pg.PoolClient, 'query'>, row: TransactionalAuditRow) => Promise<void>;

const LIST_LIMIT = 500;
const SOURCE_TYPES = new Set(['Observation', 'Correlation', 'Hypothesis']);

/** $1 holds an active grant on the source of evidence row `alias`. */
const GRANTED = (alias: string) =>
  `EXISTS (SELECT 1 FROM source_grants g WHERE g.source_id = ${alias}.source_id AND g.user_id = $1 AND g.revoked_at IS NULL)`;

/**
 * Visible to user $1: source evidence needs an active grant on its source; a HumanDecision is
 * visible only if EVERY row it cites is visible, so a decision never reveals restricted evidence.
 */
const VISIBLE = `(CASE WHEN e.type = 'HumanDecision'
    THEN NOT EXISTS (SELECT 1 FROM evidence_citations c JOIN evidence ce ON ce.id = c.evidence_id
                      WHERE c.decision_id = e.id AND NOT ${GRANTED('ce')})
    ELSE ${GRANTED('e')} END)`;

const COLUMNS = `e.id, e.type, e.state, e.project_id, e.source_id, e.investigation_id, e.source_ref,
  e.observed_at, e.received_at, e.payload,
  COALESCE((SELECT array_agg(c.evidence_id::text ORDER BY c.evidence_id) FROM evidence_citations c
             WHERE c.decision_id = e.id), '{}') AS citations`;

interface Row {
  id: string;
  type: EvidenceType;
  state: EvidenceState;
  project_id: string;
  source_id: string | null;
  investigation_id: string | null;
  source_ref: string;
  observed_at: Date;
  received_at: Date;
  payload: Record<string, unknown>;
  citations: string[];
}

const toRecord = (r: Row): EvidenceRecord => ({
  id: r.id,
  type: r.type,
  state: r.state,
  projectId: r.project_id,
  sourceId: r.source_id,
  investigationId: r.investigation_id,
  sourceRef: r.source_ref,
  observedAt: r.observed_at.toISOString(),
  receivedAt: r.received_at.toISOString(),
  payload: r.payload,
  citations: r.citations,
});

function assertObservation(o: ObservationInput): void {
  if (!SOURCE_TYPES.has(o.type)) throw new TypeError('ingest accepts source-derived evidence types only');
  if (!(EVIDENCE_STATES as readonly string[]).includes(o.state)) throw new TypeError('invalid evidence state');
  if (!UUID.test(o.sourceId)) throw new TypeError('invalid source id');
  if (o.investigationId !== undefined && !UUID.test(o.investigationId)) throw new TypeError('invalid investigation id');
  if (!(o.observedAt instanceof Date) || Number.isNaN(o.observedAt.getTime())) throw new TypeError('invalid observedAt');
  if (typeof o.payload !== 'object' || o.payload === null || Array.isArray(o.payload)) throw new TypeError('payload must be an object');
}

export class EvidenceRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly audit: AuditWriter = insertAuditRowInTransaction,
  ) {}

  private inWorkspace<T>(workspaceId: string, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    return runWithWorkspaceContext(this.pool, workspaceId, work);
  }

  // Callers must check the actor's capability (source.connect etc.) before these writes.

  async createProject(workspaceId: string, actor: string, input: { key: string; name: string }): Promise<string> {
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<{ id: string }>('INSERT INTO projects (workspace_id, key, name) VALUES ($1, $2, $3) RETURNING id', [
        workspaceId,
        input.key,
        input.name,
      ]);
      const id = rows[0]!.id;
      await this.audit(c, auditRow(workspaceId, actor, 'project.created', 'project', id));
      return id;
    });
  }

  async createInvestigation(workspaceId: string, actor: string, input: { projectId: string; title: string }): Promise<string> {
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO investigations (workspace_id, project_id, title) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, input.projectId, input.title],
      );
      const id = rows[0]!.id;
      await this.audit(c, auditRow(workspaceId, actor, 'investigation.created', 'investigation', id));
      return id;
    });
  }

  /**
   * Connect a source for `actor` and grant `actor` read access to its evidence.
   * An existing source is reused only in the same project and only by a user who held a grant
   * on it before (reconnecting after their own disconnect); nobody can attach themselves to a
   * source someone else connected. An active grant makes this a no-op.
   */
  async connectSource(workspaceId: string, actor: string, input: { projectId: string; provider: 'github'; externalRef: string }): Promise<string> {
    const externalRef = input.externalRef.trim().toLowerCase();
    return this.inWorkspace(workspaceId, async (c) => {
      const existing = await c.query<{ id: string; project_id: string }>(
        'SELECT id, project_id FROM sources WHERE provider = $1 AND external_ref = $2',
        [input.provider, externalRef],
      );
      const found = existing.rows[0];
      if (!found) {
        const { rows } = await c.query<{ id: string }>(
          'INSERT INTO sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, $3, $4) RETURNING id',
          [workspaceId, input.projectId, input.provider, externalRef],
        );
        const sourceId = rows[0]!.id;
        await c.query('INSERT INTO source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [workspaceId, sourceId, actor]);
        await this.audit(c, auditRow(workspaceId, actor, 'source.connected', 'source', sourceId));
        return sourceId;
      }
      if (found.project_id !== input.projectId) throw new NotVisibleError('source not visible');
      const grants = await c.query<{ active: boolean }>('SELECT revoked_at IS NULL AS active FROM source_grants WHERE source_id = $1 AND user_id = $2', [
        found.id,
        actor,
      ]);
      if (grants.rows.some((g) => g.active)) return found.id;
      if (grants.rows.length === 0) throw new NotVisibleError('source not visible');
      await c.query('INSERT INTO source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [workspaceId, found.id, actor]);
      await this.audit(c, auditRow(workspaceId, actor, 'source.reconnected', 'source', found.id));
      return found.id;
    });
  }

  /** Revoke `actor`'s grant; effective on the next read. Others' grants are unaffected. */
  async disconnectSource(workspaceId: string, actor: string, sourceId: string): Promise<void> {
    if (!UUID.test(sourceId)) throw new NotVisibleError();
    await this.inWorkspace(workspaceId, async (c) => {
      const res = await c.query('UPDATE source_grants SET revoked_at = now() WHERE source_id = $1 AND user_id = $2 AND revoked_at IS NULL', [
        sourceId,
        actor,
      ]);
      if ((res.rowCount ?? 0) === 0) throw new NotVisibleError();
      await this.audit(c, auditRow(workspaceId, actor, 'source.disconnected', 'source', sourceId));
    });
  }

  async hasActiveGrant(workspaceId: string, user: string, sourceId: string): Promise<boolean> {
    if (!UUID.test(sourceId)) return false;
    return this.inWorkspace(workspaceId, async (c) => {
      const { rowCount } = await c.query('SELECT 1 FROM source_grants WHERE source_id = $1 AND user_id = $2 AND revoked_at IS NULL', [
        sourceId,
        user,
      ]);
      return (rowCount ?? 0) > 0;
    });
  }

  /**
   * Server-internal ingestion (connector path). All-or-nothing: an invalid item, a source with
   * no active grant, or an investigation of another project rejects the whole batch. The grant
   * row is share-locked, so a concurrent revocation waits for this batch or wins outright.
   */
  async ingest(workspaceId: string, items: readonly ObservationInput[]): Promise<string[]> {
    items.forEach(assertObservation);
    return this.inWorkspace(workspaceId, async (c) => {
      const ids: string[] = [];
      for (const o of items) {
        const src = await c.query<{ project_id: string }>(
          `SELECT s.project_id FROM sources s JOIN source_grants g ON g.source_id = s.id AND g.revoked_at IS NULL
            WHERE s.id = $1 LIMIT 1 FOR SHARE OF g`,
          [o.sourceId],
        );
        const projectId = src.rows[0]?.project_id;
        if (!projectId) throw new Error('ingest refused: no active grant for source');
        // A composite foreign key also rejects an investigation of another project.
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id`,
          [workspaceId, projectId, o.sourceId, o.investigationId ?? null, o.type, o.state, o.sourceRef, o.observedAt, JSON.stringify(o.payload)],
        );
        ids.push(rows[0]!.id);
      }
      return ids;
    });
  }

  async list(workspaceId: string, user: string, filter: EvidenceFilter): Promise<EvidenceRecord[]> {
    const ids = [filter.sourceId, filter.investigationId, filter.projectId];
    if (ids.some((v) => v !== undefined && !UUID.test(v))) return [];
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<Row>(
        `SELECT ${COLUMNS} FROM evidence e
          WHERE ${VISIBLE}
            AND ($2::uuid IS NULL OR e.source_id = $2)
            AND ($3::uuid IS NULL OR e.investigation_id = $3)
            AND ($4::uuid IS NULL OR e.project_id = $4)
          ORDER BY e.observed_at DESC, e.id
          LIMIT ${LIST_LIMIT}`,
        [user, filter.sourceId ?? null, filter.investigationId ?? null, filter.projectId ?? null],
      );
      return rows.map(toRecord);
    });
  }

  async get(workspaceId: string, user: string, id: string): Promise<EvidenceRecord | null> {
    if (!UUID.test(id)) return null;
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<Row>(`SELECT ${COLUMNS} FROM evidence e WHERE ${VISIBLE} AND e.id = $2`, [user, id]);
      return rows[0] ? toRecord(rows[0]) : null;
    });
  }

  /**
   * A human decision, its citations and its audit row, in one transaction. Cited rows must be
   * source evidence of the same project that the decider can see now; their grants are
   * share-locked so a concurrent revocation cannot slip in between the check and the insert.
   */
  async recordDecision(workspaceId: string, actor: string, input: DecisionInput, requestId: string | null): Promise<string> {
    if (!UUID.test(input.investigationId) || input.evidenceIds.some((id) => !UUID.test(id))) throw new NotVisibleError();
    const cited = [...new Set(input.evidenceIds.map((id) => id.toLowerCase()))];
    return this.inWorkspace(workspaceId, async (c) => {
      const inv = await c.query<{ project_id: string }>('SELECT project_id FROM investigations WHERE id = $1', [input.investigationId]);
      const projectId = inv.rows[0]?.project_id;
      if (!projectId) throw new NotVisibleError('investigation not visible');
      if (cited.length > 0) {
        const { rows } = await c.query<{ id: string }>(
          `SELECT e.id FROM evidence e
             JOIN source_grants g ON g.source_id = e.source_id AND g.user_id = $1 AND g.revoked_at IS NULL
            WHERE e.id = ANY($2::uuid[]) AND e.project_id = $3 AND e.type <> 'HumanDecision'
            FOR SHARE OF g`,
          [actor, cited, projectId],
        );
        // At most one active grant per (source, user) (partial unique index), so one row per id.
        if (new Set(rows.map((r) => r.id)).size !== cited.length) throw new NotVisibleError('cited evidence not visible');
      }
      const payload = { decision: input.decision, rationale: input.rationale };
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
         VALUES ($1, $2, NULL, $3, 'HumanDecision', 'ok', 'kawalys:decision', now(), $4::jsonb) RETURNING id`,
        [workspaceId, projectId, input.investigationId, JSON.stringify(payload)],
      );
      const id = rows[0]!.id;
      if (cited.length > 0) {
        await c.query(
          `INSERT INTO evidence_citations (workspace_id, project_id, decision_id, evidence_id)
           SELECT $1, $2, $3, unnest($4::uuid[])`,
          [workspaceId, projectId, id, cited],
        );
      }
      await this.audit(c, { ...auditRow(workspaceId, actor, 'decision.recorded', 'evidence', id), requestId });
      return id;
    });
  }
}

function auditRow(workspaceId: string, actor: string, action: string, targetType: string, targetId: string): TransactionalAuditRow {
  return { workspaceId, actorUserId: actor, action, targetType, targetId, requestId: null, metadata: {} };
}

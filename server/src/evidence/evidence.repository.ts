// Evidence persistence (BACK-55 S3). Every call runs in its workspace context (forced RLS),
// and every read also requires an active source grant for the reading user, so a count, a
// filter or a decision can never see a hidden row. Writes that change permissions or record
// a decision commit together with their audit row. Kawalys-owned BUILD (no donor code fits).
import type pg from 'pg';
import { insertAuditRowInTransaction, type TransactionalAuditRow } from '../audit/audit-row.writer';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { IDEMPOTENCY_WINDOW_SECONDS, type IdempotencyClaim, type IdempotentAction } from './idempotency';
import {
  DECISION_LIMIT_MAX,
  EVIDENCE_STATES,
  IdempotencyConflictError,
  NOTE_TYPES,
  NotVisibleError,
  RefusedError,
  UUID,
  worstState,
  type DecisionPage,
  type EvidenceFilter,
  type EvidenceRecord,
  type EvidenceState,
  type EvidenceType,
  type NoteType,
  type SourceProvider,
} from './evidence.types';
import { decodeDecisionCursor, encodeDecisionCursor, InvalidCursorError, type DecisionCursorScope, type DecisionPosition } from './decision-cursor';
import { Reauthorization, type SourceApprovalPolicy, type SourceIdentity } from './source-approval';
import { PROJECT_VISIBLE } from './visibility';

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

export interface NoteInput {
  readonly investigationId: string;
  readonly type: NoteType;
  readonly text: string;
  readonly evidenceIds: readonly string[];
}

type AuditWriter = (client: Pick<pg.PoolClient, 'query'>, row: TransactionalAuditRow) => Promise<void>;

const LIST_LIMIT = 500;
const SOURCE_TYPES = new Set(['Observation', 'Correlation', 'Hypothesis']);

/** $1 holds an active grant on the source of evidence row `alias`. */
const GRANTED = (alias: string) =>
  `EXISTS (SELECT 1 FROM source_grants g WHERE g.source_id = ${alias}.source_id AND g.user_id = $1 AND g.revoked_at IS NULL)`;

/**
 * Visible to user $1: source evidence needs an active grant on its source. A HumanDecision needs
 * both its project to be visible (PROJECT_VISIBLE, the same rule as its investigation, so a decision
 * that cites nothing never reveals a hidden project) and EVERY row it cites to be visible, so a
 * decision never reveals restricted evidence. A decision's project_id is its investigation's.
 */
const VISIBLE = `(CASE WHEN e.type = 'HumanDecision'
    THEN ${PROJECT_VISIBLE('e.project_id')}
     AND NOT EXISTS (SELECT 1 FROM evidence_citations c JOIN evidence ce ON ce.id = c.evidence_id
                      WHERE c.decision_id = e.id AND NOT ${GRANTED('ce')})
    ELSE ${GRANTED('e')} END)`;

const COLUMNS = `e.id, e.type, e.state, e.project_id, e.source_id, e.investigation_id, e.source_ref,
  e.observed_at, e.received_at, e.payload,
  COALESCE((SELECT array_agg(c.evidence_id::text ORDER BY c.evidence_id) FROM evidence_citations c
             WHERE c.decision_id = e.id), '{}') AS citations`;

/**
 * The creator of decision `decisionIdExpr` (a SQL fragment chosen by the caller, never user input): the
 * actor of its `decision.recorded` audit row. Served by index audit_events_by_target (migration 0004),
 * whose constraint trigger also makes the row mandatory for every committed HumanDecision (BACK-100).
 */
export const DECISION_CREATOR = (decisionIdExpr: string): string =>
  `(SELECT a.actor_user_id FROM audit_events a
     WHERE a.target_type = 'evidence' AND a.target_id = ${decisionIdExpr} AND a.action = 'decision.recorded'
     ORDER BY a.occurred_at, a.id LIMIT 1)`;

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

interface DecisionRow {
  id: string;
  investigation_id: string;
  decision: string | null;
  rationale: string | null;
  received_at: Date;
  /** received_at in UTC with all six fractional digits, for the cursor (a JS Date keeps only milliseconds). */
  position_at: string;
  citations: string[];
  created_by: string | null;
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

/**
 * Membership in an approved set. Always `.some`: this is the only way the repository reads a set, so a test policy
 * can answer for every identity (test/evidence/approve-all-policy.ts) while the configured policy is a plain list.
 */
const isApproved = (set: readonly SourceIdentity[], id: SourceIdentity): boolean =>
  set.some((s) => s.provider === id.provider && s.externalRef === id.externalRef);

/** Serialises every identity decision for one project. Needs no table privilege (the app role cannot UPDATE projects). */
const lockProjectIdentity = (c: pg.PoolClient, workspaceId: string, projectId: string) =>
  c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`source-identity:${workspaceId}:${projectId}`]);

/** Every source the project already holds, active or revoked, is in the approved set. */
async function historyApproved(c: pg.PoolClient, projectId: string, approvedSet: readonly SourceIdentity[]): Promise<boolean> {
  const { rows } = await c.query<{ provider: SourceProvider; external_ref: string }>('SELECT provider, external_ref FROM sources WHERE project_id = $1', [projectId]);
  return rows.every((r) => isApproved(approvedSet, { provider: r.provider, externalRef: r.external_ref }));
}

/**
 * Inserts the source. Two first connects of one identity in different projects hold different advisory locks, so the
 * loser meets the unique (workspace, provider, external_ref) index: that is the same refusal as "bound elsewhere".
 */
async function insertSource(c: pg.PoolClient, workspaceId: string, projectId: string, id: SourceIdentity): Promise<string> {
  try {
    const { rows } = await c.query<{ id: string }>(
      'INSERT INTO sources (workspace_id, project_id, provider, external_ref) VALUES ($1, $2, $3, $4) RETURNING id',
      [workspaceId, projectId, id.provider, id.externalRef],
    );
    return rows[0]!.id;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new NotVisibleError('source not visible');
    throw err;
  }
}

async function hasActiveGrantIn(c: pg.PoolClient, sourceId: string, user: string): Promise<boolean> {
  const { rowCount } = await c.query('SELECT 1 FROM source_grants WHERE source_id = $1 AND user_id = $2 AND revoked_at IS NULL', [sourceId, user]);
  return (rowCount ?? 0) > 0;
}

async function projectOfSource(c: pg.PoolClient, sourceId: string): Promise<string> {
  return (await sourceIdentityOf(c, sourceId)).projectId;
}

async function sourceIdentityOf(c: pg.PoolClient, sourceId: string): Promise<{ projectId: string; identity: SourceIdentity }> {
  const { rows } = await c.query<{ project_id: string; provider: SourceProvider; external_ref: string }>(
    'SELECT project_id, provider, external_ref FROM sources WHERE id = $1',
    [sourceId],
  );
  if (!rows[0]) throw new NotVisibleError('source not visible');
  return { projectId: rows[0].project_id, identity: { provider: rows[0].provider, externalRef: rows[0].external_ref } };
}

/** A source with the key of its project, as the GitHub refresh runner needs it (BACK-52). */
export interface SourceForRefresh {
  readonly sourceId: string;
  readonly projectId: string;
  readonly projectKey: string;
  readonly identity: SourceIdentity;
}

interface SourceForRefreshRow {
  id: string;
  project_id: string;
  key: string;
  provider: SourceProvider;
  external_ref: string;
}

const toSourceForRefresh = (r: SourceForRefreshRow): SourceForRefresh => ({
  sourceId: r.id,
  projectId: r.project_id,
  projectKey: r.key,
  identity: { provider: r.provider, externalRef: r.external_ref },
});

export class EvidenceRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly policy: SourceApprovalPolicy,
    private readonly audit: AuditWriter = insertAuditRowInTransaction,
    /** How long an Idempotency-Key is remembered; injectable so a test can use a short window (audit rows cannot be backdated). */
    private readonly idempotencyWindowSeconds: number = IDEMPOTENCY_WINDOW_SECONDS,
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
   * FIRST connect of a source for `actor`, with a grant for `actor` (BACK-131). Everything runs in one transaction
   * under a per-project advisory lock, and every refusal is a NotVisibleError before any write:
   * the project must be visible to this workspace; the requested identity must be in the approved set for the
   * project's key; every source the project already holds (active or revoked) must also be in that set, so a
   * second identity, a replacement after revoke and a conflicting history are all refused. An identity bound in
   * another project, or a source the actor never held, is refused. An active grant makes this a no-op. A source
   * whose grants were all revoked is NOT reconnected here: that is reconnectSource, and only with a Reauthorization.
   */
  async connectSource(workspaceId: string, actor: string, input: { projectId: string; provider: SourceProvider; externalRef: string }): Promise<string> {
    if (!UUID.test(input.projectId)) throw new NotVisibleError('source not visible');
    const requested: SourceIdentity = { provider: input.provider, externalRef: input.externalRef.trim().toLowerCase() };
    return this.inWorkspace(workspaceId, async (c) => {
      await lockProjectIdentity(c, workspaceId, input.projectId);
      const approvedSet = await this.approvedSetOf(c, input.projectId);
      if (!isApproved(approvedSet, requested) || !(await historyApproved(c, input.projectId, approvedSet))) throw new NotVisibleError('source not visible');
      const existing = await c.query<{ id: string; project_id: string }>('SELECT id, project_id FROM sources WHERE provider = $1 AND external_ref = $2', [
        requested.provider,
        requested.externalRef,
      ]);
      const found = existing.rows[0];
      if (found) {
        if (found.project_id !== input.projectId || !(await hasActiveGrantIn(c, found.id, actor))) throw new NotVisibleError('source not visible');
        return found.id;
      }
      const sourceId = await insertSource(c, workspaceId, input.projectId, requested);
      await c.query('INSERT INTO source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [workspaceId, sourceId, actor]);
      await this.audit(c, auditRow(workspaceId, actor, 'source.connected', 'source', sourceId));
      return sourceId;
    });
  }

  /**
   * The only way back after the actor revoked their own grant (BACK-131). `reauth` is built from the sign-in time
   * of the actor's current session and must be at most REAUTH_MAX_AGE_MS old (never from the future); there is no
   * flag that skips it. The source must still be in the approved set of its project, no other identity of the
   * project may be unapproved, and the actor must have held a grant before. A new grant row is appended (history is
   * never updated or deleted) with a `source.reconnected` audit row. An active grant makes this a no-op.
   */
  async reconnectSource(workspaceId: string, actor: string, sourceId: string, reauth: Reauthorization): Promise<string> {
    // The clock is read here, never taken from the caller; only a Reauthorization made by fromSessionIssuedAt counts.
    if (!UUID.test(sourceId) || !Reauthorization.isGenuine(reauth) || !reauth.isFreshAt(Date.now())) throw new NotVisibleError('source not visible');
    return this.inWorkspace(workspaceId, async (c) => {
      await lockProjectIdentity(c, workspaceId, await projectOfSource(c, sourceId));
      // Re-verified under the lock: nothing read before it is trusted, and a long lock wait must not stretch the proof.
      if (!reauth.isFreshAt(Date.now())) throw new NotVisibleError('source not visible');
      const source = await sourceIdentityOf(c, sourceId);
      const approvedSet = await this.approvedSetOf(c, source.projectId);
      if (!isApproved(approvedSet, source.identity) || !(await historyApproved(c, source.projectId, approvedSet))) throw new NotVisibleError('source not visible');
      const grants = await c.query<{ active: boolean }>('SELECT revoked_at IS NULL AS active FROM source_grants WHERE source_id = $1 AND user_id = $2', [
        sourceId,
        actor,
      ]);
      if (grants.rows.length === 0) throw new NotVisibleError('source not visible');
      if (grants.rows.some((g) => g.active)) return sourceId;
      await c.query('INSERT INTO source_grants (workspace_id, source_id, user_id) VALUES ($1, $2, $3)', [workspaceId, sourceId, actor]);
      await this.audit(c, auditRow(workspaceId, actor, 'source.reconnected', 'source', sourceId));
      return sourceId;
    });
  }

  /** The approved identities for the key of project `projectId`; a project this workspace cannot see is NotVisible. */
  private async approvedSetOf(c: pg.PoolClient, projectId: string): Promise<readonly SourceIdentity[]> {
    const { rows } = await c.query<{ key: string }>('SELECT key FROM projects WHERE id = $1', [projectId]);
    if (!rows[0]) throw new NotVisibleError('source not visible');
    return this.policy.approvedIdentities(rows[0].key);
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

  /** READ ONLY (BACK-52). One source of this workspace with its project key; a source RLS hides is null. */
  async sourceForRefresh(workspaceId: string, sourceId: string): Promise<SourceForRefresh | null> {
    if (!UUID.test(sourceId)) return null;
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<SourceForRefreshRow>(
        'SELECT s.id, s.project_id, p.key, s.provider, s.external_ref FROM sources s JOIN projects p ON p.id = s.project_id WHERE s.id = $1',
        [sourceId],
      );
      return rows[0] ? toSourceForRefresh(rows[0]) : null;
    });
  }

  /** READ ONLY (BACK-52). Every GitHub source of this workspace, oldest first. Grants and approval are checked by the caller. */
  async githubSourcesForRefresh(workspaceId: string): Promise<SourceForRefresh[]> {
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<SourceForRefreshRow>(
        "SELECT s.id, s.project_id, p.key, s.provider, s.external_ref FROM sources s JOIN projects p ON p.id = s.project_id WHERE s.provider = 'github' ORDER BY s.created_at, s.id",
      );
      return rows.map(toSourceForRefresh);
    });
  }

  /** READ ONLY (BACK-52). The id of the project with this key in this workspace, or null. */
  async projectIdByKey(workspaceId: string, key: string): Promise<string | null> {
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<{ id: string }>('SELECT id FROM projects WHERE key = $1', [key]);
      return rows[0]?.id ?? null;
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

  /**
   * The caller's visible evidence, newest first, at most LIST_LIMIT rows. `type` (BACK-148, decision L2) is compared as text, case
   * and all, with the stored type (one of EVIDENCE_TYPES), so an unknown, misspelt or empty value matches nothing, like a malformed
   * id; it narrows the same VISIBLE rows and the same cap, so newer notes and decisions no longer crowd observations out.
   */
  async list(workspaceId: string, user: string, filter: EvidenceFilter & { readonly type?: string }): Promise<EvidenceRecord[]> {
    const ids = [filter.sourceId, filter.investigationId, filter.projectId];
    if (ids.some((v) => v !== undefined && !UUID.test(v))) return [];
    return this.inWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<Row>(
        `SELECT ${COLUMNS} FROM evidence e
          WHERE ${VISIBLE}
            AND ($2::uuid IS NULL OR e.source_id = $2)
            AND ($3::uuid IS NULL OR e.investigation_id = $3)
            AND ($4::uuid IS NULL OR e.project_id = $4)
            AND ($5::text IS NULL OR e.type = $5)
          ORDER BY e.observed_at DESC, e.id
          LIMIT ${LIST_LIMIT}`,
        [user, filter.sourceId ?? null, filter.investigationId ?? null, filter.projectId ?? null, filter.type ?? null],
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
   * Recent human decisions the user can see (BACK-59), newest first, optionally of one investigation, one page
   * at a time. The same VISIBLE rule as list() and get(), on every page: a decision is hidden unless its project
   * and every row it cites are visible. The creator comes from the `decision.recorded` audit row that
   * recordDecision() writes in the same transaction. A malformed investigation id matches nothing.
   *
   * Paging is keyset on (received_at, id), both descending, so decisions stored in one transaction (one
   * received_at) still have a total order: no item repeats or is skipped across pages, and a decision that
   * becomes hidden between two pages is simply absent from the later one. `cursor` is a nextCursor this method
   * issued for the same workspace, reader and investigation filter; anything else is a RefusedError (400),
   * never a silent first page. No index serves this order yet (the query sorted before paging too).
   */
  async recentDecisions(
    workspaceId: string,
    user: string,
    filter: { investigationId?: string; limit: number; cursor?: string },
  ): Promise<DecisionPage> {
    if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > DECISION_LIMIT_MAX) throw new RangeError('invalid decision limit');
    const scope: DecisionCursorScope = { workspaceId, userId: user, investigationId: filter.investigationId };
    const after = filter.cursor === undefined ? null : decisionPosition(filter.cursor, scope);
    if (filter.investigationId !== undefined && !UUID.test(filter.investigationId)) return { items: [], nextCursor: null };
    return this.inWorkspace(workspaceId, async (c) => {
      // One row more than the page tells whether another page exists, without a count.
      const { rows } = await c.query<DecisionRow>(
        `SELECT e.id, e.investigation_id, e.payload->>'decision' AS decision, e.payload->>'rationale' AS rationale,
                e.received_at,
                to_char(e.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS position_at,
                COALESCE((SELECT array_agg(c.evidence_id::text ORDER BY c.evidence_id) FROM evidence_citations c
                           WHERE c.decision_id = e.id), '{}') AS citations,
                ${DECISION_CREATOR('e.id')} AS created_by
           FROM evidence e
          WHERE e.type = 'HumanDecision' AND ${VISIBLE}
            AND ($2::uuid IS NULL OR e.investigation_id = $2)
            AND ($4::timestamptz IS NULL OR (e.received_at, e.id) < ($4::timestamptz, $5::uuid))
          ORDER BY e.received_at DESC, e.id DESC
          LIMIT $3`,
        [user, filter.investigationId ?? null, filter.limit + 1, after?.at ?? null, after?.id ?? null],
      );
      const page = rows.slice(0, filter.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => ({
          id: r.id,
          investigationId: r.investigation_id,
          decision: r.decision ?? '',
          rationale: r.rationale ?? '',
          citations: r.citations,
          createdBy: r.created_by,
          createdAt: r.received_at.toISOString(),
        })),
        nextCursor: rows.length > filter.limit && last ? encodeDecisionCursor({ at: last.position_at, id: last.id }, scope) : null,
      };
    });
  }

  /**
   * A human decision, its citations and its audit row, in one transaction. Cited rows must be
   * source evidence of the same project that the decider can see now; their grants are
   * share-locked so a concurrent revocation cannot slip in between the check and the insert.
   */
  async recordDecision(workspaceId: string, actor: string, input: DecisionInput, requestId: string | null, extras: WriteExtras = {}): Promise<string> {
    const cited = citedIds(input);
    return this.inWorkspace(workspaceId, async (c) => {
      const replay = await this.priorWrite(c, workspaceId, actor, 'decision.recorded', extras.idempotency);
      if (replay !== null) {
        // The same request again: answer with the recorded id only while the caller can still see what it cites.
        const replayProject = await visibleInvestigationProject(c, actor, input.investigationId);
        await visibleCitations(c, actor, cited, replayProject);
        return replay;
      }
      const projectId = await visibleInvestigationProject(c, actor, input.investigationId);
      await visibleCitations(c, actor, cited, projectId);
      const payload = { decision: input.decision, rationale: input.rationale };
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
         VALUES ($1, $2, NULL, $3, 'HumanDecision', 'ok', 'kawalys:decision', now(), $4::jsonb) RETURNING id`,
        [workspaceId, projectId, input.investigationId, JSON.stringify(payload)],
      );
      const id = rows[0]!.id;
      await insertCitations(c, workspaceId, projectId, id, cited);
      await this.audit(c, { ...auditRow(workspaceId, actor, 'decision.recorded', 'evidence', id), requestId, metadata: writeMetadata(extras) });
      return id;
    });
  }

  /**
   * Idempotency (BACK-172 G3), inside the write transaction. With a claim: serialise on (workspace, actor, action,
   * key) with a transaction advisory lock, then look for an audit row of this action by this actor carrying the same
   * key hash within the window. Null = not seen, write as usual (the row then stores the claim). A different request
   * hash is a conflict. Without a claim nothing is locked or read. RLS keeps other workspaces out; the actor filter
   * keeps other principals out. The caller re-authorizes a replay before answering with the id.
   */
  private async priorWrite(
    c: pg.PoolClient,
    workspaceId: string,
    actor: string,
    action: IdempotentAction,
    claim: IdempotencyClaim | undefined,
  ): Promise<string | null> {
    if (!claim) return null;
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [`idem:${workspaceId}:${actor}:${action}:${claim.keyHash}`]);
    const { rows } = await c.query<{ target_id: string; request_hash: string | null }>(
      `SELECT target_id, metadata->>'request_hash' AS request_hash FROM audit_events
        WHERE action = $1 AND actor_user_id = $2 AND metadata->>'idempotency_key_hash' = $3
          AND occurred_at > now() - make_interval(secs => $4::double precision)
        ORDER BY occurred_at DESC, id LIMIT 1`,
      [action, actor, claim.keyHash, this.idempotencyWindowSeconds],
    );
    const prior = rows[0];
    if (!prior) return null;
    if (prior.request_hash !== claim.requestHash) throw new IdempotencyConflictError('idempotency key reused for a different request');
    return prior.target_id;
  }

  /**
   * A user-written Correlation or Hypothesis (BACK-50, owner decision option a), its citations and its
   * audit row, in one transaction. It must cite at least one row; every cited row must be visible
   * source evidence of the investigation's project, and all of them must come from ONE source, which
   * the note inherits. A non-decision row is visible through a grant on its own source, so a reader who
   * can see the note can see everything it cites. Its state is the worst cited state: a note built on
   * unknown evidence is never shown as ok. Invisible ids answer like absent ones (NotVisibleError).
   */
  async recordNote(workspaceId: string, actor: string, input: NoteInput, requestId: string | null, extras: WriteExtras = {}): Promise<string> {
    if (!(NOTE_TYPES as readonly string[]).includes(input.type)) throw new RefusedError('a note is a Correlation or a Hypothesis');
    const cited = citedIds(input);
    if (cited.length === 0) throw new RefusedError('a note must cite evidence');
    return this.inWorkspace(workspaceId, async (c) => {
      const replay = await this.priorWrite(c, workspaceId, actor, 'note.recorded', extras.idempotency);
      if (replay !== null) {
        const replayProject = await visibleInvestigationProject(c, actor, input.investigationId);
        await visibleCitations(c, actor, cited, replayProject);
        return replay;
      }
      const projectId = await visibleInvestigationProject(c, actor, input.investigationId);
      const rows = await visibleCitations(c, actor, cited, projectId);
      const sources = new Set(rows.map((r) => r.source_id));
      if (sources.size !== 1) throw new RefusedError('cited evidence must come from one source');
      const [sourceId] = sources;
      const { rows: inserted } = await c.query<{ id: string }>(
        `INSERT INTO evidence (workspace_id, project_id, source_id, investigation_id, type, state, source_ref, observed_at, payload)
         VALUES ($1, $2, $3, $4, $5, $6, 'kawalys:note', now(), $7::jsonb) RETURNING id`,
        [workspaceId, projectId, sourceId, input.investigationId, input.type, worstState(rows.map((r) => r.state)), JSON.stringify({ text: input.text })],
      );
      const id = inserted[0]!.id;
      await insertCitations(c, workspaceId, projectId, id, cited);
      await this.audit(c, { ...auditRow(workspaceId, actor, 'note.recorded', 'evidence', id), requestId, metadata: writeMetadata(extras) });
      return id;
    });
  }
}

type Client = Pick<pg.PoolClient, 'query'>;

/** The keyset position in a GET /decisions cursor; a malformed or foreign cursor is refused (400). */
function decisionPosition(cursor: string, scope: DecisionCursorScope): DecisionPosition {
  try {
    return decodeDecisionCursor(cursor, scope);
  } catch (err) {
    if (err instanceof InvalidCursorError) throw new RefusedError('invalid cursor');
    throw err;
  }
}

/** Lower-cased, de-duplicated citation ids; any malformed id answers like an invisible one. */
function citedIds(input: { readonly investigationId: string; readonly evidenceIds: readonly string[] }): string[] {
  if (!UUID.test(input.investigationId) || input.evidenceIds.some((id) => !UUID.test(id))) throw new NotVisibleError();
  return [...new Set(input.evidenceIds.map((id) => id.toLowerCase()))];
}

/**
 * The project of an investigation the actor can see (PROJECT_VISIBLE, the rule of GET /investigations/:id,
 * written as a join so the grant rows can be share-locked): a concurrent revocation waits for this
 * write or wins outright. An investigation the actor cannot see does not exist for them.
 */
async function visibleInvestigationProject(c: Client, actor: string, investigationId: string): Promise<string> {
  const { rows } = await c.query<{ project_id: string }>(
    `SELECT i.project_id FROM investigations i
       JOIN sources vs ON vs.project_id = i.project_id
       JOIN source_grants vg ON vg.source_id = vs.id AND vg.user_id = $1 AND vg.revoked_at IS NULL
      WHERE i.id = $2
      FOR SHARE OF vg`,
    [actor, investigationId],
  );
  const projectId = rows[0]?.project_id;
  if (!projectId) throw new NotVisibleError('investigation not visible');
  return projectId;
}

interface CitedRow {
  id: string;
  source_id: string;
  state: EvidenceState;
}

/** Every cited id is source evidence of `projectId` that the actor can see now (grants share-locked). */
async function visibleCitations(c: Client, actor: string, cited: readonly string[], projectId: string): Promise<CitedRow[]> {
  if (cited.length === 0) return [];
  const { rows } = await c.query<CitedRow>(
    `SELECT e.id, e.source_id, e.state FROM evidence e
       JOIN source_grants g ON g.source_id = e.source_id AND g.user_id = $1 AND g.revoked_at IS NULL
      WHERE e.id = ANY($2::uuid[]) AND e.project_id = $3 AND e.type <> 'HumanDecision'
      FOR SHARE OF g`,
    [actor, cited, projectId],
  );
  // At most one active grant per (source, user) (partial unique index), so one row per id.
  if (new Set(rows.map((r) => r.id)).size !== cited.length) throw new NotVisibleError('cited evidence not visible');
  return rows;
}

async function insertCitations(c: Client, workspaceId: string, projectId: string, citing: string, cited: readonly string[]): Promise<void> {
  if (cited.length === 0) return;
  await c.query(
    `INSERT INTO evidence_citations (workspace_id, project_id, decision_id, evidence_id)
     SELECT $1, $2, $3, unnest($4::uuid[])`,
    [workspaceId, projectId, citing, cited],
  );
}

/** Per-request extras for the two human writes: the sanitized client correlation id and the idempotency claim. */
export interface WriteExtras {
  readonly clientRequestId?: string | null;
  readonly idempotency?: IdempotencyClaim;
}

/** Audit metadata for a human write: ids and hashes only, never the raw idempotency key. */
function writeMetadata(extras: WriteExtras): Record<string, unknown> {
  return {
    ...(extras.clientRequestId ? { client_request_id: extras.clientRequestId } : {}),
    ...(extras.idempotency ? { idempotency_key_hash: extras.idempotency.keyHash, request_hash: extras.idempotency.requestHash } : {}),
  };
}

function auditRow(workspaceId: string, actor: string, action: string, targetType: string, targetId: string): TransactionalAuditRow {
  return { workspaceId, actorUserId: actor, action, targetType, targetId, requestId: null, metadata: {} };
}

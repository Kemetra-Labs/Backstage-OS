// Memory read (BACK-105 S2): runs the single S2 statement (memory.sql.ts) inside the reader's
// workspace context (forced RLS) and projects the result. The statement applies the project filter,
// PROJECT_VISIBLE and the reader's active grants before any row is returned, so hidden rows never
// reach the projector (D4). Read-only: it writes nothing. Its one route is the COG-07 live search (src/cognition).
import type pg from 'pg';
import { runWithWorkspaceContext } from '../db/workspace-context';
import { UUID, type EvidenceState } from '../evidence/evidence.types';
import type { CollapsedInput, Marker, MarkerRole, RunRecord } from './memory.collapse';
import { isItemKind, isProvider, type ItemKind } from './memory.policy';
import { projectCollapsed } from './memory.projector';
import { ITEM_KIND_LIST, MEMORY_READ_SQL } from './memory.sql';
import type { MemoryProjection, MemorySource } from './memory.types';

export interface MemoryReadInput {
  readonly workspaceId: string;
  readonly userId: string;
  readonly projectId: string;
  /** Defaults to the database now() of the read. */
  readonly effectiveAt?: Date;
  readonly knownAt?: Date;
  readonly evaluationAt?: Date;
  readonly historyCap?: number;
  /**
   * Recorded purge horizons per source id (D6). No purge exists yet, so production passes none;
   * the parameter keeps the statement and the projector equal under a horizon.
   */
  readonly purgeHorizons?: ReadonlyMap<string, Date>;
}

interface ReadRow {
  readonly role: string;
  readonly id: string | null;
  readonly source_id: string | null;
  readonly source_ref: string | null;
  readonly kind: string | null;
  readonly state: string | null;
  readonly obs: Date | null;
  readonly rcv: Date | null;
  readonly payload: Record<string, unknown> | null;
  readonly first_id: string | null;
  readonly first_obs: Date | null;
  readonly first_rcv: Date | null;
  readonly last_rcv: Date | null;
  readonly n: number | null;
  readonly states: string[] | null;
  readonly retained: boolean | null;
  readonly first_row_rcv: Date | null;
  readonly last_row_rcv: Date | null;
}

const MARKER_ROLES: ReadonlySet<string> = new Set<MarkerRole>(['failure', 'list_page', 'scope_item', 'ambiguous']);
const iso = (d: Date | null, what: string): string => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error(`memory read: missing ${what}`);
  return d.toISOString();
};

function toRunRecord(r: ReadRow): RunRecord {
  if (!isItemKind(r.kind)) throw new Error('memory read: run of an unknown kind');
  return {
    sourceId: r.source_id!,
    sourceRef: r.source_ref!,
    kind: r.kind as ItemKind,
    firstId: r.first_id!,
    firstObservedAt: iso(r.first_obs, 'first_obs'),
    lastId: r.id!,
    lastObservedAt: iso(r.obs, 'obs'),
    lastState: r.state as EvidenceState,
    lastPayload: r.payload ?? {},
    firstReceivedAt: iso(r.first_rcv, 'first_rcv'),
    lastReceivedAt: iso(r.last_rcv, 'last_rcv'),
    firstRowReceivedAt: iso(r.first_row_rcv, 'first_row_rcv'),
    lastRowReceivedAt: iso(r.last_row_rcv, 'last_row_rcv'),
    count: r.n!,
    states: (r.states ?? []) as EvidenceState[],
    retained: r.retained === true,
  };
}

function toMarker(r: ReadRow): Marker {
  return {
    role: r.role as MarkerRole,
    row: {
      id: r.id!,
      sourceId: r.source_id!,
      type: 'Observation',
      state: r.state as EvidenceState,
      sourceRef: r.source_ref!,
      observedAt: iso(r.obs, 'obs'),
      receivedAt: iso(r.rcv, 'rcv'),
      payload: r.payload ?? {},
    },
  };
}

export interface MemoryRead {
  readonly input: CollapsedInput;
  readonly sources: readonly MemorySource[];
  readonly activeGrantIds: readonly string[];
  readonly now: string;
  readonly knownAt: string;
}

export class MemoryRepository {
  constructor(private readonly pool: pg.Pool) {}

  /** The raw S2 result: one statement, one snapshot. Exposed for the differential test. */
  async readCollapsed(q: MemoryReadInput): Promise<MemoryRead> {
    for (const [name, id] of [['workspaceId', q.workspaceId], ['userId', q.userId], ['projectId', q.projectId]] as const) {
      if (typeof id !== 'string' || !UUID.test(id)) throw new RangeError(`memory read: invalid ${name}`);
    }
    const horizons = [...(q.purgeHorizons ?? new Map<string, Date>())];
    const rows = await runWithWorkspaceContext(this.pool, q.workspaceId, async (c) => {
      const res = await c.query<ReadRow>(MEMORY_READ_SQL, [
        q.userId,
        q.projectId,
        q.knownAt ?? null,
        ITEM_KIND_LIST,
        horizons.map(([id]) => id),
        horizons.map(([, at]) => at),
      ]);
      return res.rows;
    });
    const clock = rows.find((r) => r.role === 'clock');
    const grants = rows.filter((r) => r.role === 'grant');
    const sources: MemorySource[] = grants.map((g) => {
      if (!isProvider(g.kind)) throw new Error('memory read: source with an unknown provider');
      const h = q.purgeHorizons?.get(g.source_id!);
      return { sourceId: g.source_id!, provider: g.kind, purgeHorizon: h ? h.toISOString() : null };
    });
    return {
      input: {
        runs: rows.filter((r) => r.role === 'run').map(toRunRecord),
        markers: rows.filter((r) => MARKER_ROLES.has(r.role)).map(toMarker),
      },
      sources,
      activeGrantIds: grants.map((g) => g.id!),
      now: iso(clock?.obs ?? null, 'clock now'),
      knownAt: iso(clock?.rcv ?? null, 'clock knownAt'),
    };
  }

  /** The memory projection for one reader and project, from one statement (D1, D3, D4). */
  async read(q: MemoryReadInput): Promise<MemoryProjection> {
    return this.projectionOf(q, await this.readCollapsed(q));
  }

  /**
   * Like read(), but null when the reader has no active grant on any source of the project (COG-07 live read).
   * A project that does not exist, one in another workspace and one with no visible source are the same null.
   */
  async readVisible(q: MemoryReadInput): Promise<MemoryProjection | null> {
    const r = await this.readCollapsed(q);
    return r.sources.length === 0 ? null : this.projectionOf(q, r);
  }

  private projectionOf(q: MemoryReadInput, r: MemoryRead): MemoryProjection {
    return projectCollapsed(r.input, {
      effectiveAt: q.effectiveAt?.toISOString() ?? r.now,
      knownAt: r.knownAt,
      evaluationAt: q.evaluationAt?.toISOString() ?? r.now,
      now: r.now,
      activeGrantIds: r.activeGrantIds,
      sources: r.sources,
      ...(q.historyCap === undefined ? {} : { historyCap: q.historyCap }),
    });
  }
}

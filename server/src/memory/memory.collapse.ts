// The collapsed projection input (BACK-105 S2). Raw evidence rows reduce to one record per run plus
// the few read markers the projector consults. `collapse()` below is the reference implementation;
// the S2 SQL statement (memory.sql.ts) must return exactly the same records for the same rows, and
// the differential test proves it. Times are whole milliseconds (the SQL truncates observed_at and
// received_at).
import type { EvidenceState } from '../evidence/evidence.types';
import { sha256 } from './memory.canonical';
import { CONTENT_FIELDS, isGithubHead, isItemKind, MARKER_KINDS, scopeRoot, type ItemKind } from './memory.policy';
import type { MemoryRequest, MemoryRow } from './memory.types';

/** One run: consecutive observations of one item with one content key (D2). */
export interface RunRecord {
  readonly sourceId: string;
  readonly sourceRef: string;
  readonly kind: ItemKind;
  readonly firstId: string;
  readonly firstObservedAt: string;
  readonly lastId: string;
  readonly lastObservedAt: string;
  readonly lastState: EvidenceState;
  readonly lastPayload: Readonly<Record<string, unknown>>;
  /** Min and max receivedAt over the run: the run's first and last known times. */
  readonly firstReceivedAt: string;
  readonly lastReceivedAt: string;
  /** receivedAt of the run's first and last rows: the tie-breakers of S1's row order. */
  readonly firstRowReceivedAt: string;
  readonly lastRowReceivedAt: string;
  readonly count: number;
  /** Distinct row states in the run, sorted by code unit. */
  readonly states: readonly EvidenceState[];
  readonly retained: boolean;
}

/**
 * Read markers (D3): the newest failure per ref, the newest successful list page per ref, the newest
 * item batch per scope root (its lowest-id row at that instant) and, for GitHub, one row per batch
 * with more than one repository-level row.
 */
export type MarkerRole = 'failure' | 'list_page' | 'scope_item' | 'ambiguous';
export interface Marker {
  readonly role: MarkerRole;
  readonly row: MemoryRow;
}

export interface CollapsedInput {
  readonly runs: readonly RunRecord[];
  readonly markers: readonly Marker[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const t = (iso: string, what: string): number => {
  const v = Date.parse(iso);
  if (!Number.isFinite(v)) throw new RangeError(`memory: invalid time for ${what}`);
  return v;
};
const isoMs = (iso: string, what: string): string => new Date(t(iso, what)).toISOString();
const kindOf = (r: MemoryRow): unknown => r.payload['kind'];

/** The content of a row: the provider-owned fields of its kind (D2), as one comparable key. */
export const contentKeyOf = (kind: ItemKind, payload: Readonly<Record<string, unknown>>): string =>
  sha256(Object.fromEntries(CONTENT_FIELDS[kind].map((f) => [f, payload[f] ?? null])));

/** Rows ordered by (observed, received, id), the run order of D2. */
const rowOrder = (a: MemoryRow, b: MemoryRow): number =>
  t(a.observedAt, a.id) - t(b.observedAt, b.id) || t(a.receivedAt, a.id) - t(b.receivedAt, b.id) || byCodeUnit(a.id, b.id);

/** Newest by (observed, id) with ties on observed broken by the highest id. */
const newestOf = (rows: readonly MemoryRow[]): MemoryRow | undefined =>
  [...rows].sort((a, b) => t(a.observedAt, a.id) - t(b.observedAt, b.id) || byCodeUnit(a.id, b.id)).at(-1);

/** Filter to what memory reads (D2 input filter, knownAt, involved sources) with whole-millisecond times. */
export function admissible(rows: readonly MemoryRow[], req: MemoryRequest): MemoryRow[] {
  const known = t(req.knownAt, 'knownAt');
  const sources = new Set(req.sources.map((s) => s.sourceId));
  return rows
    .filter((r) => r.type === 'Observation' && sources.has(r.sourceId) && (isItemKind(kindOf(r)) || MARKER_KINDS.has(kindOf(r) as string)))
    .map((r) => ({ ...r, observedAt: isoMs(r.observedAt, r.id), receivedAt: isoMs(r.receivedAt, r.id) }))
    .filter((r) => t(r.receivedAt, r.id) <= known);
}

function runsOf(items: readonly MemoryRow[], horizons: ReadonlyMap<string, number>): RunRecord[] {
  const groups = new Map<string, MemoryRow[]>();
  for (const r of items) {
    const key = JSON.stringify([r.sourceId, r.sourceRef, kindOf(r)]);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: RunRecord[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(rowOrder);
    const kind = kindOf(sorted[0]!) as ItemKind;
    const horizon = horizons.get(sorted[0]!.sourceId);
    let run: MemoryRow[] = [];
    let runRetained = false;
    const flush = () => {
      if (run.length > 0) out.push(toRecord(run, kind, runRetained));
    };
    for (const r of sorted) {
      const retained = horizon !== undefined && t(r.observedAt, r.id) < horizon;
      const same = run.length > 0 && !retained && !runRetained && contentKeyOf(kind, run[0]!.payload) === contentKeyOf(kind, r.payload);
      if (!same) {
        flush();
        run = [];
      }
      run.push(r);
      runRetained = retained;
    }
    flush();
  }
  return out;
}

function toRecord(run: readonly MemoryRow[], kind: ItemKind, retained: boolean): RunRecord {
  const first = run[0]!;
  const last = run.at(-1)!;
  const received = run.map((r) => t(r.receivedAt, r.id));
  return {
    sourceId: first.sourceId,
    sourceRef: first.sourceRef,
    kind,
    firstId: first.id,
    firstObservedAt: first.observedAt,
    lastId: last.id,
    lastObservedAt: last.observedAt,
    lastState: last.state,
    lastPayload: last.payload,
    firstReceivedAt: new Date(received.reduce((m, x) => (x < m ? x : m), Infinity)).toISOString(),
    lastReceivedAt: new Date(received.reduce((m, x) => (x > m ? x : m), -Infinity)).toISOString(),
    firstRowReceivedAt: first.receivedAt,
    lastRowReceivedAt: last.receivedAt,
    count: run.length,
    states: [...new Set(run.map((r) => r.state))].sort(byCodeUnit) as EvidenceState[],
    retained,
  };
}

function markersOf(rows: readonly MemoryRow[], githubSources: ReadonlySet<string>): Marker[] {
  const bucket = (pick: (r: MemoryRow) => string | null) => {
    const m = new Map<string, MemoryRow[]>();
    for (const r of rows) {
      const k = pick(r);
      if (k === null) continue;
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return [...m.values()];
  };
  const markers: Marker[] = [];
  const isItem = (r: MemoryRow) => isItemKind(kindOf(r));
  for (const g of bucket((r) => (kindOf(r) === 'source_status' && r.state !== 'ok' ? `${r.sourceId}|${r.sourceRef}` : null))) {
    markers.push({ role: 'failure', row: newestOf(g)! });
  }
  for (const g of bucket((r) => (kindOf(r) === 'list_page' && r.state === 'ok' ? `${r.sourceId}|${r.sourceRef}` : null))) {
    markers.push({ role: 'list_page', row: newestOf(g)! });
  }
  for (const g of bucket((r) => (isItem(r) && (r.state === 'ok' || r.state === 'stale') ? `${r.sourceId}|${scopeRoot(r.sourceRef)}` : null))) {
    const top = newestOf(g)!;
    const atTop = g.filter((r) => r.observedAt === top.observedAt).sort((a, b) => byCodeUnit(a.id, b.id));
    markers.push({ role: 'scope_item', row: atTop[0]! });
  }
  const heads = bucket((r) =>
    githubSources.has(r.sourceId) && isGithubHead(r.sourceRef, kindOf(r)) ? `${r.sourceId}|${r.receivedAt}|${r.observedAt}` : null,
  );
  for (const g of heads.filter((b) => b.length > 1)) markers.push({ role: 'ambiguous', row: [...g].sort((a, b) => byCodeUnit(a.id, b.id))[0]! });
  return markers;
}

/** The reference collapse: what the S2 SQL must return for the same rows and request. */
export function collapse(rows: readonly MemoryRow[], req: MemoryRequest): CollapsedInput {
  const visible = admissible(rows, req);
  const horizons = new Map(req.sources.filter((s) => s.purgeHorizon !== null).map((s) => [s.sourceId, t(s.purgeHorizon!, 'purge horizon')]));
  const github = new Set(req.sources.filter((s) => s.provider === 'github').map((s) => s.sourceId));
  return {
    runs: runsOf(
      visible.filter((r) => isItemKind(kindOf(r))),
      horizons,
    ),
    markers: markersOf(visible, github),
  };
}

/** A canonical order for comparing two collapsed inputs (the differential test). */
export function canonicalCollapsed(input: CollapsedInput): CollapsedInput {
  const runKey = (r: RunRecord) => `${r.sourceId}|${r.sourceRef}|${r.kind}|${r.firstObservedAt}|${r.firstId}`;
  const markerKey = (m: Marker) => `${m.role}|${m.row.id}`;
  return {
    runs: [...input.runs].sort((a, b) => byCodeUnit(runKey(a), runKey(b))),
    markers: [...input.markers].sort((a, b) => byCodeUnit(markerKey(a), markerKey(b))),
  };
}

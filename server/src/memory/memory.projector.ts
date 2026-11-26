// COG-02 memory projector (BACK-105). Pure functions over evidence the reader can already see: runs and
// revisions (D2), status from row state, failed reads, absence and TTL (D3), full-set answers with a
// bounded history list (D3a), a canonical fingerprint (D5) and the purge horizon (D6).
// `project(rows)` collapses raw rows first; `projectCollapsed(input)` takes what the S2 SQL returns.
// It writes nothing and decides no permission. Not wired to any route (COG-07 owns that).
// Design: docs/planning/BACK-105/cog-02-design.md.
import { sha256 } from './memory.canonical';
import { collapse, type CollapsedInput, type Marker, type RunRecord } from './memory.collapse';
import {
  coveringFailureRefs,
  HISTORY_CAP,
  isProvider,
  MEMORY_POLICY_VERSION,
  scopeReadOf,
  scopeRoot,
  SETTLE_MARGIN_MS,
  TTL_MS,
  type ItemKind,
} from './memory.policy';
import { currentOf, iso, maxOf, ms, runInfoOrder, toInfo, toRun, type RunInfo } from './memory.runs';
import type { FactStatus, MemoryItem, MemoryProjection, MemoryRequest, MemoryRow, MemorySource, Run } from './memory.types';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A marker row with its observed time parsed once. */
interface Timed {
  readonly row: MemoryRow;
  readonly t: number;
}
const timedOrder = (a: Timed, b: Timed): number => a.t - b.t || byCodeUnit(a.row.id, b.row.id);

interface Clocks {
  readonly effective: number;
  readonly known: number;
  readonly evaluation: number;
  readonly now: number;
}

/** The read markers of one source, keyed for the item judgements. */
interface SourceIndex {
  readonly source: MemorySource;
  readonly horizon: number | null;
  readonly failureByRef: ReadonlyMap<string, Timed>;
  readonly pageByRef: ReadonlyMap<string, Timed>;
  readonly scopeByRoot: ReadonlyMap<string, Timed>;
  /** GitHub only: one row per batch with more than one repository-level row, oldest first. */
  readonly ambiguous: readonly Timed[];
}

interface Signal {
  readonly rank: 1 | 2;
  readonly reason: string;
  readonly marker?: string;
}
const STALE = 1;
const UNKNOWN = 2;

/** Keep the newest per key; equal instants keep the highest id (failures, pages) as collapse() does. */
function newestBy(map: Map<string, Timed>, key: string, v: Timed): void {
  const prev = map.get(key);
  if (!prev || timedOrder(prev, v) < 0) map.set(key, v);
}

function indexSource(source: MemorySource, markers: readonly Marker[]): SourceIndex {
  const failureByRef = new Map<string, Timed>();
  const pageByRef = new Map<string, Timed>();
  const scopeByRoot = new Map<string, Timed>();
  const ambiguous: Timed[] = [];
  for (const m of markers) {
    const timed = { row: m.row, t: ms(m.row.observedAt, `marker ${m.row.id}`) };
    if (m.role === 'failure') newestBy(failureByRef, m.row.sourceRef, timed);
    else if (m.role === 'list_page') newestBy(pageByRef, m.row.sourceRef, timed);
    else if (m.role === 'scope_item') scopeByRoot.set(scopeRoot(m.row.sourceRef), timed);
    else ambiguous.push(timed);
  }
  return {
    source,
    horizon: source.purgeHorizon === null ? null : ms(source.purgeHorizon, `purge horizon of ${source.sourceId}`),
    failureByRef,
    pageByRef,
    scopeByRoot,
    ambiguous: ambiguous.sort(timedOrder),
  };
}

/** The newest successful read of the item's scope after it was last seen (D3 read outcomes). */
function laterScopeRead(ix: SourceIndex, kind: ItemKind, ref: string, lastSeen: number): Timed | undefined {
  const scope = scopeReadOf(kind, ref);
  if (scope === null) return undefined;
  const top = scope.by === 'list_page' ? ix.pageByRef.get(scope.ref) : ix.scopeByRoot.get(scopeRoot(ref));
  if (!top || top.t <= lastSeen) return undefined;
  if (scope.by === 'items' && !top.row.sourceRef.startsWith(scope.prefix)) return undefined;
  return top;
}

function failureSignal(ix: SourceIndex, kind: ItemKind, ref: string, lastSeen: number, scopeRead: Timed | undefined): Signal | null {
  const tops = [...coveringFailureRefs(ix.source.provider, kind, ref)].flatMap((r) => ix.failureByRef.get(r) ?? []);
  const failure = tops.sort(timedOrder).at(-1);
  if (!failure || failure.t <= lastSeen) return null;
  // A later successful read of the scope supersedes the failure; absence then decides.
  if (scopeRead && scopeRead.t > failure.t) return null;
  const reason = failure.row.payload['reason'];
  return { rank: UNKNOWN, reason: typeof reason === 'string' && reason !== '' ? reason : 'read-failed', marker: failure.row.id };
}

/** GitHub: a batch with several repository-level rows cannot be told apart (summarizeSource). */
function ambiguitySignal(ix: SourceIndex, lastSeen: number, scopeRead: Timed | undefined): Signal | null {
  const top = ix.ambiguous.at(-1);
  if (!top || top.t < lastSeen) return null;
  // A later clean read of the scope supersedes it, as for a failure.
  if (scopeRead && scopeRead.t > top.t) return null;
  return { rank: UNKNOWN, reason: 'ambiguous_read', marker: top.row.id };
}

function rowStateSignal(run: Run): Signal | null {
  if (run.lastState === 'ok') return null;
  return run.lastState === 'stale' ? { rank: STALE, reason: 'row-state-stale' } : { rank: UNKNOWN, reason: `row-state-${run.lastState}` };
}

interface Judged {
  readonly status: FactStatus;
  readonly reason: string | null;
  readonly current: Run | null;
  readonly markers: readonly string[];
}

const decide = (signals: readonly (Signal | null)[], current: Run | null): Judged => {
  const present = signals.filter((s): s is Signal => s !== null);
  const worst = maxOf([0, ...present.map((s) => s.rank)]);
  const decisive = present.find((s) => s.rank === worst);
  const markers = present.flatMap((s) => (s.marker ? [s.marker] : []));
  if (!decisive) return { status: 'verified', reason: null, current, markers };
  return { status: worst === UNKNOWN ? 'unknown' : 'stale', reason: decisive.reason, current, markers };
};

const fixed = (status: FactStatus, reason: string): Judged => ({ status, reason, current: null, markers: [] });

function judge(ix: SourceIndex, kind: ItemKind, ref: string, runs: readonly RunInfo[], c: Clocks): Judged {
  const lastSeen = maxOf(runs.map((r) => r.lastObserved));
  const scopeRead = laterScopeRead(ix, kind, ref, lastSeen);
  // Precedence for the reason: ambiguous batch (it may contain the failure row itself, as in
  // summarizeSource), failed read, row state, absence, TTL (D3). Unknown outranks everything else.
  const ambiguity = ambiguitySignal(ix, lastSeen, scopeRead);
  const failure = failureSignal(ix, kind, ref, lastSeen, scopeRead);
  if (ix.horizon !== null && (c.effective < ix.horizon || c.known < ix.horizon)) {
    const unknown = ambiguity ?? failure;
    if (unknown) return { status: 'unknown', reason: unknown.reason, current: null, markers: [unknown.marker!] };
    return fixed('insufficient-history', 'before-retention-horizon');
  }
  const outcome = currentOf(kind, runs, c.effective);
  if (outcome.kind === 'none') return fixed('unknown', 'no-revision-effective');
  if (outcome.kind === 'conflict') return fixed('conflict', 'same-order-key-different-content');
  if (outcome.kind === 'ambiguous') return fixed('unknown', 'ambiguous_read');
  if (outcome.kind === 'unreadable') return fixed('unknown', 'unreadable-order-key');
  const current = toRun(outcome.run);
  const ttlExpired = c.evaluation >= outcome.run.lastObserved + TTL_MS[ix.source.provider];
  return decide(
    [
      ambiguity,
      failure,
      rowStateSignal(current),
      scopeRead ? { rank: STALE, reason: 'not-in-latest-read', marker: scopeRead.row.id } : null,
      ttlExpired ? { rank: STALE, reason: 'no-later-read-recorded' } : null,
    ],
    current,
  );
}

function clocksOf(req: MemoryRequest): Clocks {
  return {
    effective: ms(req.effectiveAt, 'effectiveAt'),
    known: ms(req.knownAt, 'knownAt'),
    evaluation: ms(req.evaluationAt, 'evaluationAt'),
    now: ms(req.now, 'now'),
  };
}

function sourcesOf(req: MemoryRequest): Map<string, MemorySource> {
  for (const s of req.sources) if (!isProvider(s.provider)) throw new RangeError(`memory: unknown provider for source ${s.sourceId}`);
  return new Map(req.sources.map((s) => [s.sourceId, s]));
}

function buildItem(ix: SourceIndex, records: readonly RunRecord[], c: Clocks, cap: number): { item: MemoryItem; markers: readonly string[] } {
  const first = records[0]!;
  const runs = records.map(toInfo).sort(runInfoOrder);
  const judged = judge(ix, first.kind, first.sourceRef, runs, c);
  const all = runs.map(toRun);
  const history = all.slice(-cap);
  const item: MemoryItem = {
    sourceId: first.sourceId,
    sourceRef: first.sourceRef,
    kind: first.kind,
    status: judged.status,
    reason: judged.reason,
    orderedBy: first.kind === 'repository' ? 'latest-read' : 'provider',
    current: judged.current,
    history,
    historyInfo: { complete: all.length === history.length && ix.horizon === null, runsReturned: history.length, runsTotal: all.length },
  };
  return { item, markers: judged.markers };
}

/** Project already-collapsed input (what the S2 SQL statement returns). Deterministic. */
export function projectCollapsed(input: CollapsedInput, req: MemoryRequest): MemoryProjection {
  const c = clocksOf(req);
  const cap = req.historyCap ?? HISTORY_CAP;
  if (!Number.isSafeInteger(cap) || cap < 1) throw new RangeError('memory: historyCap must be a positive integer');
  const sources = sourcesOf(req);

  const markersBySource = new Map<string, Marker[]>();
  for (const m of input.markers) {
    if (!sources.has(m.row.sourceId)) continue;
    const list = markersBySource.get(m.row.sourceId);
    if (list) list.push(m);
    else markersBySource.set(m.row.sourceId, [m]);
  }
  const indexes = new Map([...sources.values()].map((s) => [s.sourceId, indexSource(s, markersBySource.get(s.sourceId) ?? [])]));

  const groups = new Map<string, RunRecord[]>();
  for (const r of input.runs) {
    if (!sources.has(r.sourceId)) continue;
    const key = JSON.stringify([r.sourceId, r.sourceRef, r.kind]);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const markers = new Set<string>();
  const items: MemoryItem[] = [];
  for (const records of groups.values()) {
    const built = buildItem(indexes.get(records[0]!.sourceId)!, records, c, cap);
    built.markers.forEach((m) => markers.add(m));
    items.push(built.item);
  }
  items.sort((a, b) => byCodeUnit(a.sourceId, b.sourceId) || byCodeUnit(a.sourceRef, b.sourceRef) || byCodeUnit(a.kind, b.kind));

  const clocks = { effectiveAt: iso(c.effective), knownAt: iso(c.known), evaluationAt: iso(c.evaluation) };
  return {
    items,
    replay: 'best-effort',
    withinSettleMargin: c.known > c.now - SETTLE_MARGIN_MS,
    fingerprint: fingerprintOf(items, req, cap, clocks, markers),
    policyVersion: MEMORY_POLICY_VERSION,
    historyCap: cap,
    clocks,
  };
}

/** Project visible evidence rows into memory items. Deterministic: input order never matters. */
export function project(rows: readonly MemoryRow[], req: MemoryRequest): MemoryProjection {
  clocksOf(req);
  sourcesOf(req);
  return projectCollapsed(collapse(rows, req), req);
}

function fingerprintOf(items: readonly MemoryItem[], req: MemoryRequest, cap: number, clocks: MemoryProjection['clocks'], markers: ReadonlySet<string>): string {
  return sha256({
    policyVersion: MEMORY_POLICY_VERSION,
    historyCap: cap,
    clocks,
    grants: [...new Set(req.activeGrantIds)].sort(byCodeUnit),
    purgeHorizons: req.sources
      .filter((s) => s.purgeHorizon !== null)
      .map((s) => [s.sourceId, iso(ms(s.purgeHorizon!, 'purge horizon'))])
      .sort((a, b) => byCodeUnit(a[0]!, b[0]!)),
    items: items.map((i) => ({
      identity: [i.sourceId, i.sourceRef, i.kind],
      status: i.status,
      reason: i.reason,
      orderedBy: i.orderedBy,
      historyInfo: i.historyInfo,
      current: i.current ? [i.current.contentKey, i.current.lastEvidenceId] : null,
      runs: i.history.map((r) => [r.contentKey, r.firstEvidenceId, r.lastEvidenceId, r.observationCount]),
    })),
    markers: [...markers].sort(byCodeUnit),
  });
}

/**
 * Recompute and compare: false when anything the fingerprint covers changed since `previous` (D5).
 * An invalid request is an error, not "the data changed": it throws.
 */
export function validateAtRead(previous: MemoryProjection, rows: readonly MemoryRow[], req: MemoryRequest): boolean {
  return project(rows, req).fingerprint === previous.fingerprint;
}

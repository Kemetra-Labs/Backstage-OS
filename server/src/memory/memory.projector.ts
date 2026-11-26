// COG-02 memory projector (BACK-105 S1). A pure function over evidence rows the reader can already see:
// runs and revisions (D2), status from row state, failed reads, absence and TTL (D3), full-set answers
// with a bounded history list (D3a), a canonical fingerprint (D5) and the purge horizon (D6).
// It writes nothing, reads nothing and decides no permission. Not wired to any route (COG-07 owns that).
// Design: docs/planning/BACK-105/cog-02-design.md.
import { sha256 } from './memory.canonical';
import {
  coveringFailureRefs,
  HISTORY_CAP,
  isGithubHead,
  isItemKind,
  isProvider,
  MARKER_KINDS,
  MEMORY_POLICY_VERSION,
  scopeReadOf,
  scopeRoot,
  SETTLE_MARGIN_MS,
  TTL_MS,
  type ItemKind,
} from './memory.policy';
import { buildRuns, currentOf, iso, maxOf, ms, obsOrder, toObs, toRun, type Obs, type RunAcc } from './memory.runs';
import type { FactStatus, MemoryItem, MemoryProjection, MemoryRequest, MemoryRow, MemorySource, Run } from './memory.types';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const kindOf = (r: MemoryRow): unknown => r.payload['kind'];

/** A row with its observed time parsed once. Lists of these are kept sorted by (t, id). */
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

/** Everything about one source that item judgements look up, built once per projection. */
interface SourceIndex {
  readonly source: MemorySource;
  readonly horizon: number | null;
  readonly failuresByRef: ReadonlyMap<string, readonly Timed[]>;
  readonly listPagesByRef: ReadonlyMap<string, readonly Timed[]>;
  readonly itemsByRoot: ReadonlyMap<string, readonly Timed[]>;
  /** GitHub only: the lowest-id row of each batch with more than one repository-level row. */
  readonly ambiguousBatches: readonly Timed[];
}

interface Signal {
  readonly rank: 1 | 2;
  readonly reason: string;
  readonly marker?: string;
}
const STALE = 1;
const UNKNOWN = 2;

function pushTo<K>(map: Map<K, Timed[]>, key: K, value: Timed): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
const sortAll = <K>(map: Map<K, Timed[]>): Map<K, Timed[]> => {
  for (const list of map.values()) list.sort(timedOrder);
  return map;
};

function indexSource(source: MemorySource, rows: readonly MemoryRow[]): SourceIndex {
  const failures = new Map<string, Timed[]>();
  const pages = new Map<string, Timed[]>();
  const items = new Map<string, Timed[]>();
  const heads = new Map<string, Timed[]>();
  for (const row of rows) {
    const timed = { row, t: ms(row.observedAt, `row ${row.id} observedAt`) };
    const kind = kindOf(row);
    if (kind === 'source_status' && row.state !== 'ok') pushTo(failures, row.sourceRef, timed);
    if (kind === 'list_page' && row.state === 'ok') pushTo(pages, row.sourceRef, timed);
    if (isItemKind(kind) && (row.state === 'ok' || row.state === 'stale')) pushTo(items, scopeRoot(row.sourceRef), timed);
    if (source.provider === 'github' && isGithubHead(row.sourceRef, kind)) pushTo(heads, `${row.receivedAt}|${row.observedAt}`, timed);
  }
  const ambiguous = [...heads.values()].filter((b) => b.length > 1).map((b) => [...b].sort(timedOrder)[0]!);
  return {
    source,
    horizon: source.purgeHorizon === null ? null : ms(source.purgeHorizon, `purge horizon of ${source.sourceId}`),
    failuresByRef: sortAll(failures),
    listPagesByRef: sortAll(pages),
    itemsByRoot: sortAll(items),
    ambiguousBatches: ambiguous.sort(timedOrder),
  };
}

/** The newest successful read of the item's scope after it was last seen (D3 read outcomes). */
function laterScopeRead(ix: SourceIndex, kind: ItemKind, ref: string, lastSeen: number): Timed | undefined {
  const scope = scopeReadOf(kind, ref);
  if (scope === null) return undefined;
  if (scope.by === 'list_page') {
    const top = ix.listPagesByRef.get(scope.ref)?.at(-1);
    return top && top.t > lastSeen ? top : undefined;
  }
  const list = (ix.itemsByRoot.get(scopeRoot(ref)) ?? []).filter((x) => x.row.sourceRef.startsWith(scope.prefix));
  const top = list.at(-1);
  if (!top || top.t <= lastSeen) return undefined;
  // The batch-defining marker is the lowest id observed at that instant: input-order free.
  return list.find((x) => x.t === top.t);
}

function failureSignal(ix: SourceIndex, kind: ItemKind, ref: string, lastSeen: number, scopeRead: Timed | undefined): Signal | null {
  const tops = [...coveringFailureRefs(ix.source.provider, kind, ref)].flatMap((r) => ix.failuresByRef.get(r)?.at(-1) ?? []);
  const failure = tops.sort(timedOrder).at(-1);
  if (!failure || failure.t <= lastSeen) return null;
  // A later successful read of the scope supersedes the failure; absence then decides.
  if (scopeRead && scopeRead.t > failure.t) return null;
  const reason = failure.row.payload['reason'];
  return { rank: UNKNOWN, reason: typeof reason === 'string' && reason !== '' ? reason : 'read-failed', marker: failure.row.id };
}

/** GitHub: a batch with several repository-level rows cannot be told apart (summarizeSource). */
function ambiguitySignal(ix: SourceIndex, lastSeen: number, scopeRead: Timed | undefined): Signal | null {
  const top = ix.ambiguousBatches.at(-1);
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

function judge(ix: SourceIndex, kind: ItemKind, ref: string, obs: readonly Obs[], runs: readonly RunAcc[], c: Clocks): Judged {
  const lastSeen = maxOf(obs.map((o) => o.observed));
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
  const current = toRun(outcome.run, kind);
  const ttlExpired = c.evaluation >= ms(current.lastObservedAt, 'run') + TTL_MS[ix.source.provider];
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

const runOrder = (a: Run, b: Run): number =>
  byCodeUnit(a.firstObservedAt, b.firstObservedAt) || byCodeUnit(a.firstKnownAt, b.firstKnownAt) || byCodeUnit(a.firstEvidenceId, b.firstEvidenceId);

function buildItem(ix: SourceIndex, ref: string, kind: ItemKind, group: readonly MemoryRow[], c: Clocks, cap: number): { item: MemoryItem; markers: readonly string[] } {
  const obs = group.map((r) => toObs(kind, r)).sort(obsOrder);
  const runs = buildRuns(obs, ix.horizon);
  const judged = judge(ix, kind, ref, obs, runs, c);
  const all = runs.map((r) => toRun(r, kind)).sort(runOrder);
  const history = all.slice(-cap);
  const item: MemoryItem = {
    sourceId: ix.source.sourceId,
    sourceRef: ref,
    kind,
    status: judged.status,
    reason: judged.reason,
    orderedBy: kind === 'repository' ? 'latest-read' : 'provider',
    current: judged.current,
    history,
    historyInfo: { complete: all.length === history.length && ix.horizon === null, runsReturned: history.length, runsTotal: all.length },
  };
  return { item, markers: judged.markers };
}

/** Project visible evidence rows into memory items. Deterministic: input order never matters. */
export function project(rows: readonly MemoryRow[], req: MemoryRequest): MemoryProjection {
  const c = clocksOf(req);
  const cap = req.historyCap ?? HISTORY_CAP;
  if (!Number.isSafeInteger(cap) || cap < 1) throw new RangeError('memory: historyCap must be a positive integer');
  const sources = sourcesOf(req);

  const bySource = new Map<string, MemoryRow[]>();
  const groups = new Map<string, MemoryRow[]>();
  for (const r of rows) {
    const kind = kindOf(r);
    if (r.type !== 'Observation' || !sources.has(r.sourceId) || !(isItemKind(kind) || MARKER_KINDS.has(kind as string))) continue;
    if (ms(r.receivedAt, `row ${r.id} receivedAt`) > c.known) continue;
    const perSource = bySource.get(r.sourceId);
    if (perSource) perSource.push(r);
    else bySource.set(r.sourceId, [r]);
    if (!isItemKind(kind)) continue;
    const key = JSON.stringify([r.sourceId, r.sourceRef, kind]);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  const indexes = new Map([...bySource].map(([id, list]) => [id, indexSource(sources.get(id)!, list)]));
  const markers = new Set<string>();
  const items: MemoryItem[] = [];
  for (const [key, group] of groups) {
    const [sourceId, ref, kind] = JSON.parse(key) as [string, string, ItemKind];
    const built = buildItem(indexes.get(sourceId)!, ref, kind, group, c, cap);
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

// Runs and the current revision of one item (BACK-105, design D2 and D3a), over collapsed run records
// (memory.collapse.ts). Pure functions.
import { contentKeyOf, type RunRecord } from './memory.collapse';
import { EFFECTIVE_FIELD, isOrdered, ORDER_FIELD, type ItemKind } from './memory.policy';
import type { Run } from './memory.types';

/** Milliseconds of an ISO instant; an unreadable time is refused, never guessed. */
export function ms(iso: string, what: string): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) throw new RangeError(`memory: invalid time for ${what}`);
  return t;
}
export const iso = (t: number): string => new Date(t).toISOString();

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Max without spreading: a spread argument list overflows on very long histories. */
export const maxOf = (xs: readonly number[]): number => xs.reduce((m, x) => (x > m ? x : m), -Infinity);

/** A run record with its parsed times, content key and provider order. */
export interface RunInfo {
  readonly rec: RunRecord;
  readonly contentKey: string;
  readonly orderKey: number | null;
  readonly effective: number;
  readonly firstObserved: number;
  readonly lastObserved: number;
  readonly firstReceived: number;
  readonly lastReceived: number;
}

function orderKeyOf(kind: ItemKind, payload: Readonly<Record<string, unknown>>): number | null {
  if (!isOrdered(kind)) return null;
  const v = payload[ORDER_FIELD[kind as Exclude<ItemKind, 'repository'>]];
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function toInfo(rec: RunRecord): RunInfo {
  const firstObserved = ms(rec.firstObservedAt, `run ${rec.firstId}`);
  let effective = firstObserved;
  if (isOrdered(rec.kind)) {
    const v = rec.lastPayload[EFFECTIVE_FIELD[rec.kind as Exclude<ItemKind, 'repository'>]];
    const t = typeof v === 'string' ? Date.parse(v) : Number.NaN;
    if (Number.isFinite(t)) effective = t;
  }
  return {
    rec,
    contentKey: contentKeyOf(rec.kind, rec.lastPayload),
    orderKey: orderKeyOf(rec.kind, rec.lastPayload),
    effective,
    firstObserved,
    lastObserved: ms(rec.lastObservedAt, `run ${rec.lastId}`),
    firstReceived: ms(rec.firstReceivedAt, `run ${rec.firstId}`),
    lastReceived: ms(rec.lastReceivedAt, `run ${rec.lastId}`),
  };
}

/** Run order for history and selection: (first observed, first received, first id). */
export const runInfoOrder = (a: RunInfo, b: RunInfo): number =>
  a.firstObserved - b.firstObserved || a.firstReceived - b.firstReceived || byCodeUnit(a.rec.firstId, b.rec.firstId);

/** Latest confirmation order: (last observed, last received, last id). */
const latestOrder = (a: RunInfo, b: RunInfo): number =>
  a.lastObserved - b.lastObserved || a.lastReceived - b.lastReceived || byCodeUnit(a.rec.lastId, b.rec.lastId);

export function toRun(info: RunInfo): Run {
  const rec = info.rec;
  const rawOrder = isOrdered(rec.kind) ? rec.lastPayload[ORDER_FIELD[rec.kind as Exclude<ItemKind, 'repository'>]] : null;
  return {
    contentKey: info.contentKey,
    orderKey: typeof rawOrder === 'string' || typeof rawOrder === 'number' ? rawOrder : null,
    effectiveAt: iso(info.effective),
    firstKnownAt: iso(info.firstReceived),
    lastKnownAt: iso(info.lastReceived),
    firstObservedAt: iso(info.firstObserved),
    lastObservedAt: iso(info.lastObserved),
    observationCount: rec.count,
    states: rec.states,
    lastState: rec.lastState,
    firstEvidenceId: rec.firstId,
    lastEvidenceId: rec.lastId,
    retainedForCitation: rec.retained,
    payload: rec.lastPayload,
  };
}

export type CurrentOutcome =
  | { readonly kind: 'current'; readonly run: RunInfo }
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'unreadable' };

/**
 * The repository record: the run holding the latest provider read observed by E. Two runs with
 * different content holding a read at that instant are ambiguous. When E falls inside the chosen run,
 * the exact latest instant is not in the run record, so a tie at the run's first instant is treated as
 * ambiguous (conservative: unknown, never a guess).
 */
function currentRepository(runs: readonly RunInfo[], e: number): CurrentOutcome {
  const candidates = runs.filter((r) => r.firstObserved <= e).sort(runInfoOrder);
  const chosen = candidates.at(-1);
  if (!chosen) return { kind: 'none' };
  const others = candidates.filter((r) => r !== chosen && r.contentKey !== chosen.contentKey);
  const latest = e >= chosen.lastObserved ? chosen.lastObserved : null;
  const tied =
    latest !== null
      ? others.some((r) => r.firstObserved === latest || (r.lastObserved === latest && r.lastObserved <= e))
      : others.some((r) => r.lastObserved === chosen.firstObserved);
  return tied ? { kind: 'ambiguous' } : { kind: 'current', run: chosen };
}

/**
 * The current revision as effective at E, over every run (never the bounded list, D3a). Ordered kinds:
 * the highest order key effective by E; more than one content key there is a conflict.
 */
export function currentOf(kind: ItemKind, runs: readonly RunInfo[], e: number): CurrentOutcome {
  if (!isOrdered(kind)) return currentRepository(runs, e);
  // A revision whose order key cannot be read cannot be placed: refuse rather than let an older one win.
  if (runs.some((r) => r.orderKey === null)) return { kind: 'unreadable' };
  const eligible = runs.filter((r) => r.effective <= e);
  if (eligible.length === 0) return { kind: 'none' };
  const top = maxOf(eligible.map((r) => r.orderKey!));
  const atTop = eligible.filter((r) => r.orderKey === top);
  if (new Set(atTop.map((r) => r.contentKey)).size > 1) return { kind: 'conflict' };
  const pick = atTop.reduce((a, b) => (latestOrder(a, b) >= 0 ? a : b), atTop[0]!);
  return { kind: 'current', run: pick };
}

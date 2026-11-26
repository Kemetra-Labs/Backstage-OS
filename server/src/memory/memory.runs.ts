// Runs and the current revision of one item (BACK-105 S1, design D2 and D3a). Pure functions.
import type { EvidenceState } from '../evidence/evidence.types';
import { sha256 } from './memory.canonical';
import { CONTENT_FIELDS, EFFECTIVE_FIELD, isOrdered, ORDER_FIELD, type ItemKind } from './memory.policy';
import type { MemoryRow, Run } from './memory.types';

/** Milliseconds of an ISO instant; an unreadable time is refused, never guessed. */
export function ms(iso: string, what: string): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(t)) throw new RangeError(`memory: invalid time for ${what}`);
  return t;
}
export const iso = (t: number): string => new Date(t).toISOString();

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Max and min without spreading: a spread argument list overflows on very long histories. */
export const maxOf = (xs: readonly number[]): number => xs.reduce((m, x) => (x > m ? x : m), -Infinity);
export const minOf = (xs: readonly number[]): number => xs.reduce((m, x) => (x < m ? x : m), Infinity);

/** A row with its parsed times, content key and provider order. */
export interface Obs {
  readonly row: MemoryRow;
  readonly observed: number;
  readonly received: number;
  readonly contentKey: string;
  readonly orderKey: number | null;
  readonly effective: number;
}

export const obsOrder = (a: Obs, b: Obs): number => a.observed - b.observed || a.received - b.received || byCodeUnit(a.row.id, b.row.id);

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

export function toObs(kind: ItemKind, row: MemoryRow): Obs {
  const observed = ms(row.observedAt, `row ${row.id} observedAt`);
  const received = ms(row.receivedAt, `row ${row.id} receivedAt`);
  const content = Object.fromEntries(CONTENT_FIELDS[kind].map((f) => [f, row.payload[f] ?? null]));
  let effective = observed;
  if (isOrdered(kind)) {
    const v = row.payload[EFFECTIVE_FIELD[kind as Exclude<ItemKind, 'repository'>]];
    const t = typeof v === 'string' ? Date.parse(v) : Number.NaN;
    effective = Number.isFinite(t) ? t : observed;
  }
  return { row, observed, received, contentKey: sha256(content), orderKey: orderKeyOf(kind, row.payload), effective };
}

export interface RunAcc {
  readonly obs: Obs[];
  readonly retained: boolean;
}

/**
 * Consecutive observations (by observed, received, id) with one content key form a run. A run never
 * spans the purge horizon. Rows kept for citation before it are each their own run, even when
 * consecutive and identical: rows between them may have been purged, so they cannot be shown to be
 * consecutive (D6, stricter than "form their own runs").
 */
export function buildRuns(sorted: readonly Obs[], horizon: number | null): RunAcc[] {
  const runs: RunAcc[] = [];
  for (const o of sorted) {
    const retained = horizon !== null && o.observed < horizon;
    const last = runs.at(-1);
    if (last && !retained && !last.retained && last.obs[0]!.contentKey === o.contentKey) last.obs.push(o);
    else runs.push({ obs: [o], retained });
  }
  return runs;
}

export function toRun(acc: RunAcc, kind: ItemKind): Run {
  const first = acc.obs[0]!;
  const last = acc.obs.at(-1)!;
  const received = acc.obs.map((o) => o.received);
  const states = [...new Set(acc.obs.map((o) => o.row.state))].sort(byCodeUnit) as EvidenceState[];
  const rawOrder = isOrdered(kind) ? last.row.payload[ORDER_FIELD[kind as Exclude<ItemKind, 'repository'>]] : null;
  return {
    contentKey: first.contentKey,
    orderKey: typeof rawOrder === 'string' || typeof rawOrder === 'number' ? rawOrder : null,
    effectiveAt: iso(first.effective),
    firstKnownAt: iso(minOf(received)),
    lastKnownAt: iso(maxOf(received)),
    firstObservedAt: iso(first.observed),
    lastObservedAt: iso(last.observed),
    observationCount: acc.obs.length,
    states,
    lastState: last.row.state,
    firstEvidenceId: first.row.id,
    lastEvidenceId: last.row.id,
    retainedForCitation: acc.retained,
    payload: last.row.payload,
  };
}

export type CurrentOutcome =
  | { readonly kind: 'current'; readonly run: RunAcc }
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'unreadable' };

const lastOf = (r: RunAcc): Obs => r.obs.at(-1)!;

/**
 * The current revision as effective at E, over every run (never the bounded list, D3a). Ordered kinds:
 * the highest order key effective by E; more than one content key there is a conflict. The repository
 * record: the latest provider read observed by E; two reads at that instant with different content
 * are ambiguous.
 */
export function currentOf(kind: ItemKind, runs: readonly RunAcc[], effectiveAt: number): CurrentOutcome {
  if (!isOrdered(kind)) {
    const obs = runs.flatMap((r) => r.obs.map((o) => ({ o, r }))).filter(({ o }) => o.observed <= effectiveAt);
    if (obs.length === 0) return { kind: 'none' };
    const latest = maxOf(obs.map(({ o }) => o.observed));
    const atLatest = obs.filter(({ o }) => o.observed === latest);
    if (new Set(atLatest.map(({ o }) => o.contentKey)).size > 1) return { kind: 'ambiguous' };
    const pick = atLatest.reduce((a, b) => (obsOrder(a.o, b.o) >= 0 ? a : b), atLatest[0]!);
    return { kind: 'current', run: pick.r };
  }
  // A revision whose order key cannot be read cannot be placed: refuse rather than let an older one win.
  if (runs.some((r) => r.obs[0]!.orderKey === null)) return { kind: 'unreadable' };
  const eligible = runs.filter((r) => r.obs[0]!.effective <= effectiveAt);
  if (eligible.length === 0) return { kind: 'none' };
  const top = maxOf(eligible.map((r) => r.obs[0]!.orderKey!));
  const atTop = eligible.filter((r) => r.obs[0]!.orderKey === top);
  if (new Set(atTop.map((r) => r.obs[0]!.contentKey)).size > 1) return { kind: 'conflict' };
  const pick = atTop.reduce((a, b) => (obsOrder(lastOf(a), lastOf(b)) >= 0 ? a : b), atTop[0]!);
  return { kind: 'current', run: pick };
}

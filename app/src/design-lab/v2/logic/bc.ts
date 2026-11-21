// Derivations for the B+C pilot. Every figure the screen shows comes from here, from the existing World and the
// existing rules (status.ts, evidence.ts, contract/rules.ts). Nothing is invented, and there is no combined score.
import { effectiveFreshness, resolveLabel } from '../../../contract/rules';
import type { Lang, Persona } from '../../../contract/types';
import type { World, WorldEdge } from '../types';
import type { MapFilter } from './graph';
import { isRiskNode, minutesSince, sourceCounts, sourceStatus, type Fraction, type SourceStatus, type Tone } from './status';
import type { Point } from './orbit';

/** The age track spans 0 to 3x the freshness target; the target tick sits at one third on every row. */
export const AGE_SCALE = 3;
/** Past this ratio the multiple ("36x target") is shown. */
export const OVER_SHOWN_AT = 1.5;

export interface BcFigures {
  readonly products: number;
  readonly projects: number;
  readonly services: number;
  readonly risks: number;
  readonly sourceIssues: number;
  readonly reachable: Fraction;
  readonly current: Fraction;
  readonly healthy: Fraction;
  readonly stale: number;
  readonly unavailable: number;
  readonly notSet: number;
  readonly sourceTotal: number;
  /** Dependency links by how we know them. Grouping links are structure, not claims, and are counted apart. */
  readonly links: { readonly observed: number; readonly correlated: number; readonly hypothesis: number; readonly unknown: number };
  readonly structureLinks: number;
  /** Distinct observed reads in the last 24 h. Derived for the audit table, not displayed in the pilot. */
  readonly observedReads24h: number;
}

export function bcFigures(w: World): BcFigures {
  const statuses = w.sources.map((s) => sourceStatus(s, w.now));
  const sc = sourceCounts(statuses);
  const dep = w.edges.filter((e) => e.cls === 'dep');
  const reads = new Set(
    Object.values(w.evidenceById)
      .filter((e) => e.observation && resolveLabel(e) === 'observed' && minutesSince(e.observation.observedAt, w.now) <= 24 * 60)
      .map((e) => e.observation!.id),
  );
  return {
    products: w.nodes.filter((n) => n.kind === 'product').length,
    projects: w.nodes.filter((n) => n.kind === 'project').length,
    services: w.nodes.filter((n) => n.kind === 'service').length,
    risks: w.nodes.filter((n) => isRiskNode(n, w)).length,
    sourceIssues: sc.issues,
    reachable: sc.reachable,
    current: sc.current,
    healthy: sc.healthy,
    stale: statuses.filter((s) => s.connectivity !== 'not_configured' && s.freshness === 'stale').length,
    unavailable: statuses.filter((s) => s.connectivity === 'unavailable').length,
    notSet: statuses.filter((s) => s.connectivity === 'not_configured').length,
    sourceTotal: statuses.length,
    links: {
      observed: dep.filter((e) => e.truth === 'observed').length,
      correlated: dep.filter((e) => e.truth === 'correlated').length,
      hypothesis: dep.filter((e) => e.truth === 'hypothesis').length,
      unknown: dep.filter((e) => e.truth === 'unknown').length,
    },
    structureLinks: w.edges.filter((e) => e.cls === 'group').length,
    observedReads24h: reads.size,
  };
}

/** A classified link whose every supporting read is not current is still drawn, but flagged stale. */
export function edgeStale(e: WorldEdge, w: World): boolean {
  return e.truth !== 'unknown' && e.evidence.length > 0 && e.evidence.every((id) => {
    const r = w.evidenceById[id];
    return r ? effectiveFreshness(r) !== 'current' : true;
  });
}

/** Whether a link's basis rests on evidence this persona may not read. Only its existence is shown. */
export function edgeRestricted(e: WorldEdge, persona: Persona, w: World): boolean {
  return persona !== 'technical' && e.evidence.some((id) => w.evidenceById[id]?.visibility === 'technical');
}

export const isIncident = (e: WorldEdge, id: string): boolean => e.a === id || e.b === id;

/** Quadratic curve between two points, with the midpoint (for the link marker). */
export function curve(a: Point, b: Point, bend: number): { readonly d: string; readonly mx: number; readonly my: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * len * bend;
  const cy = my + (dx / len) * len * bend;
  const f = (v: number): string => (Math.round(v * 10) / 10).toString();
  return { d: `M${f(a.x)} ${f(a.y)} Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`, mx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
}

export interface AgeGeometry {
  readonly state: 'none' | 'ok' | 'stale';
  /** Percent of the track (0..100) filled up to the target tick. */
  readonly fill: number;
  /** Start and width (percent) of the hatched segment past the tick. 0 width when within target. */
  readonly overStart: number;
  readonly overWidth: number;
  /** The ratio is beyond the track, so a cut mark is drawn. */
  readonly cut: boolean;
  readonly targetAt: number;
  /** Whole multiple of the target, only when it is large enough to be worth saying. */
  readonly multiple: number | null;
}

/** `freshness` is the contract's verdict: an unavailable source is stale whatever its age, so the bar must say so too. */
export function ageGeometry(s: Pick<SourceStatus, 'ageMinutes' | 'used'> & { readonly freshness?: SourceStatus['freshness'] }): AgeGeometry {
  const tick = 100 / AGE_SCALE;
  if (s.ageMinutes === null) return { state: 'none', fill: 0, overStart: tick, overWidth: 0, cut: false, targetAt: tick, multiple: null };
  const over = s.used > 1;
  return {
    state: over || s.freshness === 'stale' ? 'stale' : 'ok',
    fill: Math.min(s.used, 1) * tick,
    overStart: tick,
    overWidth: over ? Math.min(s.used, AGE_SCALE) * tick - tick : 0,
    cut: s.used > AGE_SCALE,
    targetAt: tick,
    multiple: s.used >= OVER_SHOWN_AT ? Math.round(s.used) : null,
  };
}

/** Arc share of the source ring: min(ratio, 1). A ratio over 1 also adds the outer dashed ring. */
export const ringShare = (s: Pick<SourceStatus, 'ageMinutes' | 'used'>): number | null => (s.ageMinutes === null ? null : Math.min(s.used, 1));

export type Axis = 'connectivity' | 'freshness' | 'health';

/** Pip state per source and axis. Only a confirmed state is filled; unknown stays dashed and neutral. */
export function pipTone(axis: Axis, s: SourceStatus): Tone {
  if (axis === 'connectivity') return s.connectivity === 'reachable' ? 'ok' : s.connectivity === 'unavailable' ? 'bad' : 'unk';
  if (axis === 'freshness') return s.freshness === 'current' ? 'ok' : s.freshness === 'stale' ? 'warn' : 'unk';
  return s.health === 'healthy' ? 'ok' : s.health === 'degraded' ? 'warn' : s.health === 'down' ? 'bad' : 'unk';
}

const MONTHS: Readonly<Record<Lang, readonly string[]>> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

/** "14:03" on the world's day, "15 Nov 13:09" on another. Latin digits in both languages. */
export function formatAt(iso: string, now: string, lang: Lang): string {
  const hhmm = iso.slice(11, 16);
  if (iso.slice(0, 10) === now.slice(0, 10)) return hhmm;
  const m = Number(iso.slice(5, 7)) - 1;
  return `${Number(iso.slice(8, 10))} ${MONTHS[lang][m] ?? ''} ${hhmm}`;
}

// ---- screen state seeds -------------------------------------------------------------------------------------------

export type BcMode = 'map' | 'list';
export type BcTab = 'overview' | 'evidence' | 'sources';
export interface BcSeed {
  readonly mode?: BcMode;
  readonly tab?: BcTab;
  readonly filter?: MapFilter;
}

const FILTERS: readonly MapFilter[] = ['all', 'products', 'projects', 'services', 'risks'];
const TABS: readonly BcTab[] = ['overview', 'evidence', 'sources'];

/** Reads ?view=list&tab=evidence&f=risks. Anything else is ignored, never trusted. */
export function parseSeed(search: string): BcSeed {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  const tab = q.get('tab');
  const f = q.get('f');
  return {
    ...(view === 'list' || view === 'map' ? { mode: view } : {}),
    ...(TABS.includes(tab as BcTab) ? { tab: tab as BcTab } : {}),
    ...(FILTERS.includes(f as MapFilter) ? { filter: f as MapFilter } : {}),
  };
}

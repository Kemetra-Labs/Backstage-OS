// Contract rules (Blueprint v4 §1 and §8). Pure functions: components and views call these and never decide on their own.
import type {
  AggregateCount, ConfidenceBasis, ConfidenceLevel, DisplayLabel, DisplayState, EvidenceReference, Freshness, Health,
  Hypothesis, Persona, SourceAuthority,
} from './types';

export type ConfidenceView =
  | { readonly kind: 'words'; readonly level: ConfidenceLevel }
  | { readonly kind: 'number'; readonly level: ConfidenceLevel; readonly value: number; readonly basis: ConfidenceBasis };

export type CountView =
  | { readonly kind: 'notRead'; readonly sourcesRead: number; readonly sourcesTotal: number }
  | { readonly kind: 'atLeast' | 'exact'; readonly value: number; readonly sourcesRead: number; readonly sourcesTotal: number };

/** Freshness from connectivity, last good read and TTL. Never read means unknown. */
export function freshnessOf(s: SourceAuthority): Freshness {
  if (s.connectivity === 'not_configured' || s.lastSuccessAt === null || s.ageMinutes === null) return 'unknown';
  if (s.connectivity === 'unavailable') return 'stale';
  return s.ageMinutes * 60 > s.ttlSeconds ? 'stale' : 'current';
}

const RANK: Readonly<Record<Freshness, number>> = { current: 0, stale: 1, unknown: 2 };

/** The worst freshness in a list: unknown over stale over current. An empty list is unknown, never current. */
export function worstFreshness(list: readonly Freshness[]): Freshness {
  if (list.length === 0) return 'unknown';
  return list.reduce<Freshness>((worst, f) => (RANK[f] > RANK[worst] ? f : worst), 'current');
}

/** Evidence freshness: the worse of what the evidence claims and what its source's TTL says. Unread is unknown. */
export function effectiveFreshness(ref: EvidenceReference): Freshness {
  if (!ref.observation) return 'unknown';
  return worstFreshness([ref.freshness, freshnessOf(ref.observation.source)]);
}

/**
 * Unread evidence is unknown. Correlated without a written rule is a hypothesis. Approved without a link to the
 * owning record is proposed.
 */
export function resolveLabel(ref: EvidenceReference): DisplayLabel {
  if (!ref.observation) return 'unknown';
  if (ref.classification === 'correlated' && !(ref.rule ?? '').trim()) return 'hypothesis';
  if (ref.classification === 'approved' && !ref.observation.sourceUrl) return 'proposed';
  return ref.classification;
}

const isCurrentObserved = (r: EvidenceReference): boolean =>
  resolveLabel(r) === 'observed' && effectiveFreshness(r) === 'current';

/** Healthy only with current Observed evidence; degraded or down only with a read observation; otherwise unknown. */
export function resolveHealth(state: DisplayState): Health {
  if (state.health === 'healthy') return state.basis.some(isCurrentObserved) ? 'healthy' : 'unknown';
  if (state.health === 'degraded' || state.health === 'down') {
    return state.basis.some((r) => r.observation !== null) ? state.health : 'unknown';
  }
  return 'unknown';
}

const isCompleteBasis = (b: ConfidenceBasis | undefined): b is ConfidenceBasis =>
  b !== undefined &&
  b.method.trim().length > 0 &&
  b.calibration.trim().length > 0 &&
  b.sources.length > 0 &&
  Number.isFinite(b.value) &&
  b.value >= 0 &&
  b.value <= 100;

/** A confidence number appears only for Technical and only with method, calibration and source evidence (D-6). */
export function confidenceDisplay(h: Hypothesis, persona: Persona): ConfidenceView {
  if (persona === 'technical' && isCompleteBasis(h.confidenceBasis)) {
    return { kind: 'number', level: h.confidence, value: h.confidenceBasis.value, basis: h.confidenceBasis };
  }
  return { kind: 'words', level: h.confidence };
}

/** Missing data reads "not read", never 0. Any unread source makes the count "at least N". */
export function countDisplay(c: AggregateCount): CountView {
  const { sourcesRead, sourcesTotal } = c;
  if (c.value === null || sourcesRead === 0) return { kind: 'notRead', sourcesRead, sourcesTotal };
  const partial = c.atLeast || sourcesRead < sourcesTotal;
  return { kind: partial ? 'atLeast' : 'exact', value: c.value, sourcesRead, sourcesTotal };
}

export const needsDemoMarker = (sources: readonly SourceAuthority[]): boolean => sources.some((s) => s.synthetic);

/** Only plain http(s) links to real hosts may ever be followed. Synthetic sources and *.invalid hosts never are. */
export function isInertLink(url: string | undefined, synthetic: boolean): boolean {
  if (synthetic || !url) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
    const host = u.hostname.replace(/\.$/, '');
    return host === 'invalid' || host.endsWith('.invalid');
  } catch {
    return true;
  }
}

const FORBIDDEN_EN =
  /\b(approv(e|ed|es|ing)|reject(s|ed|ing)?|defer(s|red|ring)?|no-go|go|releas(e|ed|es|ing)|retr(y|ies|ied|ying)|run(s|ning)?)\b/i;

// Arabic, normalised (no diacritics or tatweel, hamza forms folded to bare alef): verbal nouns and imperatives.
const FORBIDDEN_AR_WORDS = ['اعتماد', 'اعتمد', 'وافق', 'موافقة', 'رفض', 'ارفض', 'تاجيل', 'اجل', 'تشغيل', 'شغل', 'اصدار', 'اصدر'];
const FORBIDDEN_AR_PHRASES = ['اعادة المحاولة', 'اعد المحاولة'];

const normaliseArabic = (s: string): string => s.replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا');

/** Control labels that imply an action Kawalys cannot take (Blueprint v4 §3 control vocabulary). */
export function isForbiddenControlLabel(label: string): boolean {
  if (FORBIDDEN_EN.test(label)) return true;
  const ar = normaliseArabic(label);
  if (FORBIDDEN_AR_PHRASES.some((p) => ar.includes(p))) return true;
  const tokens = ar.split(/[\s،؛.,:;!?()\-]+/).filter(Boolean);
  return tokens.some((t) => FORBIDDEN_AR_WORDS.some((w) => t === w || t === `و${w}` || t === `ال${w}`));
}

// Display status for V2. Every verdict comes from the V1 contract rules; nothing here decides health on its own.
import { effectiveFreshness, freshnessOf, resolveHealth, resolveLabel, worstFreshness } from '../../../contract/rules';
import type { Connectivity, EvidenceReference, Freshness, Health, SourceAuthority, TruthLabel } from '../../../contract/types';
import type { SourceMeta, World, WorldNode } from '../types';

export type Tone = 'ok' | 'warn' | 'bad' | 'unk';

export interface NodeStatus {
  readonly health: Health;
  readonly freshness: Freshness;
  readonly checkFailing: boolean;
  readonly tone: Tone;
}

const MIN_MS = 60_000;

/** Minutes between the world's fixed "now" and an ISO time. */
export function minutesSince(iso: string, now: string): number {
  return Math.round((Date.parse(now) - Date.parse(iso)) / MIN_MS);
}

export function nodeStatus(n: WorldNode): NodeStatus {
  const read = n.state.basis.filter((r) => r.observation !== null);
  const freshness = worstFreshness(read.map(effectiveFreshness));
  const health = resolveHealth(n.state);
  const checkFailing = n.check === 'failing';
  const tone: Tone = checkFailing ? 'warn' : health === 'healthy' ? 'ok' : health === 'degraded' ? 'warn' : health === 'down' ? 'bad' : 'unk';
  return { health, freshness, checkFailing, tone };
}

export interface SourceStatus {
  readonly provider: SourceMeta['provider'];
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  readonly health: Health;
  readonly ageMinutes: number | null;
  readonly ttlMinutes: number;
  /** ISO time of the last good read, derived from the fixed now and the age (V1's lastSuccessAt is one constant stamp). */
  readonly readAt: string | null;
  /** Age as a share of the freshness target, 0 when never read. Over 1 means past the target. */
  readonly used: number;
  readonly issue: boolean;
}

export function sourceStatus(m: SourceMeta, now: string): SourceStatus {
  const s: SourceAuthority = m.source;
  const freshness = freshnessOf(s);
  const ttlMinutes = Math.round(s.ttlSeconds / 60);
  const readAt = s.ageMinutes === null ? null : new Date(Date.parse(now) - s.ageMinutes * MIN_MS).toISOString();
  return {
    provider: m.provider,
    connectivity: s.connectivity,
    freshness,
    health: resolveHealth(m.health),
    ageMinutes: s.ageMinutes,
    ttlMinutes,
    readAt,
    used: s.ageMinutes === null ? 0 : s.ageMinutes / ttlMinutes,
    // Not set up is a state, not an issue. Unavailable or stale is an issue.
    issue: s.connectivity === 'unavailable' || freshness === 'stale',
  };
}

export interface Fraction {
  readonly n: number;
  readonly of: number;
}

export interface SourceCounts {
  readonly reachable: Fraction;
  readonly current: Fraction;
  readonly healthy: Fraction;
  readonly issues: number;
}

/** Three independent counts. There is deliberately no combined figure. */
export function sourceCounts(list: readonly SourceStatus[]): SourceCounts {
  const of = list.length;
  return {
    reachable: { n: list.filter((s) => s.connectivity === 'reachable').length, of },
    current: { n: list.filter((s) => s.freshness === 'current').length, of },
    healthy: { n: list.filter((s) => s.health === 'healthy').length, of },
    issues: list.filter((s) => s.issue).length,
  };
}

export function isRiskNode(n: WorldNode, w: World): boolean {
  if (nodeStatus(n).checkFailing) return true;
  if (!n.provider) return false;
  const m = w.sources.find((s) => s.provider === n.provider);
  return m ? sourceStatus(m, w.now).issue : false;
}

export interface EvidenceRow {
  readonly id: string;
  readonly label: TruthLabel | 'unknown';
  readonly freshness: Freshness;
  readonly provider: SourceMeta['provider'] | null;
  readonly observedAt: string | null;
  readonly ref: EvidenceReference;
}

export function evidenceRow(ref: EvidenceReference): EvidenceRow {
  return {
    id: ref.id,
    label: resolveLabel(ref),
    freshness: effectiveFreshness(ref),
    provider: ref.observation?.source.provider ?? null,
    observedAt: ref.observation?.observedAt ?? null,
    ref,
  };
}

export const hhmm = (iso: string): string => iso.slice(11, 16);
export const ymd = (iso: string): string => iso.slice(0, 10);

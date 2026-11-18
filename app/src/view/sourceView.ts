// Source health view (demo only): per-product source rows and summaries. Pure functions; freshness comes from the contract.
import { freshnessOf } from '../contract/rules';
import type { Connectivity, Freshness, Provider } from '../contract/types';
import type { World } from '../contract/world';
import { sourceBuckets, type SourceBuckets } from './portfolioView';

export interface SourceRow {
  readonly provider: Provider;
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  /** null means never read. */
  readonly ageMinutes: number | null;
  readonly ttlMinutes: number;
  readonly ttlSeconds: number;
  readonly synthetic: boolean;
}

export interface ProductSources {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly SourceRow[];
  /** Exclusive buckets (the same ones Home uses), so the words add up to the total. */
  readonly summary: SourceBuckets;
  /** Sources that are not current: stale, unknown, unavailable or not set up. Never counted as OK. */
  readonly notCurrent: number;
}

export const PROVIDER_ORDER: readonly Provider[] = ['github', 'jira', 'confluence', 'sentry', 'datadog', 'port'];

export function productSources(world: World): readonly ProductSources[] {
  return world.projects.map((p) => {
    const rows = p.sources
      .map((s): SourceRow => ({
        provider: s.provider,
        connectivity: s.connectivity,
        freshness: freshnessOf(s),
        ageMinutes: s.connectivity === 'not_configured' ? null : s.ageMinutes,
        ttlMinutes: Math.round(s.ttlSeconds / 60),
        ttlSeconds: s.ttlSeconds,
        synthetic: s.synthetic,
      }))
      .sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider));
    const summary = sourceBuckets(p.sources);
    return { id: p.id, name: p.name, rows, summary, notCurrent: summary.total - summary.current };
  });
}

/** Providers present in any product, in a stable order. */
export function providersInUse(world: World): readonly Provider[] {
  const used = new Set(world.projects.flatMap((p) => p.sources.map((s) => s.provider)));
  return PROVIDER_ORDER.filter((p) => used.has(p));
}

export interface Affected {
  readonly product: string;
  readonly provider: Provider;
}

/** Product and provider pairs in a given connectivity state, for the explanatory state blocks. */
export function affectedBy(products: readonly ProductSources[], state: Extract<Connectivity, 'unavailable' | 'not_configured'>): readonly Affected[] {
  return products.flatMap((p) => p.rows.filter((r) => r.connectivity === state).map((r) => ({ product: p.name, provider: r.provider })));
}

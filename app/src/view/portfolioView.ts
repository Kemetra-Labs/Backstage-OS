// Portfolio derivation (BACK-11): one entry per product plus an evidence-linked attention list, all from WORLD.
// Pure functions. Health is never computed here: triadOf() resolves it through the contract.
import { freshnessOf } from '../contract/rules';
import type { Environment, Lang, Persona, SourceAuthority } from '../contract/types';
import type { ByPersonaL10n, L10n, ProjectId, Severity, World, WorldProject } from '../contract/world';
import { evidenceTitleFor, evidenceViewFor } from './evidence';
import type { EvidenceView } from './viewFor';
import { sourceSummary, triadOf, type SourceSummary, type Triad } from './world';

export type ProductFilter = 'all' | ProjectId;

/** Sources in exclusive buckets, so the words add up to the total. Unavailable and not set up are never "current". */
export interface SourceBuckets {
  readonly total: number;
  readonly current: number;
  readonly stale: number;
  readonly unavailable: number;
  readonly notConfigured: number;
  /** Reachable but never read, so freshness is unknown. */
  readonly unknown: number;
}

export function sourceBuckets(sources: readonly SourceAuthority[]): SourceBuckets {
  const count = (pred: (s: SourceAuthority) => boolean): number => sources.filter(pred).length;
  const reachable = (s: SourceAuthority): boolean => s.connectivity === 'reachable';
  return {
    total: sources.length,
    notConfigured: count((s) => s.connectivity === 'not_configured'),
    unavailable: count((s) => s.connectivity === 'unavailable'),
    current: count((s) => reachable(s) && freshnessOf(s) === 'current'),
    stale: count((s) => reachable(s) && freshnessOf(s) === 'stale'),
    unknown: count((s) => reachable(s) && freshnessOf(s) === 'unknown'),
  };
}

export type ProductStatus = 'attention' | 'notSetUp' | 'noneFlagged';

export interface TechnicalDetail {
  readonly componentCount: number;
  readonly environments: readonly Environment[];
}

export interface ProductEntry {
  readonly id: ProjectId;
  readonly name: string;
  readonly summary: L10n;
  readonly triad: Triad;
  readonly summaryCounts: SourceSummary;
  readonly buckets: SourceBuckets;
  readonly status: ProductStatus;
  /** null = not read (product not set up), never 0. */
  readonly attentionCount: number | null;
  readonly openInvestigations: number | null;
  readonly proposals: number | null;
  /** Technical only. */
  readonly detail?: TechnicalDetail;
}

export interface EvidenceRow {
  readonly view: EvidenceView;
  /** Persona title with {braces}. */
  readonly title: string;
}

export interface AttentionEntry {
  readonly id: string;
  readonly severity: Severity;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly title: ByPersonaL10n;
  readonly componentId?: string;
  readonly investigationId?: string;
  readonly decisionId?: string;
  readonly evidence: readonly EvidenceRow[];
}

export interface PortfolioView {
  readonly filter: ProductFilter;
  readonly options: readonly { readonly value: ProductFilter; readonly name?: string }[];
  readonly products: readonly ProductEntry[];
  readonly attention: readonly AttentionEntry[];
  /** Why the attention list is empty, if it is. An unconfigured product is not a clean bill of health. */
  readonly attentionEmpty: 'none' | 'notSetUp' | null;
}

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2 };

export const isNotSetUp = (p: WorldProject): boolean => p.health.connectivity === 'not_configured' && p.components.length === 0;

function entryFor(w: World, p: WorldProject, persona: Persona): ProductEntry {
  const notSetUp = isNotSetUp(p);
  const attentionCount = p.attention.length;
  const status: ProductStatus = attentionCount > 0 ? 'attention' : notSetUp ? 'notSetUp' : 'noneFlagged';
  const base: ProductEntry = {
    id: p.id,
    name: p.name,
    summary: p.summary,
    triad: triadOf(p.health),
    summaryCounts: sourceSummary(p.sources),
    buckets: sourceBuckets(p.sources),
    status,
    attentionCount: notSetUp ? null : attentionCount,
    openInvestigations: notSetUp ? null : w.investigations.filter((i) => i.projectId === p.id && i.status === 'open').length,
    proposals: notSetUp ? null : w.decisions.filter((d) => d.projectId === p.id && d.classification === 'proposed').length,
  };
  return persona === 'technical'
    ? { ...base, detail: { componentCount: p.components.length, environments: p.environments } }
    : base;
}

export function portfolioView(w: World, persona: Persona, lang: Lang, filter: ProductFilter = 'all'): PortfolioView {
  const selected = w.projects.filter((p) => filter === 'all' || p.id === filter);
  const attention: AttentionEntry[] = selected
    .flatMap((p) => p.attention.map((a) => ({ p, a })))
    .sort((x, y) => SEVERITY_RANK[x.a.severity] - SEVERITY_RANK[y.a.severity])
    .map(({ p, a }) => ({
      id: a.id,
      severity: a.severity,
      projectId: p.id,
      projectName: p.name,
      title: a.title,
      ...(a.componentId ? { componentId: a.componentId } : {}),
      ...(a.investigationId ? { investigationId: a.investigationId } : {}),
      ...(a.decisionId ? { decisionId: a.decisionId } : {}),
      evidence: a.evidence.map((e) => ({ view: evidenceViewFor(persona, e), title: evidenceTitleFor(w, e.id, persona, lang) })),
    }));
  const products = selected.map((p) => entryFor(w, p, persona));
  const attentionEmpty = attention.length > 0 ? null : products.some((p) => p.status === 'notSetUp') ? 'notSetUp' : 'none';
  return {
    filter,
    options: [{ value: 'all' }, ...w.projects.map((p) => ({ value: p.id as ProductFilter, name: p.name }))],
    products,
    attention,
    attentionEmpty,
  };
}

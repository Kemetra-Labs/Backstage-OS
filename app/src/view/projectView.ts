// Pure derivations for Project Intelligence (BACK-12). Health always comes from triadOf/resolveHealth, never from here.
import { freshnessOf, resolveEdgeKind } from '../contract/rules';
import type { Connectivity, DisplayLabel, Environment, Freshness, Lang, Persona, Provider } from '../contract/types';
import type {
  Attention, ComponentLayer, DeliveryItem, EdgeKind, World, WorldComponent, WorldProject,
} from '../contract/world';
import type { GraphEdge } from '../components/DepGraph';
import { deliveryLabelFor, evidenceTitleFor, evidenceViewFor } from './evidence';
import type { EvidenceView } from './viewFor';
import { triadOf, type Triad } from './world';

export type EnvFilter = Environment | 'all';
export type LayerFilter = ComponentLayer | 'all';
export interface Filters {
  readonly env: EnvFilter;
  readonly layer: LayerFilter;
}
export const DEFAULT_FILTERS: Filters = { env: 'all', layer: 'all' };

const LAYER_ORDER: readonly ComponentLayer[] = ['client', 'edge', 'service', 'data', 'integration'];

/** Layers that exist in this product, in architecture order. */
export function layersOf(p: WorldProject): readonly ComponentLayer[] {
  const present = new Set(p.components.map((c) => c.layer));
  return LAYER_ORDER.filter((l) => present.has(l));
}

export function filterComponents(p: WorldProject, f: Filters): readonly WorldComponent[] {
  return p.components.filter((c) => (f.env === 'all' || c.environment === f.env) && (f.layer === 'all' || c.layer === f.layer));
}

export interface MapNodeView {
  readonly id: string;
  readonly name: string;
  readonly layer: ComponentLayer;
  readonly environment: Environment;
  readonly col: number;
  readonly row: number;
  readonly triad: Triad;
  readonly checkFailing: boolean;
  readonly investigationId?: string;
}

const denseRank = (values: readonly number[]): ReadonlyMap<number, number> =>
  new Map([...new Set(values)].sort((a, b) => a - b).map((v, i) => [v, i]));

export interface MapModel {
  readonly nodes: readonly MapNodeView[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Nodes and edges after filtering. Columns and rows are re-ranked so a filtered map has no empty columns, and the
 * left-to-right order is kept. Edges survive only when both ends do.
 */
export function mapFor(p: WorldProject, f: Filters): MapModel {
  const kept = filterComponents(p, f);
  const cols = denseRank(kept.map((c) => c.pos.col));
  const rows = denseRank(kept.map((c) => c.pos.row));
  const nodes: MapNodeView[] = kept.map((c) => ({
    id: c.id,
    name: c.name,
    layer: c.layer,
    environment: c.environment,
    col: cols.get(c.pos.col) ?? 0,
    row: rows.get(c.pos.row) ?? 0,
    triad: triadOf(c.state),
    checkFailing: c.checkFailing === true,
    ...(c.investigationId ? { investigationId: c.investigationId } : {}),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = p.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, to: e.to, kind: resolveEdgeKind(e), basis: e.basis }));
  return { nodes, edges };
}

/** Segmented labels are plain strings: strip {braces}, and mark Latin text lang="en" so Arabic pages stay isolated. */
export function segLabel(s: string): { readonly label: string; readonly lang?: string } {
  const label = s.replace(/[{}]/g, '');
  return /[A-Za-z]/.test(label) ? { label, lang: 'en' } : { label };
}

// ---- Sources -------------------------------------------------------------------------------------------------
export interface SourceRow {
  readonly provider: Provider;
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  /** Null when never read or not set up. */
  readonly ageMinutes: number | null;
  readonly current: boolean;
}

export function sourceRows(p: WorldProject): readonly SourceRow[] {
  return p.sources.map((s) => {
    const freshness = freshnessOf(s);
    return {
      provider: s.provider,
      connectivity: s.connectivity,
      freshness,
      ageMinutes: s.connectivity === 'not_configured' ? null : s.ageMinutes,
      current: freshness === 'current',
    };
  });
}

// ---- Risks and unknowns ----------------------------------------------------------------------------------------
export type UnknownReason = 'not_set_up' | 'stale' | 'no_evidence';

export function unknownReason(c: WorldComponent): UnknownReason {
  if (c.state.connectivity === 'not_configured') return 'not_set_up';
  return triadOf(c.state).freshness === 'stale' ? 'stale' : 'no_evidence';
}

export interface Risks {
  readonly unknown: readonly { readonly id: string; readonly name: string; readonly reason: UnknownReason }[];
  readonly edges: readonly { readonly from: string; readonly to: string; readonly fromName: string; readonly toName: string; readonly kind: Exclude<EdgeKind, 'authored'> }[];
  readonly sources: readonly SourceRow[];
}

/** Whole-product risks. Filters never hide a risk. */
export function risksFor(p: WorldProject): Risks {
  const name = (id: string) => p.components.find((c) => c.id === id)?.name ?? id;
  return {
    unknown: p.components
      .filter((c) => triadOf(c.state).health === 'unknown')
      .map((c) => ({ id: c.id, name: c.name, reason: unknownReason(c) })),
    edges: p.edges.flatMap((e) => {
      const kind = resolveEdgeKind(e);
      return kind === 'authored' ? [] : [{ from: e.from, to: e.to, fromName: name(e.from), toName: name(e.to), kind }];
    }),
    sources: sourceRows(p).filter((s) => !s.current),
  };
}

// ---- Delivery ---------------------------------------------------------------------------------------------------
export interface DeliveryRow {
  readonly id: string;
  /** Persona label from deliveryLabelFor, with {braces}. */
  readonly label: string;
  /** What the source claims, unless nothing was read: then unknown. */
  readonly status: DeliveryItem['status'];
  readonly truth: DisplayLabel;
  readonly freshness: Freshness;
  readonly ageMinutes: number | null;
  readonly restricted: boolean;
  readonly notReadReason?: NonNullable<EvidenceView['notReadReason']>;
}

export function deliveryRows(p: WorldProject, persona: Persona, lang: Lang): readonly DeliveryRow[] {
  return p.delivery.map((item) => {
    const v = evidenceViewFor(persona, item.evidence);
    return {
      id: item.id,
      label: deliveryLabelFor(item, persona, lang),
      status: v.label === 'unknown' ? 'unknown' : item.status,
      truth: v.label,
      freshness: v.freshness,
      ageMinutes: v.ageMinutes,
      restricted: v.restricted === true,
      ...(v.notReadReason ? { notReadReason: v.notReadReason } : {}),
    };
  });
}

// ---- Selected component -----------------------------------------------------------------------------------------
export interface LinkedEvidence {
  readonly id: string;
  /** Persona title with {braces}; "Restricted to Technical" for restricted items. */
  readonly title: string;
  readonly view: EvidenceView;
}

export const attentionFor = (p: WorldProject, c: WorldComponent): readonly Attention[] =>
  p.attention.filter((a) => a.componentId === c.id);

/** The component's own basis first, then evidence cited by attention items about it. One row per evidence id. */
export function linkedEvidence(w: World, p: WorldProject, c: WorldComponent, persona: Persona, lang: Lang): readonly LinkedEvidence[] {
  const all = [...c.state.basis, ...attentionFor(p, c).flatMap((a) => a.evidence)];
  const seen = new Set<string>();
  return all.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).map((e) => ({
    id: e.id,
    title: evidenceTitleFor(w, e.id, persona, lang),
    view: evidenceViewFor(persona, e),
  }));
}

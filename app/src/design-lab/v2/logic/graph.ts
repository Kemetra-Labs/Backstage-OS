// Mission Map logic: filters, scope, neighbour navigation, zoom. Pure functions so they can be unit-tested.
import type { World, WorldEdge, WorldNode } from '../types';
import { isRiskNode } from './status';

export type MapFilter = 'all' | 'products' | 'projects' | 'services' | 'risks';
export const MAP_FILTERS: readonly MapFilter[] = ['all', 'products', 'projects', 'services', 'risks'];

export const CANVAS = { w: 1000, h: 600 } as const;
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.6;

export interface View {
  readonly k: number;
  readonly tx: number;
  readonly ty: number;
}

export const HOME_VIEW: View = { k: 1, tx: 0, ty: 0 };

export const clampZoom = (k: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

/** Zoom about a canvas point so that point stays under the cursor. */
export function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const k = clampZoom(v.k * factor);
  const f = k / v.k;
  return { k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
}

/** A view that centres a node at the given zoom. */
export function focusView(n: Pick<WorldNode, 'x' | 'y'>, k: number): View {
  const kk = clampZoom(k);
  return { k: kk, tx: CANVAS.w / 2 - n.x * kk, ty: CANVAS.h / 2 - n.y * kk };
}

export function neighbours(id: string, edges: readonly WorldEdge[]): readonly string[] {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.a === id) out.add(e.b);
    else if (e.b === id) out.add(e.a);
  }
  return [...out];
}

/**
 * Nodes in scope: the scope node and everything within two links of it (a product, its components, and the services
 * those components use), or everything for 'all'. Out-of-scope nodes are dimmed, never removed.
 */
export function scopeSet(scope: string, w: World): ReadonlySet<string> {
  if (scope === 'all' || !w.nodes.some((n) => n.id === scope)) return new Set(w.nodes.map((n) => n.id));
  const first = neighbours(scope, w.edges);
  return new Set([scope, ...first, ...first.flatMap((id) => neighbours(id, w.edges))]);
}

export function filterSet(f: MapFilter, w: World): ReadonlySet<string> {
  const all = w.nodes;
  const pick = (fn: (n: WorldNode) => boolean) => new Set(all.filter(fn).map((n) => n.id));
  switch (f) {
    case 'products': return pick((n) => n.kind === 'product');
    case 'projects': return pick((n) => n.kind === 'project');
    case 'services': return pick((n) => n.kind === 'service');
    case 'risks': return pick((n) => isRiskNode(n, w));
    default: return pick(() => true);
  }
}

export type Dir = 'left' | 'right' | 'up' | 'down';

/** Arrow-key navigation: the nearest node whose direction from `from` lies within 60 degrees of the arrow. */
export function nextByDirection(from: string, dir: Dir, nodes: readonly WorldNode[]): string | null {
  const a = nodes.find((n) => n.id === from);
  if (!a) return null;
  const want = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  let best: { id: string; score: number } | null = null;
  for (const n of nodes) {
    if (n.id === from) continue;
    const dx = n.x - a.x;
    const dy = n.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const cos = (dx * want[0]! + dy * want[1]!) / dist;
    if (cos < 0.5) continue;
    const score = dist * (2 - cos);
    if (!best || score < best.score) best = { id: n.id, score };
  }
  return best?.id ?? null;
}

export interface TruthCounts {
  readonly observed: number;
  readonly correlated: number;
  readonly hypothesis: number;
  readonly unknown: number;
}

/** How many of a node's dependency links are observed, correlated, hypothesised or unknown. Grouping links are structure, not claims. */
export function linkCounts(id: string, w: World): TruthCounts {
  const c = { observed: 0, correlated: 0, hypothesis: 0, unknown: 0 };
  for (const e of w.edges) {
    if (e.cls !== 'dep' || (e.a !== id && e.b !== id)) continue;
    if (e.truth === 'observed') c.observed += 1;
    else if (e.truth === 'correlated') c.correlated += 1;
    else if (e.truth === 'hypothesis') c.hypothesis += 1;
    else c.unknown += 1;
  }
  return c;
}

export function kindCounts(w: World): Readonly<Record<'product' | 'project' | 'service', number>> {
  return {
    product: w.nodes.filter((n) => n.kind === 'product').length,
    project: w.nodes.filter((n) => n.kind === 'project').length,
    service: w.nodes.filter((n) => n.kind === 'service').length,
  };
}

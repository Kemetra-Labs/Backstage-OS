import { normalize, type GEdge, type GNode } from './layout.mjs';

export interface Graph { nodes: GNode[]; edges: GEdge[]; scope: string; engine: string; realNodes: number; unresolved: number }
export const DATASETS = ['fixture-35', 'synthetic-60', 'synthetic-250'] as const;

export async function loadGraph(name: string): Promise<Graph> {
  const res = await fetch(`/data/${name}.envelope.json`);
  if (!res.ok) throw new Error(`cannot load ${name}: HTTP ${res.status}`);
  const env = await res.json();
  const { nodes, edges } = normalize(env);
  const unresolved = nodes.filter((n) => n.unresolved).length;
  return { nodes, edges, scope: env.source.scope, engine: env.engine.name, realNodes: nodes.length - unresolved, unresolved };
}

export function params() {
  const p = new URLSearchParams(location.search);
  return {
    data: (DATASETS as readonly string[]).includes(p.get('data') ?? '') ? (p.get('data') as string) : 'fixture-35',
    lang: p.get('lang') === 'ar' ? ('ar' as const) : ('en' as const),
    view: p.get('view') === 'table' ? 'table' : p.get('view') === 'graph' ? 'graph' : null,
    sel: p.get('sel'),
    file: p.get('file'),
  };
}

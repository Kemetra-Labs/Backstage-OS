export const MAX_COLS: number;
export interface GNode { key: string; id: string; label: string; kind: string; language: string; file: string; line: number; col: number; row: number; unresolved: boolean; hint?: string }
export interface GEdge { key: string; idx: number; type: string; from: string; to: string; fromId: string; toId: string | null; hint?: string; file: string; line: number | null; basis: string; truth: 'observed' | 'unknown' | 'inferred'; dangling: boolean }
export function normalize(env: unknown): { nodes: GNode[]; edges: GEdge[] };
export const KIND_ORDER: string[];

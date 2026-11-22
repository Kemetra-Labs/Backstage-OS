// BACK-82: typed adapter from the already persona-scoped map model to what the React Flow renderer draws.
// Pure and framework-free so it is unit-tested in node. Privacy: the input is mapFor() output (scoped before this point);
// this adapter copies only ids, grid cells and edge certainty. It never copies an edge's evidence basis.
import type { GraphEdge, GraphNode } from '../components/DepGraph';
import { splitEdges } from '../components/depGraphEdges';
import type { EdgeKind } from '../contract/world';

/** Smallest node width. Keeps the whole node a comfortable touch target (>= 44 px) at zoom 1. */
export const FLOW_MIN_NODE_W = 160;
export const FLOW_MAX_NODE_W = 260;
export const FLOW_GAP = 28;
export const FLOW_PAD = 16;
export const FLOW_ROW_H = 124;

export interface FlowLayout {
  readonly colW: number;
  readonly rowH: number;
  readonly nodeW: number;
  readonly pad: number;
  /** Canvas size. Wider than the container when the graph does not fit: the wrapper scrolls, nothing is shrunk. */
  readonly width: number;
  readonly height: number;
}

export interface FlowNodeSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly graph: GraphNode;
}

/** Deliberately minimal: no evidence basis, no source names. Certainty is the only fact an edge carries here. */
export interface FlowEdgeSpec {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: EdgeKind;
}

export interface FlowModel {
  readonly nodes: readonly FlowNodeSpec[];
  readonly edges: readonly FlowEdgeSpec[];
  /** Links with an endpoint that is not a node. Never dropped silently: the screen says how many. */
  readonly undrawn: number;
  readonly layout: FlowLayout;
}

export function layoutFor(cols: number, rows: number, containerWidth: number): FlowLayout {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  const minCol = FLOW_MIN_NODE_W + FLOW_GAP;
  const colW = Math.max(minCol, Math.floor((Math.max(0, containerWidth) - 2 * FLOW_PAD) / c));
  const nodeW = Math.min(FLOW_MAX_NODE_W, colW - FLOW_GAP);
  return {
    colW,
    rowH: FLOW_ROW_H,
    nodeW,
    pad: FLOW_PAD,
    width: Math.max(containerWidth, 2 * FLOW_PAD + c * colW),
    height: 2 * FLOW_PAD + r * FLOW_ROW_H,
  };
}

export function toFlowModel(nodes: readonly GraphNode[], edges: readonly GraphEdge[], containerWidth: number): FlowModel {
  const layout = layoutFor(
    Math.max(0, ...nodes.map((n) => n.col + 1)),
    Math.max(0, ...nodes.map((n) => n.row + 1)),
    containerWidth,
  );
  const { drawn, undrawn } = splitEdges(edges, new Set(nodes.map((n) => n.id)));
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: layout.pad + n.col * layout.colW,
      y: layout.pad + n.row * layout.rowH,
      width: layout.nodeW,
      graph: n,
    })),
    edges: drawn.map((e, i) => ({ id: `e${i}:${e.from}->${e.to}:${e.kind}`, source: e.from, target: e.to, kind: e.kind })),
    undrawn: undrawn.length,
    layout,
  };
}

// React Flow (@xyflow/react) page: same normalised graph and the same x/y (col*W, row*H) as the other renderers.
import '@xyflow/react/dist/style.css';
import './reactflow.css';
import { useMemo } from 'react';
import { Controls, MarkerType, Position, ReactFlow, type Edge, type Node, type OnNodesChange } from '@xyflow/react';
import type { CanvasProps } from '../shared/Shell';

const W = 210;
const H = 84;

export function ReactFlowCanvas({ graph, selected, onSelect, copy }: CanvasProps) {
  const baseNodes = useMemo<Node[]>(() => graph.nodes.map((n) => ({
    id: n.key,
    position: { x: n.col * W, y: n.row * H },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    className: `kw-node${n.unresolved ? ' kw-unres' : ''}`,
    ariaLabel: n.unresolved ? `${copy.unresolved}: ${n.hint}` : `${n.label}, ${n.kind}`,
    data: { label: (
      <span className="kw-lbl">
        <bdi dir="ltr" className="kw-name">{n.unresolved ? copy.unresolved : n.label}</bdi>
        <span className="kw-sub">{n.unresolved ? <bdi dir="ltr">{n.hint}</bdi> : `${n.kind} · ${n.language}`}</span>
      </span>
    ) },
  })), [graph, copy]);

  const nodes = useMemo(() => baseNodes.map((n) => (n.id === selected ? { ...n, selected: true } : n)), [baseNodes, selected]);

  const edges = useMemo<Edge[]>(() => graph.edges.map((e) => ({
    id: e.key,
    source: e.from,
    target: e.to,
    className: e.truth === 'observed' ? 'kw-edge-obs' : 'kw-edge-unk',
    markerEnd: e.truth === 'observed' ? { type: MarkerType.ArrowClosed, color: '#2de2ec' } : 'kw-open-circle',
    ariaLabel: `${e.type}, ${e.truth === 'observed' ? copy.observed : copy.unknown}`,
  })), [graph, copy]);

  const onNodesChange: OnNodesChange = (changes) => {
    for (const c of changes) if (c.type === 'select' && c.selected) onSelect(c.id);
  };

  return (
    <div className="rf-wrap" data-testid="rf-wrap">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <marker id="kw-open-circle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="3.6" className="mk-unk" />
          </marker>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.05}
        maxZoom={2}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

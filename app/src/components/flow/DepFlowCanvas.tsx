// BACK-82: read-only React Flow renderer for the Project dependency map. Loaded lazily by <DepFlow>; never imported
// directly, so @xyflow/react and its stylesheet stay out of the default bundle.
//
// Read-only by construction: nodes cannot be dragged, connected or deleted; edges are decorative (the table carries them);
// zoom and pan are off, so every node stays a >= 44 px target and the page scrolls normally. A map wider than its panel
// scrolls sideways in a native wrapper, as DepGraph does, which also gives keyboard focus its native scroll-into-view.
// The only tab stop per node is a real <button>.
import '@xyflow/react/dist/style.css';
import './depFlow.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, ReactFlow, type AriaLabelConfig, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useApp } from '../../app/AppContext';
import { plain } from '../../i18n/format';
import { PROJECT_COPY } from '../../i18n/screens/project';
import { toFlowModel } from '../../view/flowModel';
import type { GraphEdge, GraphNode } from '../DepGraph';
import { Text } from '../Text';

interface Props {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly selectedId?: string | null;
  readonly onSelect: (id: string) => void;
  /** Clears the selection (Escape). */
  readonly onClear: () => void;
  readonly label: string;
}

interface KwData extends Record<string, unknown> {
  readonly graph: GraphNode;
  readonly pressed: boolean;
  readonly onPick: (id: string) => void;
}
type KwNode = Node<KwData, 'kw'>;

/** The same markup, classes and wording as DepGraph's node, so persona text and Unknown-is-never-Healthy carry over. */
function FlowNode({ data }: NodeProps<KwNode>) {
  const { copy, lang, persona } = useApp();
  const n = data.graph;
  const cls = `dg-node nopan health-${n.triad.health} fresh-${n.triad.freshness}${n.checkFailing ? ' dg-hot' : ''}`;
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="kwf-handle" />
      <button type="button" className={cls} data-node={n.id} aria-pressed={data.pressed} onClick={() => data.onPick(n.id)}>
        <span className="dg-box" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <bdi dir="ltr" className="dg-name">{n.name}</bdi>
          {n.checkFailing && <span className="dg-check"><Text s={copy.checkFailing[persona]} /></span>}
          <span className="dg-health" data-health={n.triad.health}>{copy.health[n.triad.health]}</span>
          {n.sub && <span className="dg-sub">{n.sub}</span>}
        </span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} className="kwf-handle" />
    </>
  );
}

const NODE_TYPES = { kw: FlowNode };

/** Width of the scroll wrapper, kept current. Zero until measured, which layoutFor treats as "use the natural width". */
function useWidth(ref: { readonly current: HTMLElement | null }): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function DepFlowCanvas({ nodes, edges, selectedId = null, onSelect, onClear, label }: Props) {
  const { lang, shell } = useApp();
  const pc = PROJECT_COPY[lang];
  const scroller = useRef<HTMLDivElement>(null);
  const width = useWidth(scroller);
  const model = useMemo(() => toFlowModel(nodes, edges, width), [nodes, edges, width]);
  const { layout } = model;

  // The library hard-codes role="application" on its root (after any props, so it cannot be overridden). That role switches
  // screen readers out of browse mode, which is wrong for a read-only map of buttons; the labelled group around it carries
  // the semantics instead. Set once on mount: React does not re-apply an attribute whose prop has not changed.
  useEffect(() => {
    scroller.current?.querySelector('.react-flow')?.setAttribute('role', 'presentation');
  }, []);

  const flowNodes = useMemo<KwNode[]>(() => model.nodes.map((n) => ({
    id: n.id,
    type: 'kw',
    position: { x: n.x, y: n.y },
    style: { width: n.width },
    data: { graph: n.graph, pressed: selectedId === n.id, onPick: onSelect },
    draggable: false,
    selectable: false,
    focusable: false,
    connectable: false,
    deletable: false,
    ariaRole: 'presentation',
    // The library stamps aria-roledescription="node" (English) on every wrapper; the button inside is the real control.
    domAttributes: { 'aria-roledescription': undefined },
  })), [model.nodes, selectedId, onSelect]);

  // Edges are decorative here: the dependency table carries every link and its basis, and an edge-by-edge tab path was the
  // BACK-22 keyboard finding. Certainty is encoded by line style (solid, dashed, dotted) exactly as in DepGraph.
  const flowEdges = useMemo<Edge[]>(() => model.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'straight',
    className: `kwf-edge kwf-${e.kind}`,
    selectable: false,
    focusable: false,
    deletable: false,
    reconnectable: false,
    // Hidden from assistive tech, but never left with the library's English default ("Edge from X to Y").
    ariaLabel: plain(shell.edge[e.kind]),
    ariaRole: 'presentation',
    domAttributes: { 'aria-hidden': true },
  })), [model.edges, shell]);

  const aria = useMemo<Partial<AriaLabelConfig>>(() => ({
    'node.a11yDescription.default': plain(pc.flow.nodeDesc),
    'node.a11yDescription.keyboardDisabled': plain(pc.flow.nodeDesc),
    'edge.a11yDescription.default': plain(pc.flow.edgeDesc),
  }), [pc]);

  // Escape clears the selection. Listen on the document, not the map: some browsers (Safari) do not focus a button on a mouse
  // click, so focus is often outside the map right after selecting. Text fields and dialogs keep their own Escape.
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      e.preventDefault();
      onClear();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, onClear]);

  return (
    <div className="depflow-wrap">
      <div
        ref={scroller}
        className="depflow-scroll"
        dir="ltr"
        role="group"
        aria-label={label}
        data-testid="dep-flow"
        data-nodes={model.nodes.length}
        data-edges={model.edges.length}
      >
        <div className="depflow" style={{ width: layout.width, height: layout.height }}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={1}
            maxZoom={1}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            connectOnClick={false}
            disableKeyboardA11y
            autoPanOnNodeFocus={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            zoomActivationKeyCode={null}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            panOnDrag={false}
            preventScrolling={false}
            ariaLabelConfig={aria}
          />
        </div>
      </div>
      <ul className="dg-legend" aria-label={shell.map.legend}>
        {(['authored', 'provisional', 'hypothesis'] as const).map((k) => (
          <li key={k}><span className={`dg-swatch dg-${k}`} aria-hidden="true" />{shell.edge[k]}: {shell.edgeNote[k]}</li>
        ))}
      </ul>
      {model.undrawn > 0 && (
        <p className="note" data-testid="dep-flow-undrawn" data-count={model.undrawn}>{shell.map.undrawn(model.undrawn)}</p>
      )}
      <p className="note"><Text s={pc.flow.hint} /> {shell.map.direction}</p>
    </div>
  );
}

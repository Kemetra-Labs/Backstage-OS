// Copy of app/src/components/DepGraph.tsx (Kawalys React/SVG component), BACK-22 harness.
// What is unchanged: the CSS-grid cell layout, the absolutely positioned SVG overlay (preserveAspectRatio="none",
// non-scaling-stroke), straight right-edge -> left-edge lines, nodes as native <button aria-pressed>, the dir="ltr" canvas.
// What had to change (adapter, ~35 lines): useApp/copy/shell context replaced by props; GraphNode.triad (health) replaced by
// a kind line because code-graph nodes have no health; edge kinds mapped to observed|unknown; two SVG markers added
// (the original draws no arrowheads); React keys made unique (the original key `${from}-${to}` collides for two edges
// between the same pair); edges whose endpoint is missing are NOT silently dropped (the original returns null): the
// adapter supplies a placeholder node instead.
import './depgraph.css';
import type { CanvasProps } from '../shared/Shell';

const CELL = 100;

export function DepGraphCanvas({ graph, selected, onSelect, lang, copy }: CanvasProps) {
  const nodes = graph.nodes;
  const edges = graph.edges;
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1));
  const at = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="depgraph-wrap">
      <div className="depgraph-scroll" dir="ltr">
        <div
          className="depgraph"
          dir="ltr"
          data-testid="dep-graph"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(132px, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(84px, 1fr))`, minWidth: cols * 140 }}
        >
          <svg className="depgraph-edges" viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" className="mk-obs" /></marker>
              <marker id="dg-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><circle cx="5" cy="5" r="3.6" className="mk-unk" /></marker>
            </defs>
            {edges.map((e) => {
              const a = at.get(e.from);
              const b = at.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={e.key}
                  data-edge={e.key}
                  className={`dg-edge ${e.truth === 'observed' ? 'dg-authored' : 'dg-hypothesis'}`}
                  markerEnd={e.truth === 'observed' ? 'url(#dg-arrow)' : 'url(#dg-open)'}
                  x1={a.col * CELL + CELL - 6} y1={a.row * CELL + CELL / 2}
                  x2={b.col * CELL + 6} y2={b.row * CELL + CELL / 2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {nodes.map((n) => {
            const body = (
              <span className="dg-box" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <bdi dir="ltr" className="dg-name">{n.unresolved ? copy.unresolved : n.label}</bdi>
                <span className="dg-sub">{n.unresolved ? <bdi dir="ltr">{n.hint}</bdi> : `${n.kind} · ${n.language}`}</span>
              </span>
            );
            const cls = `dg-node${n.unresolved ? ' dg-unres' : ''}`;
            return (
              <div key={n.key} className="dg-cell" style={{ gridColumn: n.col + 1, gridRow: n.row + 1 }}>
                <button type="button" className={cls} data-node={n.key} aria-pressed={selected === n.key} onClick={() => onSelect(n.key)}>
                  {body}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

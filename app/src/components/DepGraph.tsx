import type { ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { resolveLabel } from '../contract/rules';
import type { EvidenceReference } from '../contract/types';
import type { EdgeKind } from '../contract/world';
import { Text } from './Text';
import { TruthChip } from './TruthChip';
import type { Triad } from '../view/world';

export interface GraphNode {
  readonly id: string;
  /** Technical name, left to right. */
  readonly name: string;
  readonly col: number;
  readonly row: number;
  readonly triad: Triad;
  readonly checkFailing?: boolean;
  /** Persona-appropriate secondary line. */
  readonly sub?: ReactNode;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly basis: readonly EvidenceReference[];
}

interface Props {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly selectedId?: string | null;
  /** When given, nodes are buttons (aria-pressed); otherwise plain items. */
  readonly onSelect?: (id: string) => void;
  readonly label: string;
}

const CELL = 100;

/**
 * Dependency map. Topology is meaning, so it is drawn left to right in both languages (dir="ltr"); node text follows
 * the page language. Edge style encodes certainty: solid declared, dashed provisional, dotted suspected.
 * Always pair with <DepTable> for an accessible, non-visual equivalent.
 */
export function DepGraph({ nodes, edges, selectedId, onSelect, label }: Props) {
  const { copy, lang, persona, shell } = useApp();
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1));
  const at = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="depgraph-wrap">
      <div className="depgraph-scroll" dir="ltr">
        <div
          className="depgraph"
          dir="ltr"
          data-testid="dep-graph"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(132px, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(112px, 1fr))`, minWidth: cols * 140 }}
        >
          <svg className="depgraph-edges" viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} preserveAspectRatio="none" aria-hidden="true">
            {edges.map((e) => {
              const a = at.get(e.from);
              const b = at.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.from}-${e.to}`}
                  className={`dg-edge dg-${e.kind}`}
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
                <bdi dir="ltr" className="dg-name">{n.name}</bdi>
                {n.checkFailing && <span className="dg-check"><Text s={copy.checkFailing[persona]} /></span>}
                <span className="dg-health" data-health={n.triad.health}>{copy.health[n.triad.health]}</span>
                {n.sub && <span className="dg-sub">{n.sub}</span>}
              </span>
            );
            const cls = `dg-node health-${n.triad.health} fresh-${n.triad.freshness}${n.checkFailing ? ' dg-hot' : ''}`;
            return (
              <div key={n.id} className="dg-cell" style={{ gridColumn: n.col + 1, gridRow: n.row + 1 }}>
                {onSelect ? (
                  <button type="button" className={cls} data-node={n.id} aria-pressed={selectedId === n.id} onClick={() => onSelect(n.id)}>
                    {body}
                  </button>
                ) : (
                  <div className={cls} data-node={n.id}>{body}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ul className="dg-legend" aria-label={shell.map.legend}>
        {(['authored', 'provisional', 'hypothesis'] as const).map((k) => (
          <li key={k}><span className={`dg-swatch dg-${k}`} aria-hidden="true" />{shell.edge[k]}: {shell.edgeNote[k]}</li>
        ))}
      </ul>
      <p className="note">{shell.map.direction} <span className="vh">{label}</span></p>
    </div>
  );
}

/** The same dependencies as a table: the accessible alternative to the map, and the mobile fallback. */
export function DepTable({ nodes, edges, caption }: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[]; readonly caption?: string }) {
  const { copy, persona, shell } = useApp();
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div className="table-scroll">
      <table className="data-table" data-testid="dep-table">
        <caption>{caption ?? shell.map.tableCaption}</caption>
        <thead>
          <tr><th scope="col">{shell.map.from}</th><th scope="col">{shell.map.to}</th><th scope="col">{shell.map.kind}</th><th scope="col">{shell.map.basis}</th></tr>
        </thead>
        <tbody>
          {edges.map((e) => (
            <tr key={`${e.from}-${e.to}`} data-edge={`${e.from}->${e.to}`}>
              <td><bdi dir="ltr" className="ltr">{name(e.from)}</bdi></td>
              <td><bdi dir="ltr" className="ltr">{name(e.to)}</bdi></td>
              <td>{shell.edge[e.kind]}</td>
              <td>
                {e.basis.length === 0 ? <span className="note">{shell.map.noBasis}</span> : e.basis.map((b) => (
                  <span key={b.id} className="basis-item"><bdi dir="ltr" className="ltr">{b.id}</bdi> <TruthChip label={resolveLabel(b)} style={style} copy={copy} /></span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

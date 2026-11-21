import type { Copy } from './i18n';
import type { Graph } from './data';
import type { GEdge, GNode } from './layout.mjs';
import { Chip } from './Legend';

const Ltr = ({ children }: { children: React.ReactNode }) => <bdi dir="ltr" className="ltr">{children}</bdi>;

function EdgeItem({ e, copy, other }: { e: GEdge; copy: Copy; other: GNode }) {
  return (
    <li className="ed" data-edge={e.key} data-truth={e.truth}>
      <span className="ed-type">{e.type}</span>
      <Chip truth={e.truth} copy={copy} />
      <span className="ed-peer">
        {other.unresolved ? <span className="unres-word">{copy.unresolved}{e.hint ? <> (<Ltr>{e.hint}</Ltr>)</> : null}</span> : <Ltr>{other.id}</Ltr>}
      </span>
      <span className="ev"><Ltr>{e.file}:{e.line ?? copy.noLine}</Ltr></span>
    </li>
  );
}

export function Inspector({ g, sel, copy, onClear }: { g: Graph; sel: string | null; copy: Copy; onClear: () => void }) {
  const node = sel ? g.nodes.find((n) => n.key === sel) : null;
  const byKey = new Map(g.nodes.map((n) => [n.key, n]));
  return (
    <div className="insp" data-testid="inspector" aria-live="polite">
      <h2>{copy.inspector}</h2>
      {!node && <p className="note" data-testid="insp-empty">{copy.noSelection}</p>}
      {node && (
        <div data-testid="insp-body" data-node={node.key}>
          <p className="insp-id"><Ltr>{node.unresolved ? copy.unresolved : node.id}</Ltr></p>
          {node.unresolved ? <p className="note">{copy.placeholderNote} {node.hint ? <Ltr>{node.hint}</Ltr> : null}</p> : (
            <dl>
              <dt>{copy.colKind}</dt><dd>{node.kind}</dd>
              <dt>{copy.colLang}</dt><dd>{node.language}</dd>
              <dt>{copy.colLoc}</dt><dd><Ltr>{node.file}:{node.line}</Ltr></dd>
            </dl>
          )}
          {(['outgoing', 'incoming'] as const).map((dir) => {
            const list = g.edges.filter((e) => (dir === 'outgoing' ? e.from : e.to) === node.key);
            return (
              <section key={dir}>
                <h3>{copy[dir]} ({list.length})</h3>
                {list.length === 0 ? <p className="note">{copy.none}</p> : (
                  <ul className="edlist">{list.map((e) => <EdgeItem key={e.key} e={e} copy={copy} other={byKey.get(dir === 'outgoing' ? e.to : e.from)!} />)}</ul>
                )}
              </section>
            );
          })}
          <button type="button" className="btn" data-testid="clear" onClick={onClear}>{copy.clear}</button>
        </div>
      )}
    </div>
  );
}

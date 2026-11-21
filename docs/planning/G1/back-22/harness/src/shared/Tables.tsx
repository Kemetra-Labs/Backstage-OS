import type { Copy } from './i18n';
import type { Graph } from './data';

const Ltr = ({ children }: { children: React.ReactNode }) => <bdi dir="ltr" className="ltr">{children}</bdi>;

/** The accessible, renderer-independent equivalent: every real node and every edge, with evidence. */
export function Tables({ g, sel, copy, onSelect }: { g: Graph; sel: string | null; copy: Copy; onSelect: (k: string) => void }) {
  const byKey = new Map(g.nodes.map((n) => [n.key, n]));
  const real = g.nodes.filter((n) => !n.unresolved);
  return (
    <div className="tables" data-testid="tables">
      <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.nodesTable}>
        <table className="data-table" data-testid="nodes-table">
          <caption>{copy.nodesTable} ({real.length})</caption>
          <thead><tr><th scope="col">{copy.colId}</th><th scope="col">{copy.colKind}</th><th scope="col">{copy.colLang}</th><th scope="col">{copy.colLoc}</th></tr></thead>
          <tbody>
            {real.map((n) => (
              <tr key={n.key} data-node={n.key} aria-selected={sel === n.key}>
                <th scope="row"><button type="button" className="rowbtn" aria-pressed={sel === n.key} onClick={() => onSelect(n.key)}><Ltr>{n.id}</Ltr></button></th>
                <td>{n.kind}</td><td>{n.language}</td><td><Ltr>{n.file}:{n.line}</Ltr></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={copy.edgesTable}>
        <table className="data-table" data-testid="edges-table">
          <caption>{copy.edgesTable} ({g.edges.length})</caption>
          <thead><tr><th scope="col">{copy.colFrom}</th><th scope="col">{copy.colTo}</th><th scope="col">{copy.colType}</th><th scope="col">{copy.colBasis}</th><th scope="col">{copy.colEvidence}</th></tr></thead>
          <tbody>
            {g.edges.map((e) => {
              const to = byKey.get(e.to)!;
              return (
                <tr key={e.key} data-edge={e.key} data-truth={e.truth}>
                  <td><button type="button" className="rowbtn" onClick={() => onSelect(e.from)}><Ltr>{e.fromId}</Ltr></button></td>
                  <td>{to.unresolved ? <span className="unres-word">{copy.unresolved}{e.hint ? <> (<Ltr>{e.hint}</Ltr>)</> : null}</span> : <Ltr>{to.id}</Ltr>}</td>
                  <td>{e.type}</td>
                  <td><span className={`chip ${e.truth === 'observed' ? 'chip-obs' : 'chip-unk'}`}><span aria-hidden="true">{e.truth === 'observed' ? '✓' : '?'}</span> {e.truth === 'observed' ? copy.observed : copy.unknown}</span></td>
                  <td><Ltr>{e.file}:{e.line ?? copy.noLine}</Ltr></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

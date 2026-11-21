import './perf-boot';
import './index.css';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { COPY, type Copy, type Lang } from './i18n';
import { DATASETS, loadGraph, params, type Graph } from './data';
import { Inspector } from './Inspector';
import { Legend } from './Legend';
import { Tables } from './Tables';

export interface CanvasProps {
  graph: Graph;
  selected: string | null;
  onSelect: (key: string | null) => void;
  lang: Lang;
  copy: Copy;
  fileParam: string | null;
  datasetKey: string;
}

type RendererId = 'depgraph' | 'reactflow' | 'archify';
const NAMES: Record<RendererId, string> = { depgraph: 'DepGraph', reactflow: 'React Flow', archify: 'Archify' };

function navHref(r: RendererId) {
  const q = new URLSearchParams(location.search);
  q.delete('sel'); q.delete('file');
  const s = q.toString();
  return `/${r}.html${s ? '?' + s : ''}`;
}

function Shell({ renderer, Canvas }: { renderer: RendererId; Canvas: ComponentType<CanvasProps> }) {
  const init = useMemo(params, []);
  const [lang, setLang] = useState<Lang>(init.lang);
  const [view, setView] = useState<'graph' | 'table'>((init.view as 'graph' | 'table' | null) ?? (window.innerWidth < 641 ? 'table' : 'graph'));
  const [graph, setGraph] = useState<Graph | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const copy = COPY[lang];

  useEffect(() => {
    loadGraph(init.data).then((g) => {
      performance.mark('kw-data-ready');
      window.__kw.marks.dataReady = performance.now();
      setGraph(g);
      if (init.sel) setSel(g.nodes.find((n) => n.key === init.sel || n.id === init.sel)?.key ?? null);
    }).catch((e) => setErr(String(e)));
  }, [init]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // first-render mark: after the graph (or table) has been mounted and painted twice
  useEffect(() => {
    if (!graph) return;
    let a = 0, b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => {
      performance.mark('kw-render-end');
      window.__kw.marks.renderEnd = performance.now();
      window.__kw.ready = true;
      document.body.setAttribute('data-ready', '1');
    }); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [graph]);

  const onSelect = useCallback((k: string | null) => setSel(k), []);
  const setParam = (k: string, v: string) => { const q = new URLSearchParams(location.search); q.set(k, v); return `${location.pathname}?${q.toString()}`; };

  if (err) return <p role="alert">{err}</p>;
  const nodeLabel = graph ? copy.counts(graph.realNodes, graph.edges.length, graph.unresolved) : '';

  return (
    <div className="app" data-renderer={renderer}>
      <a className="skip" href="#inspector">{copy.skip}</a>
      <header className="top">
        <h1>{copy.title}: <span data-testid="renderer-name">{NAMES[renderer]}</span></h1>
        <p className="note" data-testid="demo-note">{copy.demo}</p>
        <div className="controls">
          <nav aria-label={copy.renderer} className="seg">
            {(Object.keys(NAMES) as RendererId[]).map((r) => (
              <a key={r} href={navHref(r)} aria-current={r === renderer ? 'page' : undefined} className="segbtn">{NAMES[r]}</a>
            ))}
          </nav>
          <label className="sel"><span>{copy.data}</span>
            <select value={init.data} onChange={(e) => { location.assign(setParam('data', e.target.value)); }} data-testid="data-select">
              {DATASETS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="seg" role="group" aria-label={copy.language}>
            <button type="button" className="segbtn" aria-pressed={lang === 'en'} onClick={() => setLang('en')} data-testid="lang-en">EN</button>
            <button type="button" className="segbtn" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')} data-testid="lang-ar">{'عربي'}</button>
          </div>
          <div className="seg" role="group" aria-label="View">
            <button type="button" className="segbtn" aria-pressed={view === 'graph'} onClick={() => setView('graph')} data-testid="view-graph">{copy.graphView}</button>
            <button type="button" className="segbtn" aria-pressed={view === 'table'} onClick={() => setView('table')} data-testid="view-table">{copy.tableView}</button>
          </div>
        </div>
      </header>
      <main className="body">
        <section className="stage" aria-label={copy.graphLabel}>
          {graph && <p className="counts" data-testid="counts">{nodeLabel} <span className="note ltr-inline">[<bdi dir="ltr">{graph.scope}</bdi>]</span></p>}
          <Legend copy={copy} />
          {!graph && <p className="note">...</p>}
          {graph && view === 'graph' && (
            <div className="canvas" dir="ltr" data-testid="canvas" role="group" aria-label={copy.graphLabel}>
              <Canvas graph={graph} selected={sel} onSelect={onSelect} lang={lang} copy={copy} fileParam={init.file} datasetKey={init.data} />
            </div>
          )}
          {graph && view === 'table' && <Tables g={graph} sel={sel} copy={copy} onSelect={onSelect} />}
          <p className="note">{copy.canvasDirection}</p>
        </section>
        <aside id="inspector" className="side" tabIndex={-1} aria-label={copy.inspector}>
          {graph && <Inspector g={graph} sel={sel} copy={copy} onClear={() => setSel(null)} />}
        </aside>
      </main>
    </div>
  );
}

export function mount(renderer: RendererId, Canvas: ComponentType<CanvasProps>) {
  createRoot(document.getElementById('root')!).render(<Shell renderer={renderer} Canvas={Canvas} />);
}

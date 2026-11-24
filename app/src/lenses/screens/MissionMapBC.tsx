// Mission Map, Hybrid B+C pilot (BACK-27). Concept B's immersive orbit map with concept C's accessible ledger as the List
// view. It reads the same synthetic WORLD as every V2 screen and adds no data. The host mounts it at #/map (MissionMapLens.tsx).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '../bc/Canvas';
import { Inspector } from '../bc/Inspector';
import { Legend, OrbitKey, ReadingsPanel, Timeline } from '../bc/Panels';
import { introWanted, markIntroPlayed, useBcUi } from '../bc/state';
import { Ledger, LinksTable, Matrix } from '../bc/Tables';
import { Icon } from '../components/Icon';
import { Cosmos, Kpi, Panel, Seg, T } from '../components/ui';
import { useV2 } from '../context';
import { nodePoints } from '../fixtures/orbit-layout';
import { WORLD } from '../fixtures/world';
import { authorizedWorld } from '../logic/authorize';
import type { K } from '../i18n/t';
import { bcFigures } from '../logic/bc';
import { filterSet, MAP_FILTERS, scopeSet, type MapFilter } from '../logic/graph';

/** The approved render opens on stock-sync, the one system with an observed failing check. */
const DEFAULT_SELECTION = 'stock-sync';
const FILTER_KEY: Readonly<Record<MapFilter, K>> = {
  all: 'map.f.all', products: 'map.f.products', projects: 'map.f.projects', services: 'map.f.services', risks: 'map.f.risks',
};
const SCOPES = ['retail-tower', 'khepri', 'seshat-bi'] as const;

/** The node shown when the route names none: the approved render's stock-sync for the default scopes, else the scoped system itself. */
export const fallbackNode = (scope: string): string => (scope === 'all' || scope === 'retail-tower' ? DEFAULT_SELECTION : scope);

export function MissionMapBC() {
  const { route, go, open, t } = useV2();
  const w = authorizedWorld(WORLD, route.persona);
  const [ui, setUi] = useBcUi();
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const points = useMemo(() => nodePoints(w), [w]);
  const fig = useMemo(() => bcFigures(w), [w]);
  // With no node chosen: the scoped system when a scope other than the default is set (as in V2), else the approved render's stock-sync.
  const fallback = fallbackNode(route.scope);
  const sel = w.nodes.find((n) => n.id === (route.node ?? fallback)) ?? w.nodes[0]!;
  // Scope and filter dim in the map and hide in the list, as in V2. Nothing is removed from the world.
  const active = useMemo(() => {
    const a = scopeSet(route.scope, w);
    const f = filterSet(ui.filter, w);
    return new Set([...a].filter((id) => f.has(id)));
  }, [route.scope, ui.filter, w]);
  // First-load orbit: once per page session, gone as soon as it has played or the reviewer leaves the map.
  const [intro, setIntro] = useState(introWanted);
  useEffect(() => { markIntroPlayed(); }, []);
  useEffect(() => {
    if (!intro) return undefined;
    if (ui.mode !== 'map') { setIntro(false); return undefined; }
    const id = window.setTimeout(() => setIntro(false), 1300);
    return () => window.clearTimeout(id);
  }, [intro, ui.mode]);

  const select = (id: string) => { go({ node: id }); setUi({ tab: 'overview' }); };
  const map = ui.mode === 'map';

  return (
    <div className="kv2-bc" data-mode={ui.mode} data-testid="bc-stage">
      <div className="kv2-bc-region">
        <Cosmos />
        <div className="kv2-bc-view" data-mode={ui.mode}>
          <div className="kv2-bc-title">
            <p className="kv2-eyebrow"><T k="map.eyebrow" /></p>
            <h1><T k="nav.map" /><span className="kv2-chip kv2-chip-outline"><T k="bc.concept" /></span></h1>
            <label className="kv2-select">
              <span><T k="map.scope.label" /></span>
              <select value={route.scope} onChange={(e) => go({ scope: e.target.value, node: null })} aria-label={t('map.scope.label')}>
                <option value="all">{t('scope.all')}</option>
                {SCOPES.map((id) => <option key={id} value={id} dir="ltr">{w.nodes.find((n) => n.id === id)!.title}</option>)}
              </select>
              <Icon name="chevron" size={14} />
            </label>
            <div className="kv2-bc-pills">
              <Kpi icon="alert" value={fig.risks} label={<T k="map.kpi.risks" />} tone="warn" id="kpi-risks" />
              <Kpi icon="pulse" value={fig.sourceIssues} label={<T k="map.kpi.issues" />} id="kpi-issues" />
            </div>
          </div>

          <div className="kv2-bc-controls">
            <div className="kv2-bc-top">
              <Seg label={t('map.f.label')} value={ui.filter} onChange={(filter) => setUi({ filter })} options={MAP_FILTERS.map((f) => ({ value: f, label: t(FILTER_KEY[f]) }))} />
              <Seg label={t('map.view.label')} value={ui.mode} onChange={(mode) => setUi({ mode })} options={[{ value: 'map', label: t('view.map'), icon: 'network' }, { value: 'list', label: t('view.list'), icon: 'list' }]} />
            </div>
            <div className="kv2-bc-key kv2-bc-glass">
              <Legend />
              <OrbitKey w={w} />
              {map && <p className="kv2-bc-hint"><T k="bc.hint" /></p>}
            </div>
          </div>

          {map ? (
            <>
              <Canvas w={w} points={points} sel={sel.id} active={active} onSelect={select} nodeRefs={nodeRefs} intro={intro} />
              <Timeline w={w} />
            </>
          ) : (
            <div className="kv2-bc-list">
              <Panel id="bc-ledger" title={t('bc.ledger')} sub={t('bc.ledger.sub')} icon="list" className="kv2-bc-panel">
                <Ledger w={w} active={active} sel={sel.id} onSelect={select} />
              </Panel>
              <Panel id="bc-matrix" title={t('bc.matrix')} sub={t('bc.matrix.sub')} icon="db" className="kv2-bc-panel">
                <Matrix w={w} />
              </Panel>
              <Panel id="bc-links" title={t('map.cap.links')} icon="network" className="kv2-bc-panel">
                <LinksTable w={w} active={active} />
              </Panel>
              <Timeline w={w} />
            </div>
          )}
        </div>
      </div>

      <div className="kv2-bc-side kv2-bc-glass">
        <Inspector w={w} node={sel} tab={ui.tab} setTab={(tab) => setUi({ tab })} isScope={route.scope === sel.id} onOpen={open} />
        <ReadingsPanel w={w} />
      </div>
    </div>
  );
}

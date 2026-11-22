// Screen A. Mission Map: an interactive constellation of products, projects and services.
// Anchor: the glowing hub over a planet horizon. Every link is classified (observed / correlated / hypothesis / unknown).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { EvidenceItem } from '../components/evidence';
import { Icon, type IconName } from '../components/Icon';
import { effectiveFreshness, resolveLabel } from '../../../contract/rules';
import { Age, Cosmos, Kpi, Lt, Panel, Provider_, Seg, T, TabBar, ToneChip, TruthChip, Tx } from '../components/ui';
import { useV2 } from '../context';
import { WORLD } from '../fixtures/world';
import { authorizedWorld } from '../logic/authorize';
import { evidenceOf, nodeChip, type NodeChipKind } from '../logic/evidence';
import {
  CANVAS, MAP_FILTERS, ZOOM_MAX, ZOOM_MIN, HOME_VIEW, filterSet, focusView, kindCounts, linkCounts, neighbours, nextByDirection, scopeSet,
  zoomAt, type MapFilter, type View,
} from '../logic/graph';
import { isRiskNode, minutesSince, sourceCounts, sourceStatus } from '../logic/status';
import { plain, type K } from '../i18n/t';
import type { WorldEdge, WorldNode } from '../types';

const NODE_ICON: Readonly<Record<string, IconName>> = {
  'retail-tower': 'layers', khepri: 'cube', 'stock-sync': 'bolt', pos: 'grid', inventory: 'db', github: 'code', jira: 'board',
  sentry: 'radar', port: 'book', 'seshat-bi': 'chart',
};
const ND = (id: string) => `map.nd.${id}` as K;
const NL = (node: Pick<WorldNode, 'id' | 'descKey'>) => (node.descKey ?? `map.nl.${node.id}`) as K;
const FILTER_KEY: Readonly<Record<MapFilter, K>> = {
  all: 'map.f.all', products: 'map.f.products', projects: 'map.f.projects', services: 'map.f.services', risks: 'map.f.risks',
};
type Tab = 'overview' | 'evidence' | 'sources';

function curve(a: WorldNode, b: WorldNode, bend: number): { d: string; mx: number; my: number } {
  const mx0 = (a.x + b.x) / 2;
  const my0 = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx0 + (-dy / len) * len * bend;
  const cy = my0 + (dx / len) * len * bend;
  return { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, mx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
}

function useChipText() {
  const { copy, t } = useV2();
  return (k: NodeChipKind): string => {
    switch (k) {
      case 'check': return t('ns.checkFailing');
      case 'healthy': return copy.health.healthy;
      case 'degraded': return copy.health.degraded;
      case 'down': return copy.health.down;
      case 'unavailable': return copy.connectivity.unavailable;
      case 'notset': return copy.connectivity.not_configured;
      case 'stale': return t('chip.stale');
      default: return copy.health.unknown;
    }
  };
}

export function MissionMap() {
  const { route, go, open, t, copy } = useV2();
  const w = authorizedWorld(WORLD, route.persona);
  const chipText = useChipText();
  const selId = route.node ?? (route.scope === 'all' ? 'retail-tower' : route.scope);
  const sel = w.nodes.find((n) => n.id === selId) ?? w.nodes[0]!;
  const [filter, setFilter] = useState<MapFilter>('all');
  const [mode, setMode] = useState<'map' | 'list'>(() => (window.matchMedia('(max-width: 640px)').matches ? 'list' : 'map'));
  const [tab, setTab] = useState<Tab>('overview');
  const [view, setView] = useState<View>(HOME_VIEW);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const active = useMemo(() => {
    const a = scopeSet(route.scope, w);
    const f = filterSet(filter, w);
    return new Set([...a].filter((id) => f.has(id)));
  }, [route.scope, filter, w]);

  useEffect(() => {
    const n = w.nodes.find((x) => x.id === route.scope);
    setView(!n || n.id === 'retail-tower' ? HOME_VIEW : focusView(n, 1.25));
  }, [route.scope, w.nodes]);

  // Ctrl/Cmd + wheel zooms about the pointer. Plain wheel keeps scrolling the page.
  useEffect(() => {
    const el = canvas.current;
    if (!el || mode !== 'map') return;
    const on = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * CANVAS.w;
      const cy = ((e.clientY - r.top) / r.height) * CANVAS.h;
      setView((v) => zoomAt(v, e.deltaY < 0 ? 1.12 : 1 / 1.12, cx, cy));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [mode]);

  const zoomBy = (f: number) => setView((v) => zoomAt(v, f, CANVAS.w / 2, CANVAS.h / 2));
  const select = (id: string, toTab: Tab = 'overview') => { go({ node: id }); setTab(toTab); };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.kv2-node, .kv2-canvas-tools')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / r.width) * CANVAS.w;
    const dy = ((e.clientY - d.y) / r.height) * CANVAS.h;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.2); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.2); return; }
    if (e.key === '0') { e.preventDefault(); setView(HOME_VIEW); return; }
    const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[e.key as 'ArrowLeft'];
    const cur = (document.activeElement as HTMLElement | null)?.dataset.node;
    if (!dir || !cur) return;
    e.preventDefault();
    const next = nextByDirection(cur, dir, w.nodes);
    if (next) nodeRefs.current[next]?.focus();
  };

  const pos = (n: WorldNode) => ({ left: `${((n.x * view.k + view.tx) / CANVAS.w) * 100}%`, top: `${((n.y * view.k + view.ty) / CANVAS.h) * 100}%` });
  const nodeById = (id: string) => w.nodes.find((n) => n.id === id)!;

  const counts = kindCounts(w);
  const srcStatuses = w.sources.map((s) => sourceStatus(s, w.now));
  const sc = sourceCounts(srcStatuses);
  const risks = w.nodes.filter((n) => isRiskNode(n, w)).length;
  const stale = srcStatuses.filter((s) => s.connectivity !== 'not_configured' && s.freshness === 'stale').length;
  const unavailable = srcStatuses.filter((s) => s.connectivity === 'unavailable').length;
  const notSet = srcStatuses.filter((s) => s.connectivity === 'not_configured').length;
  // Distinct Observed readings in the last 24 h (correlated links and shared observations are not counted twice).
  const changes = new Set(
    Object.values(w.evidenceById)
      .filter((e) => e.observation && resolveLabel(e) === 'observed' && minutesSince(e.observation.observedAt, w.now) <= 24 * 60)
      .map((e) => e.observation!.id),
  ).size;
  /** An edge whose every supporting read is stale is still classified, but flagged: the contract does not call it current. */
  const edgeStale = (e: WorldEdge): boolean =>
    e.truth !== 'unknown' && e.evidence.length > 0 && e.evidence.every((id) => { const r = w.evidenceById[id]; return r ? effectiveFreshness(r) !== 'current' : true; });
  const edgeRestricted = (e: WorldEdge): boolean => route.persona !== 'technical' && e.evidence.some((id) => w.evidenceById[id]?.visibility === 'technical');

  const failing = w.nodes.find((n) => n.check === 'failing');
  const ghEdge = w.edges.find((e) => e.id === 'd1');
  const ghMark = ghEdge ? curve(nodeById(ghEdge.a), nodeById(ghEdge.b), 0.1) : null;

  return (
    <div className="kv2-screen kv2-map">
      <div className="kv2-col-main">
        <header className="kv2-head">
          <div className="kv2-head-title">
            <p className="kv2-eyebrow"><T k="map.eyebrow" /></p>
            <h1><T k="nav.map" /><span className="kv2-chip kv2-chip-outline"><T k="map.concept" /></span></h1>
            <p className="kv2-lede"><T k="map.lede" /></p>
          </div>
          <div className="kv2-kpis">
            <Kpi icon="cube" value={counts.product} label={<T k="map.kpi.products" />} />
            <Kpi icon="layers" value={counts.project} label={<T k="map.kpi.projects" />} />
            <Kpi icon="alert" value={risks} label={<T k="map.kpi.risks" />} tone="warn" id="kpi-risks" />
            <Kpi icon="pulse" value={sc.issues} label={<T k="map.kpi.issues" />} id="kpi-issues" />
          </div>
        </header>

        <div className="kv2-toolbar">
          <Seg label={t('map.f.label')} value={filter} onChange={setFilter} options={MAP_FILTERS.map((f) => ({ value: f, label: t(FILTER_KEY[f]) }))} />
          <div className="kv2-toolbar-end">
            <label className="kv2-select">
              <span><T k="map.scope.label" /></span>
              <select value={route.scope} onChange={(e) => go({ scope: e.target.value, node: null })} aria-label={t('map.scope.label')}>
                <option value="all">{t('scope.all')}</option>
                {['retail-tower', 'khepri', 'seshat-bi'].map((id) => <option key={id} value={id}>{nodeById(id).title}</option>)}
              </select>
              <Icon name="chevron" size={14} />
            </label>
            <Seg label={t('map.view.label')} value={mode} onChange={setMode} options={[{ value: 'map', label: t('view.map'), icon: 'network' }, { value: 'list', label: t('view.list'), icon: 'list' }]} />
          </div>
        </div>

        <section className="kv2-panel kv2-canvas-panel" aria-label={t('map.canvas.label')}>
          {mode === 'map' ? (
            <div
              className="kv2-canvas"
              ref={canvas}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              data-testid="constellation"
            >
              <Cosmos />
              <svg className="kv2-canvas-svg" viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <defs>
                  <radialGradient id="kv2-hubglow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" className="kv2-stop-a" />
                    <stop offset="100%" className="kv2-stop-b" />
                  </radialGradient>
                </defs>
                <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
                  <circle cx="500" cy="335" r="190" fill="url(#kv2-hubglow)" />
                  {[[190, 112], [310, 182], [450, 268]].map(([rx, ry]) => (
                    <ellipse key={rx} cx="500" cy="335" rx={rx} ry={ry} className="kv2-orbit" />
                  ))}
                  {w.edges.map((e: WorldEdge, i) => {
                    const a = nodeById(e.a);
                    const b = nodeById(e.b);
                    const c = curve(a, b, e.cls === 'group' ? 0 : i % 2 ? 0.1 : -0.1);
                    const dim = !active.has(e.a) || !active.has(e.b);
                    return (
                      <g key={e.id} className="kv2-edge" data-cls={e.cls} data-truth={e.truth} data-stale={edgeStale(e) || undefined} data-dim={dim || undefined}>
                        <path d={c.d} />
                        {e.cls === 'dep' && <circle cx={c.mx} cy={c.my} r="4.5" />}
                      </g>
                    );
                  })}
                  {ghMark && (
                    <g className="kv2-alert-mark" transform={`translate(${ghMark.mx} ${ghMark.my})`}>
                      <path d="M0 -13 12 8H-12Z" />
                      <path d="M0 -5v6M0 4.5v.01" />
                    </g>
                  )}
                </g>
              </svg>

              {failing && (
                <div className="kv2-callout" style={pos(failing)}>
                  <Icon name="alert" size={18} />
                  <span><strong><T k="ns.checkFailing" /></strong><small><T k="map.callout.sub" /></small></span>
                </div>
              )}

              {w.nodes.map((n) => {
                const chip = nodeChip(n, w.sources);
                const dim = !active.has(n.id);
                const hub = n.id === 'retail-tower';
                return (
                  <button
                    key={n.id}
                    ref={(el) => { nodeRefs.current[n.id] = el; }}
                    type="button"
                    className="kv2-node"
                    style={pos(n)}
                    data-node={n.id}
                    data-kind={n.kind}
                    data-tone={chip.tone}
                    data-hub={hub || undefined}
                    data-selected={sel.id === n.id || undefined}
                    data-dim={dim || undefined}
                    aria-pressed={sel.id === n.id}
                    aria-label={plain(`${n.title}, ${t(`kind.${n.kind}` as K)}, ${chipText(chip.kind)}`)}
                    onClick={() => select(n.id)}
                    onDoubleClick={() => setView(focusView(n, 1.5))}
                  >
                    <span className="kv2-orb"><Icon name={NODE_ICON[n.id] ?? 'cube'} size={hub ? 46 : 22} /></span>
                    <span className="kv2-node-card">
                      <b><Lt>{n.title}</Lt></b>
                      <small><T k={ND(n.id)} /></small>
                      <ToneChip tone={chip.tone}><Tx s={chipText(chip.kind)} /></ToneChip>
                    </span>
                  </button>
                );
              })}

              <div className="kv2-canvas-tools" role="group" aria-label={t('map.zoom.in')}>
                <button type="button" onClick={() => zoomBy(1.2)} disabled={view.k >= ZOOM_MAX} aria-label={t('map.zoom.in')}><Icon name="plus" size={16} /></button>
                <button type="button" onClick={() => zoomBy(1 / 1.2)} disabled={view.k <= ZOOM_MIN} aria-label={t('map.zoom.out')}><Icon name="minus" size={16} /></button>
                <button type="button" onClick={() => setView(HOME_VIEW)} aria-label={t('map.zoom.reset')}><Icon name="expand" size={16} /></button>
              </div>
              <ul className="kv2-legend" aria-label={t('map.legend.title')}>
                <li data-truth="observed"><i />{copy.label.observed}</li>
                <li data-truth="correlated"><i />{copy.label.correlated}</li>
                <li data-truth="hypothesis"><i />{copy.label.hypothesis}</li>
                <li data-truth="unknown"><i />{copy.label.unknown}</li>
              </ul>
            </div>
          ) : (
            <div className="kv2-list-view">
              <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('map.cap.nodes')}>
                <table className="kv2-table">
                  <caption className="kv2-sr"><T k="map.cap.nodes" /></caption>
                  <thead><tr><th scope="col"><T k="map.th.name" /></th><th scope="col"><T k="map.th.kind" /></th><th scope="col"><T k="map.th.status" /></th><th scope="col"><T k="map.th.evidence" /></th></tr></thead>
                  <tbody>
                    {w.nodes.filter((n) => active.has(n.id)).map((n) => {
                      const chip = nodeChip(n, w.sources);
                      return (
                        <tr key={n.id} data-selected={sel.id === n.id || undefined}>
                          <th scope="row"><button type="button" aria-pressed={sel.id === n.id} onClick={() => select(n.id)}><Lt>{n.title}</Lt></button></th>
                          <td><T k={`kind.${n.kind}` as K} /></td>
                          <td><ToneChip tone={chip.tone}><Tx s={chipText(chip.kind)} /></ToneChip></td>
                          <td>{n.evidence.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="kv2-table-wrap" tabIndex={0} role="region" aria-label={t('map.cap.links')}>
                <table className="kv2-table">
                  <caption className="kv2-sr"><T k="map.cap.links" /></caption>
                  <thead><tr><th scope="col"><T k="map.th.from" /></th><th scope="col"><T k="map.th.to" /></th><th scope="col"><T k="map.th.how" /></th><th scope="col"><T k="map.th.basis" /></th></tr></thead>
                  <tbody>
                    {w.edges.filter((e) => active.has(e.a) && active.has(e.b)).map((e) => (
                      <tr key={e.id}>
                        <td><Lt>{nodeById(e.a).title}</Lt></td>
                        <td><Lt>{nodeById(e.b).title}</Lt></td>
                        <td>{e.cls === 'group' ? <ToneChip tone="unk"><T k="map.part" /></ToneChip> : <TruthChip label={e.truth} />}</td>
                        <td>
                          {edgeRestricted(e) ? <T k="edge.restricted" /> : <T k={e.basisKey as K} />}
                          {edgeStale(e) && <> <ToneChip tone="warn">{t('chip.stale')}</ToneChip></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {mode === 'map' && <p className="kv2-canvas-hint"><T k="map.hint" /></p>}
        </section>

        <div className="kv2-metrics">
          <Kpi icon="pulse" value={<T k="map.m.sources.of" v={{ n: sc.current.n, of: sc.current.of }} />} label={<T k="map.m.sources" />} sub={<T k="map.m.sources.sub" v={{ s: stale, u: unavailable, c: notSet }} />} id="m-sources" />
          <Kpi icon="radar" value={1} label={<T k="map.m.inv" />} sub={<T k="map.m.inv.sub" />} id="m-inv" />
          <Kpi icon="doc" value={w.missions.filter((m) => m.human === 'needs_review').length} label={<T k="map.m.dec" />} sub={<T k="map.m.dec.sub" />} id="m-dec" />
          <Kpi icon="clock" value={changes} label={<T k="map.m.chg" />} sub={<T k="map.m.chg.sub" v={{ n: new Set(Object.values(w.evidenceById).flatMap((e) => (e.observation ? [e.observation.source.provider] : []))).size }} />} id="m-chg" />
        </div>
      </div>

      <aside className="kv2-panel kv2-inspector" aria-label={t('map.tab.label')} data-testid="inspector">
        <TabBar
          label={t('map.tab.label')}
          idPrefix="mapinsp"
          value={tab}
          onChange={setTab}
          options={[{ value: 'overview', label: t('map.tab.overview') }, { value: 'evidence', label: t('tab.evidence') }, { value: 'sources', label: t('tab.sources') }]}
        />
        <div role="tabpanel" id="mapinsp-panel" aria-labelledby={`mapinsp-tab-${tab}`} className="kv2-insp-body">
          <Inspector node={sel} tab={tab} setTab={setTab} isScope={route.scope === sel.id} onCenter={() => setView(focusView(sel, 1.4))} onOpen={open} />
        </div>
      </aside>

      <div className="kv2-bottom">
        <Panel id="feed" title={t('map.feed')} sub={t('map.feed.sub')} icon="doc">
          <ul className="kv2-ev-list">
            {Object.values(w.evidenceById)
              .filter((e) => e.observation)
              .sort((a, b) => Date.parse(b.observation!.observedAt) - Date.parse(a.observation!.observedAt))
              .slice(0, 3)
              .map((e) => (
                <li key={e.id}>
                  <EvidenceItem
                    evidence={e}
                    onSelect={() => select((w.nodes.find((n) => n.evidence.includes(e.id)) ?? sel).id, 'evidence')}
                  />
                </li>
              ))}
          </ul>
        </Panel>
        <Panel id="srcstat" title={t('map.srcs')} sub={t('map.srcs.sub')} icon="db">
          <ul className="kv2-srcrows">
            {srcStatuses.map((s) => (
              <li key={s.provider} data-conn={s.connectivity} data-fresh={s.freshness}>
                <Provider_ p={s.provider} />
                <span className="kv2-srcwords">{copy.connectivity[s.connectivity]}, {copy.freshness[s.freshness]}</span>
                <span className="kv2-bar" role="img" aria-label={t('obs.read.age', { a: s.ageMinutes ?? t('not.read'), m: s.ttlMinutes })} data-over={s.used > 1 || undefined}><span style={{ inlineSize: `${Math.min(1, s.used) * 100}%` }} /></span>
                <span className="kv2-srcage"><Age minutes={s.ageMinutes} /></span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel id="hood" title={t('map.hood')} sub={t('map.hood.sub')} icon="network">
          <Neighbourhood node={sel} />
        </Panel>
      </div>
    </div>
  );
}

function Neighbourhood({ node }: { readonly node: WorldNode }) {
  const { t, route } = useV2();
  const w = authorizedWorld(WORLD, route.persona);
  const deps = w.edges.filter((e) => e.cls === 'dep');
  const out = deps.filter((e) => e.a === node.id);
  const inn = deps.filter((e) => e.b === node.id);
  const unk = (list: readonly WorldEdge[]) => list.filter((e) => e.truth === 'unknown').length;
  return (
    <div className="kv2-hood">
      <div><strong>{out.length}</strong><span><T k="map.up" /></span>{unk(out) > 0 && <small><T k="map.hood.unknown" v={{ n: unk(out) }} /></small>}</div>
      <Icon name="chevron" size={18} className="kv2-hood-arrow" />
      <div className="kv2-hood-this"><strong><Lt>{node.title}</Lt></strong><span><T k="map.this" /></span></div>
      <Icon name="chevron" size={18} className="kv2-hood-arrow" />
      <div><strong>{inn.length}</strong><span><T k="map.down" /></span>{unk(inn) > 0 && <small>{t('map.hood.unknown', { n: unk(inn) })}</small>}</div>
    </div>
  );
}

interface InspProps {
  readonly node: WorldNode;
  readonly tab: Tab;
  readonly setTab: (t: Tab) => void;
  readonly isScope: boolean;
  readonly onCenter: () => void;
  readonly onOpen: ReturnType<typeof useV2>['open'];
}

function Inspector({ node, tab, setTab, isScope, onCenter, onOpen }: InspProps) {
  const { copy, t, route } = useV2();
  const w = authorizedWorld(WORLD, route.persona);
  const chip = nodeChip(node, w.sources);
  const chipText = useChipText();
  const refs = evidenceOf(w, node.evidence);
  const nb = neighbours(node.id, w.edges).map((id) => w.nodes.find((n) => n.id === id)!);
  const lc = linkCounts(node.id, w);
  const total = lc.observed + lc.correlated + lc.hypothesis + lc.unknown;
  const providers = [...new Set([...(node.provider ? [node.provider] : []), ...refs.flatMap((r) => (r.observation ? [r.observation.source.provider] : []))])];
  const hasReplay = node.evidence.some((id) => ['E-1', 'E-2', 'E-3'].includes(id));

  if (tab === 'evidence') {
    return (
      <>
        <InspHead node={node} chipKind={chip.kind} tone={chip.tone} chipText={chipText} isScope={isScope} />
        {refs.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : (
          <ul className="kv2-ev-list">{refs.map((r) => <li key={r.id}><EvidenceItem evidence={r} /></li>)}</ul>
        )}
      </>
    );
  }
  if (tab === 'sources') {
    return (
      <>
        <InspHead node={node} chipKind={chip.kind} tone={chip.tone} chipText={chipText} isScope={isScope} />
        {providers.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : (
          <ul className="kv2-srcrows kv2-srcrows-insp">
            {providers.map((p) => {
              const m = w.sources.find((s) => s.provider === p)!;
              const s = sourceStatus(m, w.now);
              return (
                <li key={p} data-conn={s.connectivity} data-fresh={s.freshness}>
                  <button type="button" className="kv2-linkbtn" onClick={() => onOpen('source-observatory', { src: p })}><Provider_ p={p} /></button>
                  <span className="kv2-srcwords">{copy.connectivity[s.connectivity]}, {copy.freshness[s.freshness]}</span>
                  <span className="kv2-srcage"><Age minutes={s.ageMinutes} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }
  return (
    <>
      <InspHead node={node} chipKind={chip.kind} tone={chip.tone} chipText={chipText} isScope={isScope} />
      <p className="kv2-insp-desc"><T k={NL(node)} /></p>
      <dl className="kv2-stats">
        <div><dt><T k="map.stat.projects" /></dt><dd>{nb.filter((n) => n.kind === 'project').length}</dd></div>
        <div><dt><T k="map.stat.services" /></dt><dd>{nb.filter((n) => n.kind === 'service').length}</dd></div>
        <div><dt><T k="map.stat.linked" /></dt><dd>{nb.length}</dd></div>
      </dl>
      <section className="kv2-insp-sec" aria-labelledby="sig-h">
        <h3 id="sig-h"><Icon name="pulse" size={16} /><T k="map.signals" /><small><T k="map.signals.sub" /></small></h3>
        {refs.length === 0 ? <p className="kv2-empty"><T k="map.signals.none" /></p> : (
          <ul className="kv2-ev-list">
            {refs.slice(0, 3).map((r) => <li key={r.id}><EvidenceItem evidence={r} compact onSelect={() => setTab('evidence')} /></li>)}
          </ul>
        )}
      </section>
      <section className="kv2-insp-sec" aria-labelledby="lnk-h">
        <h3 id="lnk-h"><Icon name="network" size={16} /><T k="map.links" /></h3>
        {total === 0 ? <p className="kv2-empty"><T k="map.links.none" /></p> : (
          <ul className="kv2-linkbars">
            {(['observed', 'correlated', 'hypothesis', 'unknown'] as const).map((k) => (
              <li key={k} data-truth={k}>
                <span><TruthChip label={k} /></span>
                <span className="kv2-bar" role="img" aria-label={t('map.m.sources.of', { n: lc[k], of: total })}><span style={{ inlineSize: `${(lc[k] / total) * 100}%` }} /></span>
                <b>{lc[k]}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="kv2-insp-actions">
        {hasReplay && <button type="button" className="kv2-btn" onClick={() => onOpen('mission-replay')}><Icon name="play" size={15} /><T k="map.open.replay" /></button>}
        {node.provider && <button type="button" className="kv2-btn" onClick={() => onOpen('source-observatory', { src: node.provider })}><Icon name="db" size={15} /><T k="map.open.source" /></button>}
        <button type="button" className="kv2-btn kv2-btn-quiet" onClick={onCenter}><Icon name="target" size={15} /><T k="map.center" /></button>
      </div>
    </>
  );
}

function InspHead({ node, chipKind, tone, chipText, isScope }: { readonly node: WorldNode; readonly chipKind: NodeChipKind; readonly tone: 'ok' | 'warn' | 'bad' | 'unk'; readonly chipText: (k: NodeChipKind) => string; readonly isScope: boolean }) {
  return (
    <header className="kv2-insp-head">
      <span className="kv2-orb" data-tone={tone}><Icon name={NODE_ICON[node.id] ?? 'cube'} size={26} /></span>
      <div>
        <h2 aria-live="polite"><Lt>{node.title}</Lt></h2>
        <p><T k={`kind.${node.kind}` as K} /> <span aria-hidden="true">/</span> <T k={ND(node.id)} /></p>
        <ToneChip tone={tone}><Tx s={chipText(chipKind)} /></ToneChip>
      </div>
      {isScope && <span className="kv2-chip kv2-chip-focus"><T k="map.focus" /></span>}
    </header>
  );
}

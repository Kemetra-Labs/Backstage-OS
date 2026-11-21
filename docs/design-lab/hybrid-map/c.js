/* Concept C, Analytical Mission Control. Layout only: all data comes from shared/data.js.
 * Operational clarity first: layered topology (bands = kind), a systems ledger, and a source-readings matrix whose three column
 * headings are the three counters. Cinematic cues stay quiet: ground glow, selected-row bloom, one horizon band. */
(function () {
  'use strict';
  const { t, LANG } = KD;
  const U = KUI;
  const q = new URLSearchParams(location.search);
  const W = 857, H = 240;
  const BAND_Y = { product: 40, project: 120, service: 200 };
  /* Presentational placement inside each band (a layered layout). Not a measurement. */
  const POS = {
    khepri: { x: 150, y: BAND_Y.product }, 'retail-tower': { x: 480, y: BAND_Y.product },
    pos: { x: 290, y: BAND_Y.project }, 'stock-sync': { x: 480, y: BAND_Y.project }, inventory: { x: 700, y: BAND_Y.project },
    'seshat-bi': { x: 112, y: BAND_Y.service }, port: { x: 275, y: BAND_Y.service }, github: { x: 420, y: BAND_Y.service }, jira: { x: 590, y: BAND_Y.service }, sentry: { x: 780, y: BAND_Y.service },
  };
  const BEND = { d1: 0.05, d2: 0.05, d3: 0.2, d4: 0.08, d5: -0.2, d6: -0.2, d7: -0.12, d8: -0.08 };
  const state = { sel: q.get('node') || 'stock-sync', tab: q.get('tab') || 'overview', view: q.get('view') === 'list' || (!q.get('view') && matchMedia('(max-width: 640px)').matches) ? 'list' : 'map', filter: 'all' };

  function topology(s) {
    const active = U.filterIds(s.filter);
    const edges = KD.EDGES.map((e) => {
      const inc = e.a === s.sel || e.b === s.sel;
      return U.edgeG(e, POS[e.a], POS[e.b], e.cls === 'group' ? 0 : BEND[e.id] || 0.1, { dim: !active.has(e.a) || !active.has(e.b), hl: inc, noGlow: !inc });
    }).join('');
    const bands = ['product', 'project', 'service'].map((k) => `<rect class="c-band" x="0" y="${BAND_Y[k] - 37}" width="${W}" height="74" rx="10"/>`).join('');
    const nodes = KD.NODES.map((n) => {
      const sel = s.sel === n.id;
      const aria = `${n.title}, ${t('kind.' + n.kind)}, ${KD.chipText(n.chip.kind)}`;
      return `<button type="button" class="kh-node c-node" data-node="${n.id}" data-tone="${n.chip.tone}"${sel ? ' data-selected' : ''}${active.has(n.id) ? '' : ' data-dim'} data-fk="n-${n.id}" aria-pressed="${sel}" aria-label="${U.esc(aria)}" style="left:${(POS[n.id].x / W) * 100}%;top:${(POS[n.id].y / H) * 100}%;--orb:36px"><span class="kh-orbw">${U.ring(n)}<span class="kh-orb">${U.icon(U.NODE_ICON[n.id], 17)}</span></span><span class="c-txt"><b>${U.tt(n.title)}</b>${U.nodeChip(n)}</span></button>`;
    }).join('');
    const labels = ['product', 'project', 'service'].map((k) => `<span class="c-bandlabel" style="top:${((BAND_Y[k] - 35) / H) * 100}%">${U.esc(t('kind.' + k + 's'))}</span>`).join('');
    return `<div class="kh-canvas c-canvas" role="group" aria-label="${U.esc(t('map.canvas.label'))}"><div class="kh-cosmos"><div class="c-horizon kh-horizon"></div></div>
      <svg class="c-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${bands}${edges}</svg>${labels}${nodes}</div>`;
  }

  function timeline() {
    return `<ol class="c-tl">${KD.EVENTS.map((e) => `<li data-tone="${e.tone}"><i></i><time>${U.esc(KD.fmtAt(e.at))}</time><b>${U.provName(e.provider)}</b><span>${U.esc(t(e.key))}</span></li>`).join('')}</ol>`;
  }

  function render(s) {
    const F = KD.FIG;
    const active = U.filterIds(s.filter);
    const topo = s.view === 'map' ? topology(s) : `<div class="c-tables">${U.tables(s.sel, active)}</div>`;
    const main = `<div class="c-wrap"><div class="c-main">
      <header class="c-head"><div class="c-title"><p class="kh-eyebrow">${U.esc(t('map.eyebrow'))}</p><h1 class="kh-h1">${U.esc(t('nav.map'))}<span class="kh-concept">${LANG === 'ar' ? 'تصور C' : 'Concept C'}</span></h1></div><p class="kh-lede">${U.esc(t('map.lede'))}</p>
        <div class="c-kpis">${U.kpi('cube', F.products, t('map.kpi.products'))}${U.kpi('layers', F.projects, t('map.kpi.projects'))}${U.kpi('alert', F.risks, t('map.kpi.risks'), 'warn')}${U.kpi('pulse', F.sourceIssues, t('map.kpi.issues'))}</div></header>
      <div class="c-tool">${U.filterSeg(s.filter)}<div class="c-end"><span class="kh-select">${U.esc(t('map.scope.label'))} <b>${U.tt('Retail Tower OS')}</b>${U.icon('chevron', 14)}</span>${U.viewSeg(s.view)}</div></div>
      <section class="kh-panel c-topo">${U.panelHead('network', t('n.topology'))}${topo}<div class="c-legend">${U.legend()}</div></section>
      <div class="c-two">
        <section class="kh-panel">${U.panelHead('list', t('n.ledger'))}${U.ledger(s.sel, active)}</section>
        <section class="kh-panel">${U.panelHead('db', t('n.matrix'))}${U.matrix()}</section>
      </div>
      <section class="kh-panel c-sig">${U.panelHead('clock', t('obs.tl'), t('obs.tl.sub'))}${timeline()}</section>
      </div>
      <aside class="kh-panel c-insp" aria-label="${U.esc(t('tab.label'))}" data-testid="inspector">${U.inspector(s.sel, s.tab, { focus: s.sel === 'retail-tower' })}</aside></div>`;
    return U.shell({ main });
  }
  function bind(app, s, rerender, set) { U.bindCommon(app, s, set); U.bindArrows(app, POS); }
  U.mount(state, render, bind);
})();

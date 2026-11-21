/* Concept B, Immersive Mission Control. Layout only: all data comes from shared/data.js.
 * Orbit = kind of system (products inner, projects middle, services outer): structure, never importance. */
(function () {
  'use strict';
  const { t, LANG } = KD;
  const U = KUI;
  const q = new URLSearchParams(location.search);
  const W = 1000, H = 860, C = { x: 500, y: 500 };
  const RING = { product: [200, 95], project: [300, 285], service: [420, 400] };
  const on = (kind, deg) => ({ x: +(C.x + RING[kind][0] * Math.cos((deg * Math.PI) / 180)).toFixed(1), y: +(C.y - RING[kind][1] * Math.sin((deg * Math.PI) / 180)).toFixed(1) });
  /* Angles are presentational placement on each orbit. */
  const POS = {
    'retail-tower': C, khepri: on('product', 160), pos: on('project', 146), 'stock-sync': on('project', 95), inventory: on('project', 38),
    port: on('service', 172), 'seshat-bi': on('service', 198), github: on('service', 60), sentry: on('service', 22), jira: on('service', 350),
  };
  const BEND = { d1: 0.08, d2: -0.1, d3: 0.1, d4: -0.12, d5: 0.12, d6: -0.12, d7: 0.1, d8: 0.1 };
  const ORB = { product: 58, project: 58, service: 52 };
  const state = { sel: q.get('node') || 'stock-sync', tab: q.get('tab') || 'overview', view: q.get('view') === 'list' || (!q.get('view') && matchMedia('(max-width: 640px)').matches) ? 'list' : 'map', filter: 'all' };

  function canvas(s) {
    const active = U.filterIds(s.filter);
    const edges = KD.EDGES.map((e) => {
      const inc = e.a === s.sel || e.b === s.sel;
      return U.edgeG(e, POS[e.a], POS[e.b], e.cls === 'group' ? 0 : BEND[e.id] || 0.1, { dim: !active.has(e.a) || !active.has(e.b) || !inc, hl: inc });
    }).join('');
    // One-shot trace that sweeps outward from the selected node along its own links. Reduced motion: hidden, the static highlight stays.
    const traces = KD.EDGES.filter((e) => e.a === s.sel || e.b === s.sel).map((e) => {
      const c = U.curve(POS[e.a], POS[e.b], e.cls === 'group' ? 0 : BEND[e.id] || 0.1);
      return `<path class="b-trace" pathLength="1" d="${c.d}"${e.b === s.sel ? ' data-rev' : ''}/>`;
    }).join('');
    const nodes = KD.NODES.map((n) => {
      const hub = n.id === 'retail-tower';
      const card = hub || s.sel === n.id ? 'full' : n.kind === 'service' ? 'read' : 'min';
      return U.nodeBtn(n, { x: POS[n.id].x / 10, y: (POS[n.id].y / H) * 100, orb: hub ? 124 : ORB[n.kind], hub, card, sel: s.sel === n.id, dim: !active.has(n.id) });
    }).join('');
    const rings = ['product', 'project', 'service'].map((k, i) => `<ellipse class="b-orbit b-orbit-${i + 1}" cx="${C.x}" cy="${C.y}" rx="${RING[k][0]}" ry="${RING[k][1]}"/>`).join('');
    return `<div class="kh-canvas b-canvas" role="group" aria-label="${U.esc(t('map.canvas.label'))}">
      <svg class="b-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs><radialGradient id="b-hub" cx="50%" cy="50%" r="50%"><stop offset="0%" class="b-stop-a"/><stop offset="100%" class="b-stop-b"/></radialGradient></defs>
        <circle cx="${C.x}" cy="${C.y}" r="260" fill="url(#b-hub)"/>${rings}${edges}${traces}</svg>${nodes}</div>`;
  }

  function timeline() {
    return `<section class="b-tl" aria-label="${U.esc(t('obs.tl'))}"><h2>${U.icon('clock', 15)}${U.esc(t('obs.tl'))}<small>${U.esc(t('obs.tl.sub'))}</small></h2><ol>${KD.EVENTS.map((e) => `<li data-tone="${e.tone}"><i></i><time>${U.esc(KD.fmtAt(e.at))}</time><b>${U.provName(e.provider)}</b><span>${U.esc(t(e.key))}</span></li>`).join('')}</ol></section>`;
  }
  function orbitKey() {
    const F = KD.FIG;
    const items = [['n.layer.1', LANG === 'ar' ? 'المدار الداخلي' : 'Inner orbit', t('kind.products'), F.products], ['n.layer.2', LANG === 'ar' ? 'الأوسط' : 'Middle', t('kind.projects'), F.projects], ['n.layer.3', LANG === 'ar' ? 'الخارجي' : 'Outer', t('kind.services'), F.services]];
    return `<li class="b-orbkey">${items.map(([, o, k, n]) => `<span>${U.esc(o)}: <b>${U.esc(k)} ${n}</b></span>`).join('')}</li>`;
  }

  function render(s) {
    const F = KD.FIG;
    const active = U.filterIds(s.filter);
    const map = s.view === 'map' ? canvas(s) : `<div class="b-list"><section class="kh-panel">${U.panelHead('list', t('n.ledger'), t('n.ledger.sub'))}${U.ledger(s.sel, active)}</section><section class="kh-panel">${U.panelHead('db', t('n.matrix'), t('n.matrix.sub'))}${U.matrix()}</section><section class="kh-panel">${U.panelHead('network', t('n.cap.links'))}${U.linksTable(active)}</section>${timeline()}</div>`;
    const stage = `<div class="b-stage">
      <div class="b-map"><div class="kh-cosmos"><div class="kh-stars"></div><div class="kh-horizon"></div></div>${map}
        <div class="b-title"><p class="kh-eyebrow">${U.esc(t('map.eyebrow'))}</p><h1 class="kh-h1">${U.esc(t('nav.map'))}<span class="kh-concept">${LANG === 'ar' ? 'تصور B' : 'Concept B'}</span></h1>
          <div class="b-row"><span class="kh-select">${U.esc(t('map.scope.label'))} <b>${U.tt('Retail Tower OS')}</b>${U.icon('chevron', 14)}</span></div>
          <div class="b-row b-pills">${U.kpi('alert', F.risks, t('map.kpi.risks'), 'warn')}${U.kpi('pulse', F.sourceIssues, t('map.kpi.issues'))}</div></div>
        <div class="b-top">${U.filterSeg(s.filter)}${U.viewSeg(s.view)}</div>
        <div class="b-key kh-glass">${U.legend()}<span class="b-orb">${U.esc(t('n.layer.sub'))}: ${orbitKey().replace(/<\/?li[^>]*>/g, '')}</span></div>
        ${s.view === 'map' ? timeline() : ''}</div>
      <aside class="b-insp kh-glass" aria-label="${U.esc(t('tab.label'))}" data-testid="inspector">${U.inspector(s.sel, s.tab, { focus: s.sel === 'retail-tower', signals: 2 })}<section class="b-read" aria-label="${U.esc(t('n.panel.tri'))}"><h2>${U.icon('target', 15)}${U.esc(t('obs.readings'))}<small>${U.esc(t('obs.readings.sub'))}</small></h2>${U.readings('rail')}</section></aside></div>`;
    return U.shell({ rail: true, cls: 'b-app', main: stage });
  }
  function bind(app, s, rerender, set) { U.bindCommon(app, s, set); U.bindArrows(app, POS); }
  U.mount(state, render, bind);
})();

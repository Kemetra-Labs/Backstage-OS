/* Concept A, Balanced Mission Control. Layout only: all data comes from shared/data.js. */
(function () {
  'use strict';
  const { t, LANG } = KD;
  const U = KUI;
  const q = new URLSearchParams(location.search);
  const W = 1000, H = 470;
  /* Presentational placement of each orb centre on a 1000 x 500 canvas. Not a measurement. */
  const POS = {
    'retail-tower': { x: 500, y: 300 }, khepri: { x: 135, y: 78 }, port: { x: 72, y: 230 }, 'seshat-bi': { x: 205, y: 358 },
    pos: { x: 292, y: 218 }, 'stock-sync': { x: 470, y: 84 }, inventory: { x: 690, y: 212 }, github: { x: 842, y: 64 },
    sentry: { x: 920, y: 188 }, jira: { x: 852, y: 322 },
  };
  const BEND = { d1: 0.08, d2: -0.1, d3: 0.1, d4: -0.12, d5: 0.12, d6: -0.12, d7: 0.1, d8: 0.1 };
  const state = { sel: q.get('node') || 'retail-tower', tab: q.get('tab') || 'overview', view: q.get('view') === 'list' || (!q.get('view') && matchMedia('(max-width: 640px)').matches) ? 'list' : 'map', filter: 'all' };

  function canvas(s) {
    const active = U.filterIds(s.filter);
    const hubP = POS['retail-tower'];
    const edges = KD.EDGES.map((e) => {
      const dim = !active.has(e.a) || !active.has(e.b);
      const hl = e.a === s.sel || e.b === s.sel;
      return U.edgeG(e, POS[e.a], POS[e.b], e.cls === 'group' ? 0 : BEND[e.id] || 0.1, { dim, hl });
    }).join('');
    const nodes = KD.NODES.map((n) => U.nodeBtn(n, { x: POS[n.id].x / 10, y: (POS[n.id].y / H) * 100, orb: n.id === 'retail-tower' ? 104 : 50, hub: n.id === 'retail-tower', sel: s.sel === n.id, dim: !active.has(n.id) })).join('');
    return `<div class="kh-canvas a-canvas" role="group" aria-label="${U.esc(t('map.canvas.label'))}"><div class="kh-cosmos"><div class="kh-stars"></div><div class="kh-horizon"></div></div>
      <svg class="a-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs><radialGradient id="a-hub" cx="50%" cy="50%" r="50%"><stop offset="0%" class="a-stop-a"/><stop offset="100%" class="a-stop-b"/></radialGradient></defs>
        <circle cx="${hubP.x}" cy="${hubP.y}" r="190" fill="url(#a-hub)"/>
        ${[[190, 98], [315, 164], [450, 246]].map(([rx, ry]) => `<ellipse class="a-orbit" cx="${hubP.x}" cy="${hubP.y}" rx="${rx}" ry="${ry}"/>`).join('')}
        ${edges}</svg>${nodes}</div>`;
  }

  function sourceStatus() {
    const nums = (s) => { const lab = s.age === null ? t('n.never') : t('obs.read.age', { a: s.age, m: s.ttlMin }); const over = s.used >= 1.5 ? ' · ' + t('n.over', { x: Math.round(s.used) }) : ''; return `<div class="kh-nums"><b>${U.esc(lab)}</b><span>${U.esc(t('c.' + s.conn) + over)}</span></div>`; };
    return `<ul class="a-src">${KD.SOURCES.map((s) => `<li data-conn="${s.conn}"><span class="kh-prov">${U.provName(s.id)}</span><span class="a-bar">${U.ageBar(s, { nums: false })}${nums(s)}</span></li>`).join('')}</ul>`;
  }
  function feed() {
    const ids = KD.EVIDENCE.filter((e) => e.src && e.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 3);
    return `<ul class="a-feed">${ids.map((e) => `<li><div>${U.truth(e.label)}<span>${U.provName(e.src)} · ${U.esc(KD.fmtMin(e.age))} ${U.esc(t('n.ago'))}</span></div><p>${U.esc(t('ev.' + e.id))}</p></li>`).join('')}</ul>`;
  }
  function timeline() {
    return `<ol class="a-tl">${KD.EVENTS.map((e) => `<li data-tone="${e.tone}" title="${U.esc(t(e.key))}"><i></i><time>${U.esc(KD.fmtAt(e.at))}</time><span><b>${U.provName(e.provider)}</b>&nbsp; ${U.esc(t(e.key))}</span></li>`).join('')}</ol>`;
  }

  function render(s) {
    const F = KD.FIG;
    const active = U.filterIds(s.filter);
    const body = s.view === 'map' ? canvas(s) : `<div class="a-list">${U.tables(s.sel, active)}</div>`;
    const main = `<div class="a-wrap"><div class="a-main">
      <header class="a-head"><div class="a-title"><p class="kh-eyebrow">${U.esc(t('map.eyebrow'))}</p><h1 class="kh-h1">${U.esc(t('nav.map'))}<span class="kh-concept">${LANG === 'ar' ? 'تصور A' : 'Concept A'}</span></h1></div><p class="kh-lede">${U.esc(t('map.lede'))}</p>
        <div class="a-kpis">${U.kpi('cube', F.products, t('map.kpi.products'))}${U.kpi('layers', F.projects, t('map.kpi.projects'))}${U.kpi('alert', F.risks, t('map.kpi.risks'), 'warn')}${U.kpi('pulse', F.sourceIssues, t('map.kpi.issues'))}</div></header>
      <div class="a-tool">${U.filterSeg(s.filter)}<div class="a-end"><span class="kh-select">${U.esc(t('map.scope.label'))} <b>${U.tt('Retail Tower OS')}</b>${U.icon('chevron', 14)}</span>${U.viewSeg(s.view)}</div></div>
      <section class="kh-panel a-canvas-panel" aria-label="${U.esc(t('map.canvas.label'))}">${body}<div class="a-legendrow">${U.legend()}</div></section>
      <section class="kh-panel a-read" aria-label="${U.esc(t('n.panel.tri'))}"><div class="a-read-cap"><b>${U.esc(t('obs.readings'))}</b><span>${U.esc(t('obs.readings.sub'))}. ${U.esc(t('n.pips'))}.</span></div>${U.readings('strip')}</section>
      <div class="a-bottom">
        <section class="kh-panel">${U.panelHead('doc', t('map.feed'))}${feed()}</section>
        <section class="kh-panel">${U.panelHead('db', t('map.srcs'))}${sourceStatus()}</section>
        <section class="kh-panel">${U.panelHead('clock', t('obs.tl'))}${timeline()}</section>
      </div></div>
      <aside class="kh-panel a-insp" aria-label="${U.esc(t('tab.label'))}" data-testid="inspector">${U.inspector(s.sel, s.tab, { focus: s.sel === 'retail-tower' })}</aside></div>`;
    return U.shell({ main });
  }
  function bind(app, s, rerender, set) {
    U.bindCommon(app, s, set);
    U.bindArrows(app, POS);
  }
  U.mount(state, render, bind);
})();

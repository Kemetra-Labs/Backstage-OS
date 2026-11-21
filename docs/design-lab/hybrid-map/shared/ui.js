/* Hybrid Mission Map pilot: shared view helpers (shell, inspector, source readings, table alternative, map atoms).
 * Pure string builders plus a tiny state/render loop. Design exploration only. Depends on data.js (window.KD). */
(function () {
  'use strict';
  const { t, LANG } = KD;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (d) => `<path d="${d}"/>`;
  const ICONS = {
    layers: P('M12 3 3 8l9 5 9-5-9-5Z') + P('M3 12.5l9 5 9-5') + P('M3 17l9 5 9-5'),
    cube: P('M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z') + P('M4 7.5 12 12l8-4.5') + P('M12 12v9'),
    code: P('m9 8-4 4 4 4') + P('m15 8 4 4-4 4') + P('m13.5 6-3 12'),
    board: P('M4 4h7v16H4z') + P('M13 4h7v9h-7z'),
    chart: P('M5 20V11') + P('M12 20V4') + P('M19 20v-6'),
    search: '<circle cx="11" cy="11" r="6.5"/>' + P('m16 16 4.5 4.5'),
    network: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="18" r="2.2"/>' + P('m7.8 7.2 8.2.2') + P('m7 8 4 8') + P('m17 9-4 7.5'),
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/>' + P('M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6') + P('M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6'),
    link: P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1') + P('M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1'),
    pulse: P('M3 12h4l2.5-6 4 12 2.5-6H21'),
    clock: '<circle cx="12" cy="12" r="8.5"/>' + P('M12 7.5V12l3 2'),
    grid: P('M4 4h7v7H4z') + P('M13 4h7v7h-7z') + P('M4 13h7v7H4z') + P('M13 13h7v7h-7z'),
    list: P('M8 6h12') + P('M8 12h12') + P('M8 18h12') + P('M4 6h.01') + P('M4 12h.01') + P('M4 18h.01'),
    bulb: P('M9 18h6') + P('M10 21h4') + P('M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z'),
    bolt: P('M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z'),
    check: P('m5 12.5 4.5 4.5L19 7.5'),
    alert: P('M12 4 2.8 19.5h18.4L12 4Z') + P('M12 10v4.5') + P('M12 17.3h.01'),
    x: '<circle cx="12" cy="12" r="8.5"/>' + P('m9 9 6 6') + P('m15 9-6 6'),
    plus: P('M12 5v14') + P('M5 12h14'),
    minus: P('M5 12h14'),
    expand: P('M4 9V4h5') + P('M20 9V4h-5') + P('M4 15v5h5') + P('M20 15v5h-5'),
    play: P('M8 5.5v13l11-6.5-11-6.5Z'),
    chevron: P('m6 9 6 6 6-6'),
    agent: '<rect x="5" y="7" width="14" height="11" rx="3"/>' + P('M12 7V4') + P('M9.5 12h.01') + P('M14.5 12h.01') + P('M9.5 15.5h5'),
    doc: P('M7 3h7l4 4v14H7z') + P('M14 3v4h4') + P('M10 12h5') + P('M10 16h5'),
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>' + P('M12 12h.01'),
    flag: P('M6 21V4') + P('M6 5h11l-2 4 2 4H6'),
    radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>' + P('M12 12 18 6'),
    book: P('M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Z') + P('M5 16a4 4 0 0 1 4-4h9'),
    question: '<circle cx="12" cy="12" r="8.5"/>' + P('M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.8') + P('M12 16.6h.01'),
    home: P('m4 11 8-7 8 7') + P('M6 10v10h12V10'),
  };
  const icon = (n, s = 18) => `<svg class="kh-icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>`;
  const NODE_ICON = { 'retail-tower': 'layers', khepri: 'cube', 'stock-sync': 'bolt', pos: 'grid', inventory: 'db', github: 'code', jira: 'board', sentry: 'radar', port: 'book', 'seshat-bi': 'chart' };
  const PROV_ICON = { github: 'code', jira: 'board', sentry: 'radar', port: 'book', datadog: 'pulse', confluence: 'doc' };
  const PROV_INIT = { github: 'G', jira: 'J', sentry: 'S', datadog: 'D', confluence: 'C', port: 'P' };
  const isoLtr = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;
  const provName = (id) => isoLtr(t('prov.' + id));
  const tt = (title) => (LANG === 'ar' ? isoLtr(title) : esc(title)); // titles are Latin product names: isolate them in Arabic

  /* ---------- chips ---------- */
  const TONE_ICON = { ok: 'check', warn: 'alert', bad: 'x', unk: 'question' };
  const chip = (tone, text) => `<span class="kh-chip" data-tone="${tone}">${icon(TONE_ICON[tone], 12)}${text}</span>`;
  const nodeChip = (n) => chip(n.chip.tone, esc(KD.chipText(n.chip.kind)));
  const TRUTH_ICON = { observed: 'check', correlated: 'link', hypothesis: 'bulb', unknown: 'question' };
  const truth = (l) => `<span class="kh-chip" data-truth="${l}">${icon(TRUTH_ICON[l], 12)}${esc(t('label.' + l))}</span>`;

  /* ---------- source readings ---------- */
  const SCALE = 3; // the track spans 0..3x the freshness target; the target tick sits at one third on every row
  function ageBar(s, opts = {}) {
    const label = s.age === null ? t('n.never') : t('obs.read.age', { a: s.age, m: s.ttlMin });
    if (s.age === null) {
      return `<div class="kh-age" data-state="none" role="img" aria-label="${esc(label)}"><div class="kh-track"><i class="kh-target" style="--target-x:${100 / SCALE}%"></i></div>${opts.nums === false ? '' : `<div class="kh-nums"><span>${esc(label)}</span><span>${opts.compact ? '' : esc(t('n.target', { m: s.ttlMin }))}</span></div>`}</div>`;
    }
    const over = s.used > 1;
    const fillPct = Math.min(s.used, 1) * (100 / SCALE);
    const overPct = Math.min(s.used, SCALE) * (100 / SCALE) - 100 / SCALE;
    const cut = s.used > SCALE;
    const times = s.used >= 1.5 ? ` · ${t('n.over', { x: Math.round(s.used) })}` : '';
    return `<div class="kh-age" data-state="${over ? 'stale' : 'ok'}" role="img" aria-label="${esc(label + times)}"><div class="kh-track"><i class="kh-fill" style="inline-size:${fillPct.toFixed(1)}%"></i>${over ? `<i class="kh-over" style="inset-inline-start:${(100 / SCALE).toFixed(1)}%;inline-size:${overPct.toFixed(1)}%"></i>` : ''}${cut ? '<i class="kh-cut" style="inset-inline-start:96%"></i>' : ''}<i class="kh-target" style="--target-x:${(100 / SCALE).toFixed(1)}%"></i></div>${opts.nums === false ? '' : `<div class="kh-nums"><b>${esc(label)}</b><span>${esc(times ? times.slice(3) : opts.compact ? '' : t('n.target', { m: s.ttlMin }))}</span></div>`}</div>`;
  }
  const connWord = (s) => t('c.' + s.conn);
  const freshWord = (s) => t('f.' + s.fresh);
  const srcRow = (s) => `<li data-conn="${s.conn}" data-fresh="${s.fresh}"><span class="kh-prov">${icon(PROV_ICON[s.id], 16)}${provName(s.id)}</span><span><span class="kh-words">${esc(connWord(s))}, ${esc(freshWord(s))}</span>${ageBar(s, { nums: false })}</span><span class="kh-words">${s.age === null ? esc(t('n.never')) : esc(KD.fmtMin(s.age)) + ' ' + esc(t('n.ago'))}</span></li>`;

  const PIPSTATE = {
    conn: (s) => ({ reachable: 'ok', unavailable: 'bad', not_configured: 'unk' }[s.conn]),
    fresh: (s) => ({ current: 'ok', stale: 'warn', unknown: 'unk' }[s.fresh]),
    health: (s) => (s.health === 'healthy' ? 'ok' : 'unk'),
  };
  const PIPWORD = {
    conn: (s) => connWord(s),
    fresh: (s) => freshWord(s),
    health: (s) => (s.health === 'healthy' ? t('chip.healthy') : t('chip.unknown')),
  };
  function pips(axis) {
    const label = KD.SOURCES.map((s) => `${t('prov.' + s.id)}: ${PIPWORD[axis](s)}`).join('; ');
    return `<div class="kh-pips" role="img" aria-label="${esc(label)}">${KD.SOURCES.map((s) => `<i data-on="${PIPSTATE[axis](s)}"><b>${PROV_INIT[s.id]}</b></i>`).join('')}</div>`;
  }
  /** The three readings as three independent counters. There is deliberately no combined figure. */
  function readings(variant = 'card') {
    const F = KD.FIG;
    const items = [
      { axis: 'conn', head: 'obs.read.conn', n: F.reachable, unit: 'n.unit.reachable', sub: t('obs.pin.conn.sub', { u: F.unavailable, c: F.notSet }), ico: 'pulse' },
      { axis: 'fresh', head: 'obs.read.fresh', n: F.current, unit: 'n.unit.current', sub: t('obs.pin.fresh.sub', { s: F.stale, k: F.notSet }), ico: 'clock' },
      { axis: 'health', head: 'obs.read.health', n: F.healthy, unit: 'n.unit.healthy', sub: t('obs.pin.health.sub', { n: F.sourceTotal - F.healthy }), ico: 'target' },
    ];
    return items.map((i) => `<div class="kh-read" data-axis="${i.axis}" data-variant="${variant}"><div class="kh-read-h">${icon(i.ico, 15)}<span>${esc(t(i.head))}</span></div><div class="kh-read-n"><strong>${i.n}</strong><span>${esc(LANG === 'ar' ? 'من' : 'of')} ${F.sourceTotal} ${esc(t(i.unit))}</span></div>${pips(i.axis)}<small>${esc(i.sub)}</small></div>`).join('');
  }

  /* ---------- map atoms ---------- */
  const TAU46 = 2 * Math.PI * 46;
  function ring(n) {
    if (n.kind !== 'service') return '';
    const s = n.provider ? KD.source(n.provider) : null;
    const track = '<circle cx="50" cy="50" r="46" fill="none" stroke="var(--kv2-unk-line)" stroke-width="3"/>';
    if (!s || s.age === null) return `<svg class="kh-ring" viewBox="-6 -6 112 112" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="var(--kv2-unk-line)" stroke-width="2.5" stroke-dasharray="3 4"/></svg>`;
    const over = s.used > 1;
    const arc = `<circle cx="50" cy="50" r="46" fill="none" stroke="${over ? 'var(--kv2-amber)' : 'var(--kv2-cyan)'}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${(Math.min(s.used, 1) * TAU46).toFixed(1)} ${TAU46.toFixed(1)}" transform="rotate(-90 50 50)"/>`;
    const ov = over ? `<circle cx="50" cy="50" r="54" fill="none" stroke="var(--kv2-amber)" stroke-width="2.4" stroke-dasharray="4 3"/>` : '';
    return `<svg class="kh-ring" viewBox="-6 -6 112 112" aria-hidden="true">${track}${arc}${ov}</svg>`;
  }
  function readLine(n) {
    if (!n.provider) return '';
    const s = KD.source(n.provider);
    return `<span class="kh-card-read">${esc(s.age === null ? t('n.never') : t('obs.read.age', { a: s.age, m: s.ttlMin }))}</span>`;
  }
  /** One node as a native button (keyboard + AT), positioned by the concept. card: 'full' | 'min' | 'none' */
  function nodeBtn(n, o) {
    const { x, y, orb = 46, card = 'full', sel = false, dim = false, hub = false, key = '' } = o;
    const aria = `${n.title}, ${t('kind.' + n.kind)}, ${KD.chipText(n.chip.kind)}`;
    const body = card === 'none' ? '' : `<span class="kh-card"><b>${tt(n.title)}</b>${card === 'full' ? `<small>${esc(t('map.nd.' + n.id))}</small>` : ''}${nodeChip(n)}${card === 'full' || card === 'read' ? readLine(n) : ''}</span>`;
    return `<button type="button" class="kh-node" data-node="${n.id}" data-kind="${n.kind}" data-tone="${n.chip.tone}"${hub ? ' data-hub' : ''}${sel ? ' data-selected' : ''}${dim ? ' data-dim' : ''} data-fk="n-${n.id}" aria-pressed="${sel}" aria-label="${esc(aria)}" style="left:${x}%;top:${y}%;--orb:${orb}px${key}"><span class="kh-orbw">${ring(n)}<span class="kh-orb">${icon(NODE_ICON[n.id], hub ? 40 : Math.round(orb * 0.46))}</span></span>${body}</button>`;
  }
  /** Quadratic curve between two canvas points; returns path + midpoint (for the marker). */
  function curve(a, b, bend) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * len * bend, cy = my + (dx / len) * len * bend;
    return { d: `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`, mx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
  }
  function edgeG(e, pa, pb, bend, o = {}) {
    const c = curve(pa, pb, bend);
    const mk = e.cls === 'group' || e.truth === 'unknown' ? '' : e.truth === 'hypothesis'
      ? `<rect class="kh-mk" x="${(c.mx - 4.5).toFixed(1)}" y="${(c.my - 4.5).toFixed(1)}" width="9" height="9" transform="rotate(45 ${c.mx.toFixed(1)} ${c.my.toFixed(1)})"/>`
      : `<circle class="kh-mk" cx="${c.mx.toFixed(1)}" cy="${c.my.toFixed(1)}" r="5"/>`;
    const glow = e.truth === 'observed' && !o.noGlow ? `<path class="kh-glow" d="${c.d}"/>` : '';
    return `<g class="kh-edge" data-id="${e.id}" data-cls="${e.cls}" data-truth="${e.truth}"${e.stale ? ' data-stale' : ''}${o.dim ? ' data-dim' : ''}${o.hl ? ' data-hl' : ''}>${glow}<path d="${c.d}"/>${mk}</g>`;
  }
  const legend = (withRing = true) => `<ul class="kh-legend" aria-label="${esc(t('map.legend.title'))}">${['observed', 'correlated', 'hypothesis', 'unknown'].map((k) => `<li><svg data-t="${k}" viewBox="0 0 30 10" aria-hidden="true"><path class="p" d="M1 5H29"/>${k === 'unknown' ? '' : k === 'hypothesis' ? '<rect class="m" x="11" y="1.5" width="7" height="7" transform="rotate(45 14.5 5)"/>' : '<circle class="m" cx="15" cy="5" r="3.2"/>'}</svg>${esc(t('label.' + k))}</li>`).join('')}<li><svg data-t="stale" viewBox="0 0 30 10" aria-hidden="true"><path class="p" d="M1 5H29"/><circle class="m" cx="15" cy="5" r="3.2"/></svg>${esc(t('map.legend.stale'))}</li><li><svg data-t="group" viewBox="0 0 30 10" aria-hidden="true"><path class="p" d="M1 5H29"/></svg>${esc(t('map.legend.group'))}</li>${withRing ? `<li class="kh-ringkey"><svg viewBox="-6 -6 112 112" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="var(--kv2-unk-line)" stroke-width="7"/><circle cx="50" cy="50" r="46" fill="none" stroke="var(--kv2-cyan)" stroke-width="10" stroke-dasharray="90 289" transform="rotate(-90 50 50)"/></svg>${esc(LANG === 'ar' ? 'حلقة: عمر القراءة مقابل الهدف' : 'Ring: read age vs target')}</li>` : ''}</ul>`;

  /* ---------- inspector ---------- */
  const evItem = (id, compact) => {
    const e = KD.evById(id);
    if (e.unread) return `<li><div>${truth('unknown')}<span class="kh-evm">${esc(t('ev.unread.' + e.unread))}</span></div><p>${esc(t('ev.' + id))}</p></li>`;
    const fr = e.fresh === 'current' ? '' : `${chip('warn', esc(t('chip.stale')))}`;
    return `<li><div>${truth(e.label)}${fr}<span class="kh-evm">${isoLtr(id)} · ${provName(e.src)} · ${esc(KD.fmtMin(e.age))} ${esc(t('n.ago'))}</span></div><p>${esc(t('ev.' + id))}</p></li>`;
  };
  function inspector(selId, tab, o = {}) {
    const n = KD.node(selId);
    const tabs = ['overview', 'evidence', 'sources'];
    const nb = KD.neighbours(selId).map(KD.node);
    const lc = KD.linkCounts(selId);
    const total = lc.observed + lc.correlated + lc.hypothesis + lc.unknown;
    const head = `<header class="kh-insp-head"><span class="kh-orb-s" data-tone="${n.chip.tone}">${icon(NODE_ICON[n.id], 24)}</span><div><h2 aria-live="polite">${tt(n.title)}</h2><p>${esc(t('kind.' + n.kind))} <span aria-hidden="true">/</span> ${esc(t('map.nd.' + n.id))}</p>${nodeChip(n)}</div>${o.focus ? `<span class="kh-chip kh-chip-focus">${esc(t('map.focus'))}</span>` : ''}</header>`;
    let body;
    if (tab === 'evidence') {
      body = head + (n.ev.length ? `<ul class="kh-ev">${n.ev.map((id) => evItem(id)).join('')}</ul>` : `<p class="kh-empty">${esc(t('map.signals.none'))}</p>`);
    } else if (tab === 'sources') {
      const provs = [...new Set([...(n.provider ? [n.provider] : []), ...n.ev.map((id) => KD.evById(id).src).filter(Boolean)])];
      body = head + (provs.length ? `<ul class="kh-srcrows kh-srcrows-insp">${provs.map((p) => srcRow(KD.source(p))).join('')}</ul>` : `<p class="kh-empty">${esc(t('map.signals.none'))}</p>`);
    } else {
      body = `${head}<p class="kh-insp-desc">${esc(t('map.nl.' + n.id))}</p>
      <dl class="kh-stats"><div><dt>${esc(t('map.stat.projects'))}</dt><dd>${nb.filter((x) => x.kind === 'project').length}</dd></div><div><dt>${esc(t('map.stat.services'))}</dt><dd>${nb.filter((x) => x.kind === 'service').length}</dd></div><div><dt>${esc(t('map.stat.linked'))}</dt><dd>${nb.length}</dd></div></dl>
      <section class="kh-sec"><h3>${icon('pulse', 16)}${esc(t('map.signals'))}<small>${esc(t('map.signals.sub'))}</small></h3>${n.ev.length ? `<ul class="kh-ev">${n.ev.slice(0, o.signals || 2).map((id) => evItem(id)).join('')}</ul>` : `<p class="kh-empty">${esc(t('map.signals.none'))}</p>`}</section>
      <section class="kh-sec"><h3>${icon('network', 16)}${esc(t('map.links'))}</h3>${total === 0 ? `<p class="kh-empty">${esc(t('map.links.none'))}</p>` : `<ul class="kh-linkbars">${['observed', 'correlated', 'hypothesis', 'unknown'].map((k) => `<li data-truth="${k}">${truth(k)}<span class="kh-bar" role="img" aria-label="${lc[k]} / ${total}"><span style="inline-size:${(lc[k] / total) * 100}%"></span></span><b>${lc[k]}</b></li>`).join('')}</ul>`}</section>
      <div class="kh-actions">${n.ev.some((id) => ['E-1', 'E-2', 'E-3'].includes(id)) ? `<button type="button" class="kh-btn">${icon('play', 15)}${esc(t('map.open.replay'))}</button>` : ''}${n.provider ? `<button type="button" class="kh-btn">${icon('db', 15)}${esc(t('map.open.source'))}</button>` : ''}<button type="button" class="kh-btn kh-btn-quiet">${icon('target', 15)}${esc(t('map.center'))}</button></div>`;
    }
    return `<div class="kh-insp"><div class="kh-tabs"><div class="kh-seg" role="tablist" aria-label="${esc(t('tab.label'))}">${tabs.map((k) => `<button type="button" role="tab" id="insp-tab-${k}" aria-selected="${tab === k}" aria-controls="insp-panel" data-tab="${k}" data-fk="tab-${k}">${esc(t('tab.' + k))}</button>`).join('')}</div></div><div class="kh-insp-body" role="tabpanel" id="insp-panel" aria-labelledby="insp-tab-${tab}">${body}</div></div>`;
  }

  /* ---------- table alternative (same content as the map) ---------- */
  function tables(selId, activeIds) {
    const nodes = KD.NODES.filter((n) => activeIds.has(n.id));
    const edges = KD.EDGES.filter((e) => activeIds.has(e.a) && activeIds.has(e.b));
    return `<div class="kh-tablewrap" tabindex="0" role="region" aria-label="${esc(t('n.cap.nodes'))}"><table class="kh-table"><caption class="kh-sr">${esc(t('n.cap.nodes'))}</caption><thead><tr><th scope="col">${esc(t('n.th.system'))}</th><th scope="col">${esc(t('n.th.status'))}</th><th scope="col">${esc(t('n.th.ev'))}</th></tr></thead><tbody>${nodes.map((n) => `<tr${selId === n.id ? ' data-selected' : ''}><th scope="row"><button type="button" data-node="${n.id}" data-fk="tb-${n.id}" aria-pressed="${selId === n.id}">${tt(n.title)}</button></th><td>${nodeChip(n)}</td><td>${n.ev.length}</td></tr>`).join('')}</tbody></table></div>
    <div class="kh-tablewrap" tabindex="0" role="region" aria-label="${esc(t('n.cap.links'))}"><table class="kh-table"><caption class="kh-sr">${esc(t('n.cap.links'))}</caption><thead><tr><th scope="col">${esc(t('n.th.from'))}</th><th scope="col">${esc(t('n.th.to'))}</th><th scope="col">${esc(t('n.th.how'))}</th><th scope="col">${esc(t('n.th.basis'))}</th></tr></thead><tbody>${edges.map((e) => `<tr><td>${tt(KD.node(e.a).title)}</td><td>${tt(KD.node(e.b).title)}</td><td>${e.cls === 'group' ? chip('unk', esc(t('map.part'))) : truth(e.truth)}</td><td>${esc(t(e.basis))}${e.stale ? ' ' + chip('warn', esc(t('chip.stale'))) : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }


  /* ---------- systems ledger and source-readings matrix (concept C's views; concept B's list view) ---------- */
  function ledger(selId, activeIds) {
    const rows = ['product', 'project', 'service'].flatMap((k) => KD.NODES.filter((n) => n.kind === k && activeIds.has(n.id)));
    return `<div class="kh-tablewrap" tabindex="0" role="region" aria-label="${esc(t('n.ledger'))}"><table class="kh-table kh-ledger"><caption class="kh-sr">${esc(t('n.ledger'))}</caption>
      <thead><tr><th scope="col">${esc(t('n.th.system'))}</th><th scope="col">${esc(t('n.th.status'))}</th><th scope="col" class="kh-num">${esc(t('n.th.ev'))}</th></tr></thead>
      <tbody>${rows.map((n) => `<tr data-kind="${n.kind}"${selId === n.id ? ' data-selected' : ''}><th scope="row"><button type="button" data-node="${n.id}" data-fk="tb-${n.id}" aria-pressed="${selId === n.id}"><span class="kh-mini" data-tone="${n.chip.tone}">${icon(NODE_ICON[n.id], 15)}</span><span><b>${tt(n.title)}</b><span class="kh-sr">, ${esc(t('kind.' + n.kind))}</span></span></button></th><td>${nodeChip(n)}</td><td class="kh-num">${n.ev.length}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function matrix() {
    const F = KD.FIG;
    const connChip = (s) => chip({ reachable: 'ok', unavailable: 'bad', not_configured: 'unk' }[s.conn], esc(t('c.' + s.conn)));
    const healthChip = (s) => (s.health === 'healthy' ? chip('ok', esc(t('chip.healthy'))) : chip('unk', esc(t('f.unknown'))));
    const head = (key, n, unit) => `<th scope="col"><span class="kh-th">${esc(t(key))}</span><span class="kh-count"><b>${n}</b> ${esc(LANG === 'ar' ? '\u0645\u0646' : 'of')} ${F.sourceTotal} ${esc(t(unit))}</span></th>`;
    return `<div class="kh-tablewrap" tabindex="0" role="region" aria-label="${esc(t('n.matrix'))}"><table class="kh-table kh-matrix"><caption class="kh-sr">${esc(t('n.matrix'))}</caption>
      <thead><tr><th scope="col"><span class="kh-th">${esc(t('n.th.source'))}</span></th>${head('obs.read.conn', F.reachable, 'n.unit.reachable')}${head('obs.read.fresh', F.current, 'n.unit.current')}${head('obs.read.health', F.healthy, 'n.unit.healthy')}</tr></thead>
      <tbody>${KD.SOURCES.map((s) => `<tr data-conn="${s.conn}" data-fresh="${s.fresh}"><th scope="row"><span class="kh-prov">${icon(PROV_ICON[s.id], 15)}${provName(s.id)}</span></th><td data-label="${esc(t('obs.read.conn'))}">${connChip(s)}</td><td data-label="${esc(t('obs.read.fresh'))}">${ageBar(s, { compact: true })}</td><td data-label="${esc(t('obs.read.health'))}">${healthChip(s)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function linksTable(activeIds) {
    const edges = KD.EDGES.filter((e) => activeIds.has(e.a) && activeIds.has(e.b));
    return `<div class="kh-tablewrap" tabindex="0" role="region" aria-label="${esc(t('n.cap.links'))}"><table class="kh-table"><caption class="kh-sr">${esc(t('n.cap.links'))}</caption><thead><tr><th scope="col">${esc(t('n.th.from'))}</th><th scope="col">${esc(t('n.th.to'))}</th><th scope="col">${esc(t('n.th.how'))}</th><th scope="col">${esc(t('n.th.basis'))}</th></tr></thead><tbody>${edges.map((e) => `<tr><td>${tt(KD.node(e.a).title)}</td><td>${tt(KD.node(e.b).title)}</td><td>${e.cls === 'group' ? chip('unk', esc(t('map.part'))) : truth(e.truth)}</td><td>${esc(t(e.basis))}${e.stale ? ' ' + chip('warn', esc(t('chip.stale'))) : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- shell ---------- */
  const SLASH = '<svg width="26" height="22" viewBox="0 0 26 22" fill="currentColor" aria-hidden="true"><path d="M9 0h5L5 22H0z"/><path d="M19 0h5l-9 22h-5z"/></svg>';
  function shell(o) {
    const langHref = (l) => { const u = new URL(location.href); u.searchParams.set('lang', l); return u.pathname + u.search; };
    const rail = o.rail ? ' kh-nav-rail' : '';
    const nav = [['network', 'nav.map', true], ['db', 'nav.obs'], ['play', 'nav.replay'], ['agent', 'nav.deck']];
    return `<a class="kh-skip" href="#main">${esc(t('skip'))}</a><div class="kh-ground"></div>
    <div class="kh-app${o.cls ? ' ' + o.cls : ''}">
      <header class="kh-top"><div class="kh-brand">${SLASH}<span>Kawalys</span></div><span class="kh-tag">${esc(t('brand.tag'))}</span>
        <div class="kh-search" role="search">${icon('search', 15)}<span>${esc(t('search.ph'))}</span><kbd>Ctrl K</kbd></div>
        <span class="kh-demo">${esc(t('demo'))}</span>
        <div class="kh-seg kh-persona" role="group" aria-label="${esc(t('persona.owner'))}"><button type="button" aria-pressed="true">${esc(t('persona.owner'))}</button><button type="button" aria-pressed="false">${esc(t('persona.technical'))}</button><button type="button" aria-pressed="false">${esc(t('persona.nontechnical'))}</button></div>
        <div class="kh-seg" role="group" aria-label="Language"><button type="button" aria-pressed="${LANG === 'en'}" data-lang="en">EN</button><button type="button" aria-pressed="${LANG === 'ar'}" data-lang="ar" lang="ar">عربي</button></div></header>
      <nav class="kh-nav${rail}" aria-label="${esc(t('nav.screens'))}"><div class="kh-ws">${icon('target', 22)}<div><b>${esc(t('ws.name'))}</b><small>${esc(t('ws.sub'))}</small></div></div>
        ${nav.map(([ic, k, on]) => `<a href="#"${on ? ' aria-current="page"' : ''}>${icon(ic, o.rail ? 20 : 18)}<span>${esc(t(k))}</span></a>`).join('')}
        ${o.rail ? '' : `<div class="kh-navh">${icon('layers', 16)}${esc(t('scope.portfolios'))}</div><a class="kh-sub" href="#" data-on>${'<i></i>'}${tt('Retail Tower OS')}</a><a class="kh-sub" href="#"><i></i>${tt('Khepri')}</a><a class="kh-sub" href="#"><i></i>${tt('Seshat BI')}</a>`}</nav>
      <main id="main" class="kh-main">${o.main}</main></div>`;
  }
  function bindShell(root) {
    root.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('lang', b.dataset.lang); location.href = u.toString(); }));
  }

  /** Arabic pages: isolate every Latin run (product names, ids, providers) so it never reorders the surrounding Arabic. */
  function isolateLatin(root) {
    const re = /[A-Za-z][A-Za-z0-9._#\-]*(?: [A-Za-z0-9._#\-]+)*/g;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && !n.parentElement.closest('bdi,kbd,script,style,svg,.kh-pips,.kh-brand,[dir="ltr"]') && /[A-Za-z]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment(); let last = 0; const txt = n.nodeValue;
      txt.replace(re, (m, i) => { frag.append(document.createTextNode(txt.slice(last, i))); const b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = m; frag.append(b); last = i + m.length; return m; });
      frag.append(document.createTextNode(txt.slice(last))); n.replaceWith(frag);
    });
  }
  /** Minimal render loop: state in, full re-render, focus restored by data-fk. */
  function mount(state, render, bind) {
    const app = document.getElementById('app');
    const run = () => {
      const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
      app.innerHTML = render(state);
      if (LANG === 'ar') isolateLatin(app);
      bindShell(app);
      bind(app, state, () => run(), (patch) => { Object.assign(state, patch); run(); });
      if (fk) { const el = app.querySelector(`[data-fk="${fk}"]`); if (el) el.focus({ preventScroll: true }); }
    };
    run();
    return run;
  }
  /** Shared bindings: node select, inspector tabs, view/filter segments, arrow-key navigation between nodes. */
  function bindCommon(app, state, set) {
    app.querySelectorAll('[data-node]').forEach((el) => el.addEventListener('click', () => set({ sel: el.dataset.node })));
    app.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => set({ tab: el.dataset.tab })));
    app.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => set({ view: el.dataset.view })));
    app.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('click', () => set({ filter: el.dataset.filter })));
    app.querySelectorAll('[role=tablist] [data-tab]').forEach((el) => el.addEventListener('keydown', (e) => {
      const order = ['overview', 'evidence', 'sources']; let i = order.indexOf(el.dataset.tab);
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') i += rtl ? -1 : 1; else if (e.key === 'ArrowLeft') i += rtl ? 1 : -1; else return;
      e.preventDefault(); set({ tab: order[(i + 3) % 3] });
    }));
  }
  /** Arrow keys move focus between nodes: nearest node within 60 degrees of the arrow (same rule as logic/graph.ts). */
  function bindArrows(app, pos) {
    app.querySelectorAll('.kh-node').forEach((el) => el.addEventListener('keydown', (e) => {
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir) return;
      const a = pos[el.dataset.node]; let best = null;
      Object.keys(pos).forEach((id) => { if (id === el.dataset.node) return; const dx = pos[id].x - a.x, dy = pos[id].y - a.y, d = Math.hypot(dx, dy); if (!d) return; const c = (dx * dir[0] + dy * dir[1]) / d; if (c < 0.5) return; const s = d * (2 - c); if (!best || s < best.s) best = { id, s }; });
      e.preventDefault(); if (best) { const n = app.querySelector(`.kh-node[data-node="${best.id}"]`); if (n) n.focus(); }
    }));
  }

  const FILTERS = ['all', 'products', 'projects', 'services', 'risks'];
  const filterIds = (f) => new Set(KD.NODES.filter((n) => f === 'all' || (f === 'products' && n.kind === 'product') || (f === 'projects' && n.kind === 'project') || (f === 'services' && n.kind === 'service') || (f === 'risks' && n.risk)).map((n) => n.id));
  const filterSeg = (cur) => `<div class="kh-seg" role="group" aria-label="${esc(t('map.f.label'))}">${FILTERS.map((f) => `<button type="button" data-filter="${f}" data-fk="f-${f}" aria-pressed="${cur === f}">${esc(t('map.f.' + f))}</button>`).join('')}</div>`;
  const viewSeg = (cur) => `<div class="kh-seg" role="group" aria-label="${esc(t('map.hint'))}"><button type="button" data-view="map" data-fk="v-map" aria-pressed="${cur === 'map'}">${icon('network', 15)}${esc(t('view.map'))}</button><button type="button" data-view="list" data-fk="v-list" aria-pressed="${cur === 'list'}">${icon('list', 15)}${esc(t('view.list'))}</button></div>`;
  const kpi = (ic, v, label, tone) => `<div class="kh-kpi"${tone ? ` data-tone="${tone}"` : ''}>${icon(ic, 20)}<div><strong>${v}</strong><span>${esc(label)}</span></div></div>`;
  const panelHead = (ic, title, sub) => `<header><span class="kh-ico">${icon(ic, 16)}</span><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div></header>`;

  window.KUI = { esc, icon, chip, nodeChip, truth, ageBar, srcRow, pips, readings, ring, nodeBtn, curve, edgeG, legend, evItem, inspector, tables, ledger, matrix, linksTable, shell, mount, bindCommon, bindArrows, filterIds, filterSeg, viewSeg, kpi, panelHead, tt, provName, isoLtr, NODE_ICON, PROV_ICON, PROV_INIT };
})();

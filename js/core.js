/* Core: state, helpers, icons, charts, overlays. No network, no backend. */
const S = {
  route:'home', lang:'en', persona:'owner', project:'all', src:'ok', loading:false, animate:true,
  tab:{portfolio:'products', inv:'overview', dec:'inbox', agents:'all'},
  inv:'INV-418', node:null, dsel:'D1', dfilter:'all', dsort:'priority', invq:'', invsev:'all', evsel:null,
  drawer:null, pal:null, pop:false, nav:false, dec:null, hist:null, runs:{}, approvals:{}, extra:[]
};
const ROUTES = ['home','portfolio','network','investigation','decisions','agents','operations','sources','design-system'];
const _ = (en, ar) => S.lang === 'ar' ? ar : en;
const l = v => Array.isArray(v) ? v[S.lang === 'ar' ? 1 : 0] : v;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const num = n => String(n);

/* ---------- icons ---------- */
const ICONS = {
  home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  decide:'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  bot:'<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  bars:'<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  sliders:'<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chev:'<path d="m9 18 6-6-6-6"/>', chevd:'<path d="m6 9 6 6 6-6"/>',
  ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  branch:'<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  activity:'<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  checkc:'<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  sparkles:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  play:'<polygon points="6 3 20 12 6 21 6 3"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  rocket:'<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  calendar:'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  history:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  menu:'<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  scarab:'<ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8V5"/><path d="M9.5 5 12 3l2.5 2"/><path d="M7 12 3 10"/><path d="M7 16l-4 2"/><path d="M17 12l4-2"/><path d="M17 16l4 2"/><path d="M12 8v12"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  arrow:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  palette:'<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  cpu:'<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  dollar:'<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  zap:'<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  bug:'<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  server:'<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  db:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  filter:'<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  scale:'<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  dot:'<circle cx="12" cy="12" r="4"/>'
};
function icon(n, c = '') { return `<svg class="ic ${c}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`; }
function sprite() {
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('') + '</defs></svg>';
}

/* ---------- formatting ---------- */
function ago(min) {
  if (min == null) return _('not read', 'غير مقروء');
  const m = Math.round(min);
  if (S.lang === 'ar') {
    if (m < 60) return `منذ ${m} دقيقة`;
    if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `منذ ${h} س ${r} د` : `منذ ${h} ساعة`; }
    return `منذ ${Math.floor(m / 1440)} يوم`;
  }
  if (m < 60) return `${m} min ago`;
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min ago` : `${h} h ago`; }
  return `${Math.floor(m / 1440)} d ago`;
}
const effAge = a => a == null ? null : (S.src === 'stale' ? a + 540 : a);
const isStale = a => a != null && effAge(a) > 360;
function dateStr(d) { // "Nov 17" style from en label
  if (S.lang !== 'ar') return d;
  const mo = {Nov:'نوفمبر', Dec:'ديسمبر', Oct:'أكتوبر', Sep:'سبتمبر'};
  const [m, day] = d.split(' '); return `${day} ${mo[m] || m}`;
}

/* ---------- permissions by persona ---------- */
const can = k => ({
  approve: S.persona === 'owner',
  raw: S.persona !== 'biz',
  run: S.persona !== 'biz',
  tech: S.persona === 'tech'
}[k]);
const personaName = p => ({owner:_('Owner','المالك'), tech:_('Technical','الفريق التقني'), biz:_('Non-technical','الفريق غير التقني')}[p]);

/* ---------- derived data ---------- */
function decisions() { return S.dec; }
function pending() { return S.dec.filter(d => d.st === 'inbox'); }
function inProject(p) { return S.project === 'all' || p === S.project; }
function effStatus(p) {
  if (p.status === 'unavailable') return 'unavailable';
  if (p.hasEng && S.src === 'down') return 'unavailable';
  if (p.hasEng && S.src === 'stale') return 'stale';
  return p.status;
}
function initState() {
  S.dec = JSON.parse(JSON.stringify(DECISIONS));
  S.dec.forEach(d => {
    d.hist = [{w:['System','النظام'], a:['Raised for review (demo)','رُفع للمراجعة (تجريبي)'], t:'Nov 14, 16:20'}];
    if (d.st === 'decided') d.hist.push({w:['Owner (demo)','المالك (تجريبي)'], a:[d.outcome === 'approved' ? 'Approved' : 'Deferred', d.outcome === 'approved' ? 'تمت الموافقة' : 'تم التأجيل'], t:'Nov ' + d.due[0].split(' ')[1] + ', 10:05'});
    if (d.st === 'review') d.hist.push({w:['Finance (demo)','المالية (تجريبي)'], a:['Review started','بدأت المراجعة'], t:'Nov 15, 09:10'});
  });
  S.hist = {};
}
/* Reset every piece of demo state to its first-load default. Preferences (lang, persona, project) are kept on
   purpose, as are the current route and the persisted choices in localStorage. */
function resetDemo() {
  initState();
  Object.assign(S, {
    runs:{}, approvals:{}, extra:[], focus:{}, net:{tenant:null, branch:null},
    tab:{portfolio:'products', inv:'overview', dec:'inbox', agents:'all'},
    inv:'INV-418', node:null, invq:'', invsev:'all', evsel:null,
    dsel:'D1', dfilter:'all', dsort:'priority',
    drawer:null, pal:null, pop:false, nav:false, loading:false, src:'ok'
  });
}

/* ---------- small ui builders ---------- */
function badge(cls, text, ic) { return `<span class="badge ${cls}">${ic ? icon(ic) : ''}${esc(text)}</span>`; }
function statusBadge(key) {
  const s = STATUS[key]; return badge(s[2], l([s[0], s[1]]), s[3]);
}
function sevDot(s) { return `<span class="dot d-${s}" aria-hidden="true"></span>`; }
function demoTag() { return `<span class="demo"><span class="long">${_('Demo / not live', 'تجريبي / ليس مباشرًا')}</span><span class="short">${_('Demo', 'تجريبي')}</span></span>`; }
function panelHead(ic, title, opt = {}) {
  return `<div class="ph">${icon(ic)}<h2>${title}</h2>${opt.n != null ? `<span class="n">(${opt.n})</span>` : ''}<div class="r">${opt.right || ''}${opt.nodemo ? '' : demoTag()}</div></div>`;
}
function srcTag(kind) {
  if (kind === 'obs') return badge('b-teal', _('Observed', 'مرصود'), 'eye');
  if (kind === 'inf') return badge('b-ai', _('Inferred', 'مستنتَج'), 'sparkles');
  return badge('b-unk', _('Unknown', 'غير معروف'), 'help');
}
function freshTag(a) {
  if (a == null) return badge('b-unk', _('Not read', 'غير مقروء'), 'help');
  // Sources unavailable: a stored age is only the last snapshot. Never present it as a current reading.
  if (S.src === 'down') return badge('b-unk', _('Unavailable', 'غير متاح'), 'alert');
  if (isStale(a)) return badge('b-warn', _('Stale', 'قديم') + ' · ' + ago(effAge(a)), 'clock');
  return `<span class="mut" style="font-size:12.5px">${esc(ago(effAge(a)))}</span>`;
}
function stateBox(kind, ic, title, text, btn) {
  return `<div class="state ${kind}" role="status">${icon(ic)}<b>${title}</b><p>${text}</p>${btn || ''}</div>`;
}
function skeleton(n = 3) {
  return `<div class="skwrap" aria-busy="true" aria-label="${_('Loading', 'جارٍ التحميل')}">` +
    Array.from({length:n}, (_, i) => `<div class="sk" style="height:${i ? 46 : 70}px"></div>`).join('') + '</div>';
}
function sampleBtn(txt, cls = 'btn-link') {
  return `<button class="${cls}" data-act="sample">${esc(txt)}${icon('ext', 'sm')}</button>`;
}

/* ---------- charts (SVG, drawn from data) ---------- */
const CHARTS = {};
function lineChart(c) {
  const W = c.w || 620, H = c.h || 230, m = {l:38, r:16, t:16, b:28};
  const n = c.x.length, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const X = i => m.l + (n === 1 ? 0 : i * pw / (n - 1));
  const Y = v => m.t + ph - v / c.ymax * ph;
  CHARTS[c.id] = {...c, W, H, m, X, Y, n};
  const ticks = c.ticks || [0, 1, 2, 3, 4].map(i => i * c.ymax / 4);
  let g = ticks.map(t => `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${c.fmt ? c.fmt(t) : t}</text>`).join('');
  const step = Math.ceil(n / 7);
  g += c.x.map((lb, i) => (i % step === 0 || i === n - 1) ? `<text class="ax" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(lb)}</text>` : '').join('');
  if (c.thr != null) g += `<line class="thr" x1="${m.l}" x2="${W - m.r}" y1="${Y(c.thr)}" y2="${Y(c.thr)}"/><text class="ax" x="${m.l + 8}" y="${Y(c.thr) - 6}" text-anchor="start" style="fill:var(--coral)">${esc(c.thrLabel)}</text>`;
  c.series.forEach(s => {
    const pts = s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    if (s.area) g += `<polygon points="${m.l},${Y(0)} ${pts} ${X(n - 1)},${Y(0)}" fill="${s.color}" opacity=".14"/>`;
    g += `<polyline class="ln" points="${pts}" stroke="${s.color}" ${s.dash ? 'stroke-dasharray="6 5"' : ''}/>`;
    const lx = X(n - 1), ly = Y(s.data[n - 1]);
    g += `<circle cx="${lx}" cy="${ly}" r="5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
    g += `<text class="lab" x="${lx - 8}" y="${ly + (s.lab === 'down' ? 22 : -12)}" text-anchor="end" fill="var(--ink)">${esc(l(s.name))} ${c.fmt ? c.fmt(s.data[n - 1]) : s.data[n - 1]}</text>`;
  });
  g += `<g id="${c.id}-cur" style="display:none"><line class="gl" style="stroke:rgba(255,255,255,.28)" y1="${m.t}" y2="${m.t + ph}"/>${c.series.map((s, i) => `<circle r="5" fill="${s.color}" stroke="var(--surface)" stroke-width="2" data-i="${i}"/>`).join('')}</g>`;
  const tbl = `<table class="tbl"><thead><tr><th>${_('Point', 'النقطة')}</th>${c.series.map(s => `<th>${esc(l(s.name))}</th>`).join('')}</tr></thead><tbody>${c.x.map((lb, i) => `<tr><td>${esc(lb)}</td>${c.series.map(s => `<td class="num">${c.fmt ? c.fmt(s.data[i]) : s.data[i]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<div class="legend-c">${c.series.map(s => `<span><i style="background:${s.color}"></i>${esc(l(s.name))}</span>`).join('')}</div>
  <div class="chart" data-chart="${c.id}" tabindex="0" role="img" aria-label="${esc(l(c.label))}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}</svg><div class="tip" hidden></div></div>
  <details class="tv"><summary>${_('View as table', 'عرض كجدول')}</summary><div class="scroll-x">${tbl}</div></details>`;
}
function chartHover(el, clientX, idx) {
  const c = CHARTS[el.dataset.chart]; if (!c) return;
  const svg = $('svg', el), r = svg.getBoundingClientRect();
  if (idx == null) {
    const vx = (clientX - r.left) / r.width * c.W;
    idx = Math.max(0, Math.min(c.n - 1, Math.round((vx - c.m.l) / ((c.W - c.m.l - c.m.r) / (c.n - 1)))));
  }
  const cur = $('#' + c.id + '-cur', el), tip = $('.tip', el), x = c.X(idx);
  cur.style.display = ''; $('line', cur).setAttribute('x1', x); $('line', cur).setAttribute('x2', x);
  $$('circle', cur).forEach((ci, i) => { ci.setAttribute('cx', x); ci.setAttribute('cy', c.Y(c.series[i].data[idx])); });
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(c.x[idx])}</b>` + c.series.map(s => `<div><span class="dot" style="background:${s.color}"></span>${esc(l(s.name))}: <strong class="num">${c.fmt ? c.fmt(s.data[idx]) : s.data[idx]}</strong></div>`).join('');
  const px = x / c.W * r.width, py = Math.min(...c.series.map(s => c.Y(s.data[idx]))) / c.H * r.height;
  tip.style.left = Math.max(70, Math.min(r.width - 70, px)) + 'px'; tip.style.top = py + 'px';
  el.dataset.idx = idx;
}
function chartLeave(el) { const c = CHARTS[el.dataset.chart]; if (!c) return; $('#' + c.id + '-cur', el).style.display = 'none'; $('.tip', el).hidden = true; }

/* ---------- toast ---------- */
function toast(msg) {
  const h = $('#toast'); if (!h) return;
  const d = document.createElement('div'); d.innerHTML = icon('checkc') + '<span></span>'; $('span', d).textContent = msg; h.appendChild(d);
  setTimeout(() => d.remove(), 3600);
}

/* ---------- scenes (decorative, drawn in SVG) ---------- */
function logoMark() {
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0C57A"/><stop offset="1" stop-color="#C98F3C"/></linearGradient></defs>
  <polygon points="20,3 37,35 3,35" fill="rgba(221,170,87,.10)" stroke="url(#lg)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M15 20v13M15 27l10-7M18.6 25l6.6 8" stroke="url(#lg)" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
}
function sideScene() {
  return `<svg class="scene" viewBox="0 0 232 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>
  <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#080F1A" stop-opacity="0"/><stop offset=".55" stop-color="#2B2118" stop-opacity=".55"/><stop offset="1" stop-color="#5A3C1E" stop-opacity=".75"/></linearGradient>
  <radialGradient id="sn" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F6C37A" stop-opacity=".85"/><stop offset=".5" stop-color="#E49A4A" stop-opacity=".25"/><stop offset="1" stop-color="#E49A4A" stop-opacity="0"/></radialGradient></defs>
  <rect width="232" height="190" fill="url(#sk)"/><circle cx="150" cy="122" r="46" fill="url(#sn)"/>
  <polygon points="112,70 44,162 180,162" fill="#101a29"/><polygon points="112,70 180,162 120,162" fill="#0a111c"/>
  <polyline points="44,162 112,70 180,162" fill="none" stroke="#DDAA57" stroke-opacity=".38" stroke-width="1"/>
  <polygon points="182,108 146,162 220,162" fill="#0e1725"/><polygon points="182,108 220,162 188,162" fill="#09101a"/>
  <polygon points="28,130 2,162 56,162" fill="#0d1624"/>
  <path d="M0 170 C46 154 88 168 138 160 S208 152 232 162 V190 H0Z" fill="#0a111c"/><path d="M0 182 C60 170 124 184 232 172 V190 H0Z" fill="#060b14"/></svg>`;
}
function heroDunes() {
  return `<svg class="dunes" viewBox="0 0 520 140" preserveAspectRatio="xMaxYMax meet" aria-hidden="true"><defs>
  <radialGradient id="hs" cx=".7" cy=".5" r=".6"><stop offset="0" stop-color="#F6C37A" stop-opacity=".55"/><stop offset="1" stop-color="#F6C37A" stop-opacity="0"/></radialGradient></defs>
  <circle cx="360" cy="92" r="80" fill="url(#hs)"/>
  <polygon points="330,28 250,128 410,128" fill="#0F1A2B"/><polygon points="330,28 410,128 340,128" fill="#0A121F"/>
  <polyline points="250,128 330,28 410,128" fill="none" stroke="#DDAA57" stroke-opacity=".5" stroke-width="1.2"/>
  <polygon points="430,76 385,128 490,128" fill="#0E1828"/><polygon points="205,92 170,128 242,128" fill="#0D1625"/>
  <path d="M0 126 C90 112 170 128 260 120 S430 112 520 124 V140 H0Z" fill="#09101B"/></svg>`;
}

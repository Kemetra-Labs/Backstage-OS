/* Shell: navigation, top bar, overlays (drawer, command palette), event wiring. */
const SCREENS = {}, DRAWERS = {}, ACT = {};
const NAV = [
  ['home','home',['Home','الرئيسية']], ['portfolio','layers',['Portfolio','المحفظة']],
  ['network','store',['Customers','العملاء']], ['investigation','search',['Investigation','التحقيق']], ['decisions','decide',['Decisions','القرارات']],
  ['agents','bot',['Agents','الوكلاء']], '-',
  ['operations','bars',['Operations','العمليات']], ['sources','link',['Sources','المصادر']], ['design-system','palette',['Design system','نظام التصميم']]
];

function navHTML() {
  return NAV.map(n => {
    if (n === '-') return '<div class="nav-sep" role="separator"></div>';
    const cnt = n[0] === 'decisions' ? pending().length : 0;
    return `<button data-act="nav" data-id="${n[0]}" ${S.route === n[0] ? 'aria-current="page"' : ''}>${icon(n[1])}<span>${l(n[2])}</span>${cnt ? `<span class="cnt" aria-label="${cnt} ${_('pending', 'معلّقة')}">${cnt}</span>` : ''}</button>`;
  }).join('');
}
function topHTML() {
  const pr = Object.values(PROJECTS);
  const fr = {ok:[_('Data freshness (demo)', 'حداثة البيانات (تجريبي)'), _('Last read 3:14 PM', 'آخر قراءة 3:14 م')],
    stale:[_('Stale: 9 h old (demo)', 'قديمة: عمرها 9 س (تجريبي)'), _('Last read 6:14 AM', 'آخر قراءة 6:14 ص')],
    down:[_('Sources not read (demo)', 'المصادر غير مقروءة (تجريبي)'), _('No successful read', 'لا قراءة ناجحة')]}[S.src];
  return `<header class="top">
  <button class="icon-btn menu-btn" data-act="menu" aria-label="${_('Open navigation', 'فتح التنقل')}" aria-expanded="${S.nav}">${icon('menu')}</button>
  <label class="sel">${icon('layers')}<span class="sr">${_('Project', 'المشروع')}</span>
    <select data-chg="project"><option value="all" ${S.project === 'all' ? 'selected' : ''}>${_('All projects', 'كل المشاريع')}</option>${pr.map(p => `<option value="${p.id}" ${S.project === p.id ? 'selected' : ''}>${esc(l(p.name))}</option>`).join('')}</select>${icon('chevd', 'chev')}</label>
  <button class="search" data-act="pal" aria-haspopup="dialog">${icon('search')}<span>${_('Search projects, decisions, evidence…', 'ابحث في المشاريع والقرارات والأدلة…')}</span><kbd>Ctrl K</kbd></button>
  <div class="sp"></div>
  <label class="sel">${icon('users')}<span class="sr">${_('View as', 'العرض كـ')}</span>
    <select data-chg="persona">${['owner','tech','biz'].map(p => `<option value="${p}" ${S.persona === p ? 'selected' : ''}>${personaName(p)}</option>`).join('')}</select>${icon('chevd', 'chev')}</label>
  <button class="chip-btn fresh" data-s="${S.src}" data-act="pop" aria-haspopup="dialog" aria-expanded="${S.pop}"><span class="dot" aria-hidden="true"></span><span class="t">${fr[0]}<small>${fr[1]}</small></span></button>
  <div class="seg" role="group" aria-label="${_('Language', 'اللغة')}"><button data-act="lang" data-v="en" aria-pressed="${S.lang === 'en'}" lang="en">EN</button><button data-act="lang" data-v="ar" aria-pressed="${S.lang === 'ar'}" lang="ar">عربي</button></div>
  <span class="avatar" aria-hidden="true" title="${personaName(S.persona)}">${S.persona === 'owner' ? _('O', 'م') : S.persona === 'tech' ? _('T', 'ت') : _('N', 'غ')}</span>
  ${S.pop ? popHTML() : ''}</header>`;
}
function popHTML() {
  const opt = (v, t, s) => `<button role="radio" aria-checked="${S.src === v}" data-act="src" data-v="${v}"><i></i><span>${t}<small>${s}</small></span></button>`;
  return `<div class="pop" role="dialog" aria-label="${_('Source state', 'حالة المصادر')}">
    <h3>${_('Simulate source state', 'محاكاة حالة المصادر')}</h3>
    <p>${_('Everything here is demo data. Pick a state to see how the product behaves when engineering sources are late or unreachable.', 'كل ما هنا بيانات تجريبية. اختر حالة لترى سلوك المنتج عندما تتأخر مصادر الهندسة أو لا يمكن الوصول إليها.')}</p>
    <div class="radios" role="radiogroup">${opt('ok', _('Normal', 'عادي'), _('Sources read a few minutes ago', 'قُرئت المصادر قبل دقائق'))}${opt('stale', _('Stale', 'قديمة'), _('Last successful read was 9 hours ago', 'آخر قراءة ناجحة قبل 9 ساعات'))}${opt('down', _('Unavailable', 'غير متاحة'), _('Sources cannot be read. Nothing is shown as healthy.', 'لا يمكن قراءة المصادر. لا يُعرض شيء كسليم.'))}</div>
    <div class="row wrap"><button class="btn sm" data-act="reread">${icon('refresh', 'sm')}${_('Re-read sources', 'إعادة قراءة المصادر')}</button><button class="btn sm ghost" data-act="reset">${_('Reset demo', 'إعادة ضبط العرض')}</button></div></div>`;
}
function shellHTML() {
  let view;
  if (S.loading) view = `<div class="view">${skeleton(4)}</div>`;
  else { const f = SCREENS[S.route] || SCREENS.generic; view = `<div class="view" ${S.animate ? '' : 'style="animation:none"'}>${f()}</div>`; }
  return `<a class="skip" href="#main" data-act="skip">${_('Skip to content', 'تخطَّ إلى المحتوى')}</a>
  <div class="shell">
    <aside class="side ${S.nav ? 'open' : ''}" aria-label="${_('Main navigation', 'التنقل الرئيسي')}">
      <a class="brand" href="#home" data-act="nav" data-id="home" aria-label="Kemetra Mission Control">${logoMark()}<div><b>Kemetra</b><span>${_('Mission Control', 'مركز القيادة')}</span></div></a>
      <p class="tagline">${_('Company operating system · internal use only', 'نظام تشغيل الشركة · للاستخدام الداخلي فقط')}</p>
      <nav class="nav" aria-label="${_('Screens', 'الشاشات')}">${navHTML()}</nav>
      <div class="side-foot">${sideScene()}<div class="ucard"><span class="avatar">${S.persona === 'owner' ? _('O', 'م') : S.persona === 'tech' ? _('T', 'ت') : _('N', 'غ')}</span><div><b>${personaName(S.persona)}</b><small>${_('Demo user · internal', 'مستخدم تجريبي · داخلي')}</small></div><span class="udemo">${_('Demo, not live', 'تجريبي')}</span></div></div>
    </aside>
    <div class="main">${topHTML()}<main class="content" id="main" tabindex="-1">${view}</main></div>
  </div>`;
}

/* ---------- focus-safe rendering ---------- */
const fkOf = el => el && el.dataset ? [el.dataset.act || el.dataset.chg || el.dataset.inp || '', el.dataset.id || '', el.dataset.v || '', el.dataset.g || ''].join('|') : '';
function renderApp() {
  const ae = document.activeElement, fk = ae && ae !== document.body && ae.closest('#app') ? fkOf(ae) : null;
  $('#app').innerHTML = shellHTML();
  S.animate = false;
  document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  document.title = 'Kemetra Mission Control · ' + (NAV.find(n => n[0] === S.route) ? l(NAV.find(n => n[0] === S.route)[2]) : '');
  if (fk && fk !== '|||') {
    const t = $$('#app [data-act],#app [data-chg],#app [data-inp]').find(e => fkOf(e) === fk);
    if (t) { t.focus({preventScroll:true}); if (t.tagName === 'INPUT') { const n = t.value.length; try { t.setSelectionRange(n, n); } catch (e) {} } }
  }
}
function go(route, opt = {}) {
  if (!ROUTES.includes(route)) route = 'home';
  S.route = route; S.nav = false; S.pop = false; S.animate = true;
  if (opt.after) opt.after();
  if (location.hash !== '#' + route) history.replaceState(null, '', '#' + route);
  closeOverlay(true); renderApp(); window.scrollTo({top:0});
  const m = $('#main'); if (m && !opt.keepFocus) m.focus({preventScroll:true});
}

/* ---------- overlays ---------- */
function openDrawer(kind, id, from) {
  S.drawer = {kind, id}; S.pal = null; S.lastFocus = from || document.activeElement; renderOverlay();
  const d = $('#drawer'); if (d) d.focus();
}
function closeOverlay(silent) {
  const had = S.drawer || S.pal; S.drawer = null; S.pal = null; renderOverlay();
  if (had && !silent && S.lastFocus && document.contains(S.lastFocus)) S.lastFocus.focus({preventScroll:true});
}
function renderOverlay() {
  const o = $('#overlay'); if (!o) return;
  if (S.drawer) {
    const f = DRAWERS[S.drawer.kind], r = f ? f(S.drawer.id) : {title:'', body:''};
    o.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t" tabindex="-1">
      <header><div style="min-width:0;flex:1"><h2 id="dr-t">${r.title}</h2>${r.sub ? `<div class="row wrap" style="margin-top:8px">${r.sub}</div>` : ''}</div><button class="icon-btn" data-act="close" aria-label="${_('Close', 'إغلاق')}">${icon('x')}</button></header>
      <div class="body">${r.body}</div></aside>`;
  } else if (S.pal) {
    o.innerHTML = `<div class="scrim" data-act="close"></div><div class="pal" role="dialog" aria-modal="true" aria-label="${_('Search', 'بحث')}">
      <input id="pal-in" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" autocomplete="off" placeholder="${_('Search projects, decisions, investigations, agents…', 'ابحث في المشاريع والقرارات والتحقيقات والوكلاء…')}" value="${esc(S.pal.q)}">
      <ul id="pal-list" role="listbox">${palList()}</ul><div class="foot"><span>↑ ↓ ${_('to move', 'للتنقل')}</span><span>Enter ${_('to open', 'للفتح')}</span><span>Esc ${_('to close', 'للإغلاق')}</span></div></div>`;
    const i = $('#pal-in'); if (i) { i.focus(); }
  } else o.innerHTML = '';
}
function palItems() {
  const q = (S.pal ? S.pal.q : '').trim().toLowerCase(), out = [];
  NAV.filter(n => n !== '-').forEach(n => out.push({g:_('Screens', 'الشاشات'), t:l(n[2]), s:'', ic:n[1], a:() => go(n[0])}));
  Object.values(PROJECTS).forEach(p => out.push({g:_('Projects', 'المشاريع'), t:l(p.name), s:l(p.desc), ic:p.icon, a:() => go('portfolio', {after:() => S.tab.portfolio = 'products'})}));
  S.dec.forEach(d => out.push({g:_('Decisions', 'القرارات'), t:l(d.t), s:d.id, ic:'decide', a:() => go('decisions', {after:() => {S.dsel = d.id; S.tab.dec = d.st === 'decided' ? 'decided' : d.st === 'review' ? 'review' : 'inbox';}})}));
  Object.values(INVESTIGATIONS).forEach(v => out.push({g:_('Investigations', 'التحقيقات'), t:l(v.t), s:v.id, ic:'search', a:() => go('investigation', {after:() => {S.inv = v.id; S.tab.inv = 'overview'; S.node = null;}})}));
  Object.entries(EVIDENCE).filter(([k, e]) => e.inv).forEach(([k, e]) => out.push({g:_('Evidence', 'الأدلة'), t:l(e.t), s:k, ic:'file', a:() => go('investigation', {after:() => {S.inv = e.inv; S.tab.inv = 'evidence';}})}));
  AGENTS.forEach(a => out.push({g:_('Agents', 'الوكلاء'), t:l(a.n), s:l(a.role), ic:a.icon, a:() => go('agents', {after:() => {}})}));
  RISKS.forEach(r => out.push({g:_('Risks', 'المخاطر'), t:l(r.t), s:r.id, ic:'alert', a:() => go('portfolio', {after:() => S.tab.portfolio = 'risks'})}));
  return (q ? out.filter(i => (i.t + ' ' + i.s + ' ' + i.g).toLowerCase().includes(q)) : out.filter(i => ['Screens', 'الشاشات'].includes(i.g))).slice(0, 30);
}
function palList() {
  const items = palItems(); S.pal.items = items; S.pal.idx = Math.min(S.pal.idx || 0, Math.max(0, items.length - 1));
  if (!items.length) return `<li class="g" role="presentation" style="padding:22px 14px;font-size:13.5px">${_('No match. Try a project, a decision, or an ID such as INV-418.', 'لا نتائج. جرّب مشروعًا أو قرارًا أو رقمًا مثل INV-418.')}</li>`;
  let g = '', h = '';
  items.forEach((it, i) => {
    if (it.g !== g) { g = it.g; h += `<li class="g" role="presentation">${esc(g)}</li>`; }
    h += `<li role="presentation"><button class="it" role="option" id="po-${i}" aria-selected="${i === S.pal.idx}" data-act="palpick" data-id="${i}">${icon(it.ic)}<span>${esc(it.t)}</span>${it.s ? `<small>${esc(it.s)}</small>` : ''}</button></li>`;
  });
  return h;
}
function openPalette() { S.drawer = null; S.pop = false; S.lastFocus = document.activeElement; S.pal = {q:'', idx:0}; renderOverlay(); }

/* ---------- actions ---------- */
Object.assign(ACT, {
  nav: (el, ev) => { ev.preventDefault(); go(el.dataset.id); },
  skip: (el, ev) => { ev.preventDefault(); $('#main').focus(); },
  menu: () => { S.nav = !S.nav; renderApp(); if (S.nav) { const f = $('.side .nav button'); if (f) f.focus({preventScroll:true}); } },
  lang: el => { S.lang = el.dataset.v; persist(); renderApp(); renderOverlay(); },
  pal: () => openPalette(),
  pop: () => { S.pop = !S.pop; renderApp(); },
  src: el => { S.src = el.dataset.v; renderApp(); },
  reread: () => { S.pop = false; S.loading = true; renderApp(); setTimeout(() => { S.loading = false; renderApp(); toast(S.src === 'down' ? _('Still unavailable (demo)', 'ما زالت غير متاحة (تجريبي)') : _('Sources re-read (demo)', 'أُعيدت قراءة المصادر (تجريبي)')); }, 900); },
  reset: () => {
    Object.values(TIMERS).forEach(clearInterval); Object.keys(TIMERS).forEach(k => delete TIMERS[k]);
    Object.keys(DONE_APPROVAL).forEach(k => delete DONE_APPROVAL[k]);
    resetDemo(); closeOverlay(true); renderApp(); toast(_('Demo reset', 'أُعيد ضبط العرض'));
  },
  sample: () => toast(_('Sample link: not a live source', 'رابط عيّنة: ليس مصدرًا مباشرًا')),
  close: () => closeOverlay(),
  palpick: el => { const it = S.pal.items[+el.dataset.id]; closeOverlay(true); it.a(); }
});
const CHG = {
  project: el => { S.project = el.value; persist(); renderApp(); },
  persona: el => { S.persona = el.value; persist(); renderApp(); toast(_('Viewing as: ', 'العرض كـ: ') + personaName(S.persona)); }
};
function persist() { try { localStorage.setItem('kmc', JSON.stringify({lang:S.lang, persona:S.persona, project:S.project})); } catch (e) {} }
function restore() { try { const v = JSON.parse(localStorage.getItem('kmc') || 'null'); if (v) { S.lang = v.lang || 'en'; S.persona = v.persona || 'owner'; S.project = v.project || 'all'; } } catch (e) {} }

function wire() {
  document.addEventListener('click', ev => {
    if (S.pop && !ev.target.closest('.pop') && !ev.target.closest('.fresh')) { S.pop = false; renderApp(); }
    if (S.nav && !ev.target.closest('.side') && !ev.target.closest('.menu-btn')) { S.nav = false; renderApp(); }
    const a = ev.target.closest('[data-act]'); if (a && ACT[a.dataset.act]) ACT[a.dataset.act](a, ev);
  });
  document.addEventListener('change', ev => { const c = ev.target.closest('[data-chg]'); if (c) (CHG[c.dataset.chg] || ACT[c.dataset.chg])(c, ev); });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'pal-in') { S.pal.q = ev.target.value; S.pal.idx = 0; $('#pal-list').innerHTML = palList(); }
    else if (ev.target.dataset && ev.target.dataset.inp && ACT[ev.target.dataset.inp]) ACT[ev.target.dataset.inp](ev.target, ev);
  });
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); S.pal ? closeOverlay() : openPalette(); return; }
    if (S.pal) {
      const n = (S.pal.items || []).length;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); S.pal.idx = (S.pal.idx + (ev.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(1, n); $('#pal-list').innerHTML = palList(); const s = $('#po-' + S.pal.idx); if (s) s.scrollIntoView({block:'nearest'}); }
      else if (ev.key === 'Enter') { ev.preventDefault(); const it = S.pal.items[S.pal.idx]; if (it) { closeOverlay(true); it.a(); } }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeOverlay(); }
      return;
    }
    if (ev.key === 'Escape') {
      if (S.drawer) { ev.preventDefault(); closeOverlay(); }
      else if (S.pop) { S.pop = false; renderApp(); }
      else if (S.nav) { S.nav = false; renderApp(); const m = $('.menu-btn'); if (m) m.focus({preventScroll:true}); }
    }
    if (ev.key === 'Tab' && S.drawer) { // keep focus inside the drawer
      const f = $$('#drawer button, #drawer [href], #drawer select, #drawer input, #drawer summary, #drawer [tabindex="0"]').filter(e => !e.disabled);
      if (!f.length) return; const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement.id === 'drawer')) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    const tab = ev.target.closest && ev.target.closest('[role="tab"]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      const all = $$('[role="tab"]', tab.parentElement), i = all.indexOf(tab), rtl = S.lang === 'ar';
      let j = ev.key === 'Home' ? 0 : ev.key === 'End' ? all.length - 1 : i + ((ev.key === 'ArrowRight') !== rtl ? 1 : -1);
      j = (j + all.length) % all.length; ev.preventDefault(); all[j].click();
      const nt = $$('[role="tab"]').find(e => fkOf(e) === fkOf(all[j])); if (nt) nt.focus();
    }
    if (ev.target.matches && ev.target.matches('tr.click') && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.target.click(); }
    if (ev.target.classList && ev.target.classList.contains('nd') && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', {bubbles:true})); }
    const ch = ev.target.closest && ev.target.closest('.chart');
    if (ch && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) { ev.preventDefault(); const c = CHARTS[ch.dataset.chart]; let i = ch.dataset.idx == null ? c.n - 1 : +ch.dataset.idx; i = Math.max(0, Math.min(c.n - 1, i + ((ev.key === 'ArrowRight') ? 1 : -1))); chartHover(ch, 0, i); }
  });
  document.addEventListener('focusin', ev => { // tabbing out of the open mobile nav closes it, so focus never lands behind it
    if (S.nav && !ev.target.closest('.side') && !ev.target.closest('.menu-btn')) { S.nav = false; renderApp(); }
  });
  document.addEventListener('pointermove', ev => { const ch = ev.target.closest && ev.target.closest('.chart'); if (ch) chartHover(ch, ev.clientX); });
  document.addEventListener('pointerout', ev => { const ch = ev.target.closest && ev.target.closest('.chart'); if (ch && !ch.contains(ev.relatedTarget)) chartLeave(ch); });
  document.addEventListener('focusout', ev => { const ch = ev.target.closest && ev.target.closest('.chart'); if (ch && !ch.contains(ev.relatedTarget)) chartLeave(ch); });
  window.addEventListener('hashchange', () => { const r = location.hash.slice(1); if (ROUTES.includes(r) && r !== S.route) go(r, {keepFocus:false}); });
}

/* ---------- generic placeholder screen ---------- */
SCREENS.generic = () => {
  const n = NAV.find(x => x[0] === S.route);
  const name = n ? l(n[2]) : '';
  return `<div class="page-head"><div><h1>${name}</h1><p class="lede">${_('This area is outside the five screens of this review prototype.', 'هذا القسم خارج الشاشات الخمس في نموذج المراجعة هذا.')}</p></div></div>
  ${stateBox('', 'layers', _('Not in this prototype', 'غير موجود في هذا النموذج'), _('Nothing is connected here. Use Home, Portfolio, Investigation, Decisions or Agents to review the design.', 'لا شيء متصل هنا. استخدم الرئيسية أو المحفظة أو التحقيق أو القرارات أو الوكلاء لمراجعة التصميم.'), `<button class="btn pri-btn" data-act="nav" data-id="home">${_('Back to Home', 'العودة إلى الرئيسية')}</button>`)}`;
};

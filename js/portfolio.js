/* Screen 02: Company Portfolio, plus the product drill-down drawer. */
const DEF_MS = ['Milestones done ÷ milestones planned for Q4 2026. Counted from the milestone list, not estimated.', 'المعالم المنجزة ÷ المعالم المخططة للربع الرابع 2026. تُحسب من قائمة المعالم وليست تقديرًا.'];
function crumbs(items) {
  return `<nav class="crumbs" aria-label="${_('Breadcrumb', 'مسار التنقل')}">${items.map((c, i) => (i ? `<span aria-hidden="true">${icon('chev', 'sm flip')}</span>` : '') + (c.act ? `<button data-act="${c.act}" data-id="${c.id || ''}">${c.t}</button>` : `<span aria-current="page">${c.t}</span>`)).join('')}</nav>`;
}
function tabsHTML(group, list) {
  return `<div class="tabs" role="tablist">${list.map(t => `<button role="tab" id="tab-${group}-${t[0]}" data-act="tab" data-g="${group}" data-v="${t[0]}" aria-selected="${S.tab[group] === t[0]}" tabindex="${S.tab[group] === t[0] ? 0 : -1}">${t[1]}${t[2] != null ? `<span class="c">${t[2]}</span>` : ''}</button>`).join('')}</div>`;
}
ACT.tab = el => { S.tab[el.dataset.g] = el.dataset.v; renderApp(); };

function visProjects() { return Object.values(PROJECTS).filter(p => inProject(p.id)); }
function pTag(id) { return `<span class="chip">${esc(l(PROJECTS[id].name))}</span>`; }
const LV = {high:['High','عالٍ','b-crit'], med:['Medium','متوسط','b-warn'], low:['Low','منخفض','b-teal']};

function portKpis() {
  const v = visProjects(), ms = v.reduce((a, p) => ({d:a.d + p.ms.done, t:a.t + p.ms.total}), {d:0, t:0});
  const risks = RISKS.filter(r => inProject(r.proj)), deps = DEPS.filter(d => inProject(d.from) || inProject(d.to));
  const hi = risks.filter(r => r.lvl === 'high').length, unk = deps.filter(d => d.st === 'unk').length;
  return `<div class="kpis">
    <div class="kpi">${icon('layers')}<div><b class="num">${v.length}</b><span>${_('Products in scope', 'منتجات ضمن النطاق')}</span></div></div>
    <div class="kpi">${icon('flag')}<div><b class="num">${ms.d}<small> / ${ms.t}</small></b><span>${_('Milestones done', 'معالم منجزة')}</span><span class="why">${_('Done ÷ planned, Q4 2026', 'منجزة ÷ مخططة، الربع الرابع 2026')}</span></div></div>
    <div class="kpi crit">${icon('alert')}<div><b class="num">${risks.length}</b><span>${_('Open risks', 'مخاطر مفتوحة')}</span><span class="why">${hi} ${_('high', 'عالية')}</span></div></div>
    <div class="kpi gold">${icon('link')}<div><b class="num">${deps.length}</b><span>${_('Dependencies', 'اعتمادات')}</span><span class="why">${unk} ${_('with unknown health', 'بحالة غير معروفة')}</span></div></div></div>`;
}
function trajPanel() {
  const chart = lineChart({id:'traj', label:['Milestones planned to date and done, by week', 'المعالم المخططة حتى تاريخه والمنجزة، أسبوعيًا'], x:TRAJ.x, ymax:24, ticks:[0, 6, 12, 18, 24],
    series:[{name:['Planned to date','المخطط حتى الآن'], color:'var(--ch-2)', data:TRAJ.planned, dash:true, lab:'up'}, {name:['Done','المنجز'], color:'var(--ch-1)', data:TRAJ.done, lab:'down', area:true}]});
  return `<section class="panel c7" aria-labelledby="h-traj">${panelHead('activity', `<span id="h-traj">${_('Company Trajectory', 'مسار الشركة')}</span>`)}
    <p class="sub" style="margin:-6px 0 8px">${_('All three products together, cumulative milestones per week.', 'المنتجات الثلاثة معًا، المعالم التراكمية أسبوعيًا.')}</p>${chart}</section>`;
}
function methodPanel() {
  return `<section class="panel c5" aria-labelledby="h-meth">${panelHead('info', `<span id="h-meth">${_('How health is measured', 'كيف تُقاس الصحة')}</span>`)}
    <div class="mode">
      <div>${icon('flag', 'lg')}<div><b>${_('Progress', 'التقدم')}</b><p>${l(DEF_MS)}</p></div></div>
      <div>${icon('activity', 'lg')}<div><b>${_('Health', 'الصحة')}</b><p>${_('Taken from build status, open blockers and data freshness. With no source read, health is unknown, never green.', 'مأخوذة من حالة البناء والعوائق المفتوحة وحداثة البيانات. عند غياب المصدر تكون الصحة غير معروفة وليست خضراء.')}</p></div></div>
      <div>${icon('help', 'lg')}<div><b>${_('Unknown', 'غير معروف')}</b><p>${_('Shown with a dashed outline and a question mark. It always asks for verification.', 'يُعرض بإطار متقطع وعلامة استفهام. ويطلب التحقق دائمًا.')}</p></div></div></div></section>`;
}
function productsTab() {
  const v = visProjects();
  return `<div class="grid"><section class="panel c12" aria-label="${_('Products', 'المنتجات')}">${panelHead('layers', _('Products', 'المنتجات'), {n:v.length})}<div class="pcards">${v.map(projectCard).join('')}</div></section>${trajPanel()}${methodPanel()}</div>`;
}
function msTab() {
  const ms = MILESTONES.filter(m => inProject(m.proj));
  const cls = {warn:['At risk','في خطر','b-warn'], ok:['On track','على المسار','b-ok'], info:['Planned','مخطط','b-info'], unk:['Date unconfirmed','موعد غير مؤكد','b-unk']};
  return `<section class="panel">${panelHead('flag', _('Strategic milestones', 'المعالم الاستراتيجية'), {n:ms.length})}<div class="scroll-x"><table class="tbl"><thead><tr><th>${_('Date', 'التاريخ')}</th><th>${_('Milestone', 'المعلم')}</th><th>${_('Product', 'المنتج')}</th><th>${_('Status', 'الحالة')}</th><th>${_('Note', 'ملاحظة')}</th></tr></thead><tbody>${ms.map(m => `<tr><td class="num">${dateStr(m.d)}</td><td><b>${l(m.t)}</b></td><td>${pTag(m.proj)}</td><td>${badge(cls[m.st][2], l(cls[m.st].slice(0, 2)))}</td><td class="mut">${l(m.note)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function risksTab() {
  const rs = RISKS.filter(r => inProject(r.proj));
  return `<section class="panel">${panelHead('alert', _('Open risks', 'المخاطر المفتوحة'), {n:rs.length})}<div class="scroll-x"><table class="tbl"><thead><tr><th>${_('Risk', 'الخطر')}</th><th>${_('Product', 'المنتج')}</th><th>${_('Level', 'المستوى')}</th><th>${_('Owner', 'المسؤول')}</th><th>${_('Source', 'المصدر')}</th></tr></thead><tbody>${rs.map(r => `<tr><td><b>${l(r.t)}</b><div class="row wrap" style="margin-top:6px">${r.blk ? badge('b-crit', _('Blocker', 'عائق')) : ''}${r.unk ? badge('b-unk', _('Cause unknown', 'السبب مجهول'), 'help') : ''}</div></td><td>${pTag(r.proj)}</td><td>${badge(LV[r.lvl][2], l(LV[r.lvl].slice(0, 2)))}</td><td>${l(r.own)}</td><td class="mut">${l(r.src)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function depsTab() {
  const ds = DEPS.filter(d => inProject(d.from) || inProject(d.to));
  const cls = {unk:['b-unk','help'], warn:['b-warn','alert'], ok:['b-ok','check'], info:['b-info','info']};
  return `<section class="panel">${panelHead('link', _('Dependencies between products', 'الاعتمادات بين المنتجات'), {n:ds.length})}<div class="scroll-x"><table class="tbl"><thead><tr><th>${_('From → to', 'من ← إلى')}</th><th>${_('What depends on what', 'ما يعتمد على ماذا')}</th><th>${_('Health', 'الحالة')}</th></tr></thead><tbody>${ds.map(d => `<tr><td style="white-space:nowrap">${esc(l(PROJECTS[d.from].name))} <span aria-hidden="true">${icon('arrow', 'sm flip')}</span> ${esc(l(PROJECTS[d.to].name))}</td><td>${l(d.t)}</td><td>${badge(cls[d.st][0], l(d.note), cls[d.st][1])}</td></tr>`).join('')}</tbody></table></div></section>`;
}

SCREENS.portfolio = () => {
  const t = S.tab.portfolio;
  const rc = RISKS.filter(r => inProject(r.proj)).length, mc = MILESTONES.filter(m => inProject(m.proj)).length, dc = DEPS.filter(d => inProject(d.from) || inProject(d.to)).length;
  return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Portfolio', 'المحفظة')}])}
  <div class="page-head"><div><h1>${_('Company Portfolio', 'محفظة الشركة')}</h1><p class="lede">${_('Products, milestones and dependencies across Kemetra Labs, with engineering and business context side by side.', 'المنتجات والمعالم والاعتمادات في Kemetra Labs، مع السياق الهندسي والتجاري جنبًا إلى جنب.')}</p></div>
    <span class="badge b-gold">${icon('calendar')}${_('Q4 2026 · as of Nov 15', 'الربع الرابع 2026 · حتى 15 نوفمبر')}</span></div>
  ${portKpis()}
  ${tabsHTML('portfolio', [['products', _('Products', 'المنتجات')], ['milestones', _('Milestones', 'المعالم'), mc], ['risks', _('Risks', 'المخاطر'), rc], ['deps', _('Dependencies', 'الاعتمادات'), dc]])}
  <div role="tabpanel" aria-labelledby="tab-portfolio-${t}">${{products:productsTab, milestones:msTab, risks:risksTab, deps:depsTab}[t]()}</div>`;
};

/* ---------- product drawer ---------- */
DRAWERS.product = id => {
  const p = PROJECTS[id], st = effStatus(p), biz = S.persona === 'biz';
  const decs = S.dec.filter(d => d.proj === id && d.st !== 'decided'), invs = Object.values(INVESTIGATIONS).filter(v => v.proj === id);
  const risks = RISKS.filter(r => r.proj === id), deps = DEPS.filter(d => d.from === id || d.to === id);
  const engBody = st === 'unavailable' ? stateBox('unk', 'help', _('No telemetry read', 'لا قياسات مقروءة'), _('Engineering health is unknown. It is not shown as healthy.', 'الصحة الهندسية غير معروفة. لا تُعرض كسليمة.'))
    : biz ? `<p>${l(p.plain)}</p>` : `<p>${l(p.eng)}</p><p class="sub" style="margin-top:6px">${l(p.focus)} · ${p.ver} ${S.src === 'stale' ? '· ' + _('9 h old', 'عمرها 9 س') : ''}</p>`;
  return {
    title:`<span class="row" style="gap:12px"><span class="glyph ${p.tone}">${icon(p.icon, 'lg')}</span><span>${esc(l(p.name))}<small style="display:block;font-size:13px;font-weight:400;color:var(--ink-2)">${l(p.desc)}</small></span></span>`,
    sub:statusBadge(st) + demoTag(),
    body:`
    <div class="sec"><h3>${_('Milestones', 'المعالم')}</h3><div class="pb ${st === 'unavailable' ? 'unk' : ''}"><i style="width:${Math.round(p.ms.done / p.ms.total * 100)}%"></i></div>
      <div class="row sb"><span class="num"><b>${p.ms.done}</b> / ${p.ms.total} ${_('done', 'منجزة')}</span><span class="mut">${l(p.next)}</span></div>
      <p class="sub">${l(DEF_MS)}</p></div>
    <div class="sec"><h3>${_('Engineering context', 'السياق الهندسي')}</h3>${engBody}</div>
    <div class="sec"><h3>${_('Business context', 'السياق التجاري')}</h3><p>${l(p.biz)}</p></div>
    <div class="sec"><h3>${_('Risks', 'المخاطر')} (${risks.length})</h3><ul class="sig">${risks.map(r => `<li>${sevDot(r.unk ? 'unk' : r.lvl === 'high' ? 'crit' : 'warn')}<div><b>${l(r.t)}</b><div class="l"><span class="mut">${l(r.own)}</span></div></div>${badge(LV[r.lvl][2], l(LV[r.lvl].slice(0, 2)))}</li>`).join('')}</ul></div>
    <div class="sec"><h3>${_('Dependencies', 'الاعتمادات')} (${deps.length})</h3><ul class="sig">${deps.map(d => `<li>${sevDot(d.st)}<div><b>${l(d.t)}</b><div class="l"><span class="mut">${l(d.note)}</span></div></div><span></span></li>`).join('')}</ul></div>
    <div class="sec"><h3>${_('Linked work', 'العمل المرتبط')}</h3><div class="chips">
      ${id === 'rt' ? `<button class="chip" data-act="gonet">${icon('store', 'sm')}${_('Customers & Branches', 'العملاء والفروع')}</button>` : ''}
      ${decs.map(d => `<button class="chip" data-act="opendec" data-id="${d.id}">${icon('decide', 'sm')}${esc(d.id)} · ${esc(l(d.t).slice(0, 34))}…</button>`).join('')}
      ${can('raw') ? invs.map(v => `<button class="chip" data-act="openinv" data-id="${v.id}">${icon('search', 'sm')}${v.id}</button>`).join('') : ''}
      ${!decs.length && !invs.length ? `<span class="mut">${_('Nothing linked in the demo.', 'لا شيء مرتبط في العرض التجريبي.')}</span>` : ''}</div></div>`
  };
};

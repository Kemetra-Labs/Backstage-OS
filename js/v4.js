/* v4: fixes from the independent finish review. Overrides earlier definitions (same global names).
   All figures remain demo data. */

/* ---------- Investigation Room as a reference-5 HUD ---------- */
const WARPOS = {
  'INV-418':{pos:[120, 250], sync:[380, 250], br:[625, 105], inv:[640, 255], rep:[620, 405], q:[380, 425], db:[150, 432]},
  'INV-411':{api:[140, 260], qe:[380, 260], wh:[620, 140], ca:[620, 390]}
};
const HUDC = {crit:'#FF6B5E', warn:'#F4B64B', ok:'#4FB3FF', unk:'#8E9CB0'};
function cubeGlyph(cx, cy, s, st) {
  const c = HUDC[st], k = .866 * s;
  const top = `${cx},${cy - s} ${cx + k},${cy - s / 2} ${cx},${cy} ${cx - k},${cy - s / 2}`;
  const left = `${cx - k},${cy - s / 2} ${cx},${cy} ${cx},${cy + s} ${cx - k},${cy + s / 2}`;
  const right = `${cx},${cy} ${cx + k},${cy - s / 2} ${cx + k},${cy + s / 2} ${cx},${cy + s}`;
  const dash = st === 'unk' ? 'stroke-dasharray="3 3"' : '';
  return `<g class="cube ${st}" style="color:${c}">
    <polygon points="${top}" fill="${c}" fill-opacity="${st === 'unk' ? .08 : .34}" stroke="${c}" stroke-width="1.4" ${dash}/>
    <polygon points="${left}" fill="${c}" fill-opacity="${st === 'unk' ? .05 : .2}" stroke="${c}" stroke-width="1.4" ${dash}/>
    <polygon points="${right}" fill="${c}" fill-opacity="${st === 'unk' ? .03 : .1}" stroke="${c}" stroke-width="1.4" ${dash}/>
    <polygon points="${cx},${cy - s * .45} ${cx + k * .45},${cy - s * .22} ${cx},${cy} ${cx - k * .45},${cy - s * .22}" fill="none" stroke="${c}" stroke-opacity=".7"/></g>`;
}
mapSVG = function (v) {
  const P = WARPOS[v.id] || {}, W = 760, H = 520, R = 40;
  const NV = v.nodes.map(effNode), byId = Object.fromEntries(NV.map(n => [n.id, n])), down = S.src === 'down';
  const pos = id => P[id] || [byId[id].x + 70, byId[id].y + 30];
  let edges = '', labels = '';
  v.edges.forEach(e => {
    const [ax, ay] = pos(e[0]), [bx, by] = pos(e[1]), dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const x1 = ax + dx / L * R, y1 = ay + dy / L * R, x2 = bx - dx / L * (R + 6), y2 = by - dy / L * (R + 6);
    const st = e[3] && !down ? 'crit' : byId[e[1]].s, col = HUDC[st];
    edges += `<line class="hedge ${e[3] && !down ? 'hot' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="color:${col}" stroke="currentColor" ${e[2] === 'inf' ? 'stroke-dasharray="6 6"' : ''} marker-end="url(#ah-${st})"/>`;
    if (e[4] != null) { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; labels += `<g><rect x="${mx - 21}" y="${my - 10}" width="42" height="20" rx="10" fill="#07101C" stroke="${col}" stroke-opacity=".7"/><text class="hlab" x="${mx}" y="${my + 4.5}" text-anchor="middle" style="fill:${col}">${e[4].toFixed(2)}</text></g>`; }
  });
  const marks = Object.entries(HUDC).map(([k, c]) => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="${c}"/></marker>`).join('');
  const nodes = NV.map(n => {
    const [cx, cy] = pos(n.id), sel = S.node === n.id;
    return `<g class="hnode ${n.s} ${sel ? 'sel' : ''} nd" tabindex="0" role="button" aria-pressed="${sel}" data-act="node" data-id="${n.id}" aria-label="${esc(l(n.n))}: ${esc(l(n.st))}">
      <circle cx="${cx}" cy="${cy + 6}" r="54" fill="transparent"/>${sel ? `<ellipse cx="${cx}" cy="${cy + 30}" rx="40" ry="11" fill="none" stroke="#DDAA57" stroke-width="2"/>` : ''}
      ${cubeGlyph(cx, cy - 8, 24, n.s)}
      <text class="hname" x="${cx}" y="${cy + 36}" text-anchor="middle">${esc(l(n.n))}</text><text class="hst" x="${cx}" y="${cy + 52}" text-anchor="middle" style="fill:${HUDC[n.s]}">${esc(l(n.st))}</text></g>`;
  }).join('');
  return `<svg viewBox="40 55 700 450" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${_('Service dependency graph', 'مخطط اعتماد الخدمات')}"><defs>${marks}</defs>${edges}${labels}${nodes}</svg>`;
};
warGraph = function (v) {
  if (!v.nodes.length) return `<section class="panel hudp" style="height:100%">${panelHead('branch', _('Live dependency graph', 'مخطط الاعتماد'))}${stateBox('unk', 'help', _('No graph available', 'لا مخطط متاح'), _('The affected service is not known because no source could be read. Nothing is drawn rather than guessing.', 'الخدمة المتأثرة غير معروفة لأن أي مصدر لم يُقرأ. لا يُرسم شيء بدل التخمين.'))}</section>`;
  const n0 = v.nodes.find(x => x.id === S.node), n = n0 && effNode(n0), e = n && n.ev ? EVIDENCE[n.ev] : null;
  const detail = n ? `<div class="node-detail"><div><span>${_('Service', 'الخدمة')}</span><b>${esc(l(n.n))}</b></div><div><span>${_('Status', 'الحالة')}</span><b>${esc(l(n.st))}</b></div><div><span>${_('Owner', 'المسؤول')}</span><b>${esc(l(n.own))}</b></div><div><span>${_('Evidence', 'الدليل')}</span>${e ? `<button class="btn-link" data-act="evopen" data-id="${n.ev}">${n.ev} · ${_('Inspect', 'فحص')}</button>` : `<b class="mut">${_('None read', 'لا شيء مقروء')}</b>`}</div></div>` : '';
  return `<section class="panel hudp hgraph" aria-labelledby="h-map">${panelHead('branch', `<span id="h-map">${_('Live dependency graph', 'مخطط الاعتماد المباشر')}</span>`, {right:`<span class="hudk">${_('Edge label: confidence', 'وسم الحافة: الثقة')}</span>`})}
    <div class="hlegend"><span><i style="background:${HUDC.ok}"></i>${_('Healthy', 'سليم')}</span><span><i style="background:${HUDC.warn}"></i>${_('Degraded', 'متدهور')}</span><span><i style="background:${HUDC.crit}"></i>${_('Down or suspected', 'معطل أو مشتبه')}</span><span><i class="u"></i>${_('Unknown', 'غير معروف')}</span><span><b class="dl"></b>${_('Inferred link', 'رابط مستنتَج')}</span></div>
    <div class="map hudgrid">${mapSVG(v)}</div>${detail || `<p class="sub" style="margin-top:10px">${_('Select a service to see its status, owner and evidence.', 'اختر خدمة لرؤية حالتها ومسؤولها وأدلتها.')}</p>`}</section>`;
};
warWhy = function (v) {
  const w = v.evw || {}, ks = Object.keys(w).sort((a, b) => w[b] - w[a]);
  return `<section class="panel hudp" aria-labelledby="h-why">${panelHead('file', `<span id="h-why">${_('Evidence links (why)', 'روابط الأدلة (لماذا)')}</span>`, {n:ks.length})}
    ${ks.length ? `<ul class="evlist why">${ks.map(k => { const e = EVIDENCE[k]; return `<li><button class="rowbtn" data-act="evopen" data-id="${k}"><div class="why-r"><span class="hudk">${k}</span><span class="why-t">${l(e.t)}</span><b class="num">${w[k].toFixed(2)}</b><span class="mut" style="font-size:12px">${freshTag(e.age)}</span></div></button></li>`; }).join('')}</ul><p class="sub" style="margin-top:8px;font-size:12px">${_('Ordered by weight: how strongly each item supports the top hypothesis.', 'مرتبة بالوزن: مدى دعم كل عنصر للفرضية الأولى.')}</p>`
      : stateBox('unk', 'help', _('No evidence read', 'لا أدلة مقروءة'), _('This investigation has no readable source yet.', 'لا مصدر قابل للقراءة لهذا التحقيق بعد.'))}</section>`;
};
warStatus = function (v) {
  const st = INVST[v.status], top = v.hyp && v.hyp[0] ? v.hyp[0].c : null;
  return `<div class="statbar hudbar" role="group" aria-label="${_('Investigation status', 'حالة التحقيق')}">
    <div><span>${_('STATUS', 'الحالة')}</span><b class="${v.empty ? 'unk' : 'st-on'}">${l(st.slice(0, 2)).toUpperCase()}</b></div>
    <div><span>${_('TIME TO DETECTION', 'زمن الاكتشاف')}</span><b class="num">${v.detect || '—'}</b></div>
    <div><span>${_('TIME TO ACK', 'زمن الإقرار')}</span><b class="num">${v.ack || '—'}</b></div>
    <div class="wide"><span>${_('AI CONFIDENCE (INFERRED)', 'ثقة الذكاء الاصطناعي (مستنتجة)')}</span><div class="row"><div class="pb gold" style="flex:1"><i style="width:${top || 0}%"></i></div><b class="num">${top == null ? '?' : (top / 100).toFixed(2)}</b></div></div>
    <div class="dm">${demoTag()}</div></div>`;
};
overviewTab = function (v) {
  const hud = s => s.replace(/class="panel( violet| gold)?/, m => m + ' hudp');
  return `<div class="hud">
    <div class="hud-l">${hud(warCore(v))}${hud(warHyp(v))}${warWhy(v)}</div>
    <div class="hud-c">${warGraph(v)}</div>
    <div class="hud-r">${hud(warOwn(v))}${hud(warChanges(v))}${hud(warBlast(v))}${hud(warActions(v))}</div>
    <div class="hud-tl">${hud(warTimeline(v))}</div>
    <div class="hud-oi">${hud(oiPanel(v).replace('panel c8', 'panel'))}</div>
    <div class="hud-st">${warStatus(v)}</div></div>`;
};

/* ---------- Home: reference-2 order, painted planet hero, card fidelity ---------- */
projectCard = function (p) {
  const st = effStatus(p), pct = Math.round(p.ms.done / p.ms.total * 100), unk = st === 'unavailable';
  const tone = {rt:'var(--gold)', kh:'var(--teal)', se:'var(--blue)'}[p.id], stc = {review:'var(--amber)', stale:'var(--amber)', unavailable:'var(--unk)', planning:'var(--blue)', ok:'var(--green)'}[st];
  return `<button class="pcard" data-st="${st}" data-act="product" data-id="${p.id}" aria-label="${esc(l(p.name))}: ${l(STATUS[st].slice(0, 2))}">
    <div class="t"><span class="glyph ${p.tone}">${icon(p.icon, 'lg')}</span><div><h3>${esc(l(p.name))}</h3><p>${l(p.desc)}</p></div>${statusBadge(st)}</div>
    <div><div class="pb ${unk ? 'unk' : ''}" role="img" aria-label="${p.ms.done} / ${p.ms.total}"><i style="width:${pct}%;${unk ? '' : 'background:' + tone}"></i></div>
      <div class="cap" style="margin-top:6px"><span>${_('Milestones done', 'المعالم المنجزة')}</span><span class="num"><strong style="color:var(--ink)">${p.ms.done}</strong> / ${p.ms.total}</span></div></div>
    <div class="kv kvd"><div><span>${_('Status', 'الحالة')}</span><b style="color:${stc}">${l(STATUS[st].slice(0, 2))}</b></div><div><span>${_('Focus', 'التركيز')}</span><b>${l(p.focus)}</b></div><div><span>${_('Key item', 'البند الرئيسي')}</span><b>${l(p.key)}</b></div></div></button>`;
};
inboxPanel = function () {
  const items = pending().filter(d => inProject(d.proj)).sort((a, b) => a.p - b.p).slice(0, 3), total = pending().filter(d => inProject(d.proj)).length;
  const body = items.length ? items.map(d => `<div class="irow p${d.p}"><div style="min-width:0"><div class="row wrap" style="gap:8px"><h3>${l(d.t)}</h3></div><p class="reason">${_('Reason: ', 'السبب: ')}${l(d.why)}</p>
      <div class="m"><span>${icon('layers', 'sm')}${esc(l(PROJECTS[d.proj].name))}</span><span>${icon('clock', 'sm')}${_('Est. decision: about', 'القرار التقديري: نحو')} ${d.est} ${_('min', 'دقيقة')}</span></div></div>
      <div class="ir-r">${d.p === 1 ? badge('b-crit', _('Decision required', 'قرار مطلوب'), 'alert') : badge('b-warn', _('Needs review', 'يحتاج مراجعة'), 'alert')}<button class="btn teal-o" data-act="opendec" data-id="${d.id}">${S.persona === 'owner' ? _('Review', 'مراجعة') : _('View', 'عرض')}${icon('arrow', 'sm flip')}</button></div></div>`).join('')
    : stateBox('', 'checkc', _('Nothing waiting', 'لا شيء بانتظارك'), _('No decision is pending for this project. New requests appear here.', 'لا قرار معلّق لهذا المشروع. تظهر الطلبات الجديدة هنا.'));
  return `<section class="panel c8" aria-labelledby="h-inbox">${panelHead('decide', `<span id="h-inbox">${_('Decision Inbox', 'صندوق القرارات')}</span>`, {n:total, right:`<button class="btn-link" data-act="nav" data-id="decisions">${_('View all', 'عرض الكل')}${icon('chev', 'sm flip')}</button>`})}<div class="ilist">${body}</div></section>`;
};
SCREENS.home = () => {
  const names = {owner:['Commander', 'أيها القائد'], tech:['Engineer', 'أيها المهندس'], biz:['Team', 'أيها الفريق']};
  const date = S.lang === 'ar' ? 'الأحد، 15 نوفمبر 2026' : 'Sun, Nov 15, 2026', eng = S.persona === 'tech';
  return `<div class="hero"><div class="planet" aria-hidden="true"><i class="sun"></i></div><div class="stars"></div>
    <div class="date">${icon('calendar', 'sm')}${date}</div>
    <h1>${_('Good morning,', 'صباح الخير،')} <em>${l(names[S.persona])}</em></h1>
    <p class="lede">${_('Management and engineering. One operational picture.', 'الإدارة والهندسة. صورة تشغيلية واحدة.')}</p></div>
  <div class="grid">${eng ? signalsPanel(true) + briefPanel(false) : briefPanel(true) + signalsPanel(false)}
    ${projectsPanel()}${inboxPanel()}${chiefPanel()}${homeTraj()}${focusPanel()}${risksPanel()}${msPanel()}</div>`;
};

/* ---------- Portfolio: ring in the KPI row, footer stats, info popover ---------- */
const PSTATS = {rt:[24, 6, 2], kh:[16, 4, 1], se:[12, 3, 1]};
portKpis = function () {
  const v = visProjects(), ms = v.reduce((a, p) => ({d:a.d + p.ms.done, t:a.t + p.ms.total}), {d:0, t:0});
  const risks = RISKS.filter(r => inProject(r.proj)), deps = DEPS.filter(d => inProject(d.from) || inProject(d.to));
  const hi = risks.filter(r => r.lvl === 'high').length, unk = deps.filter(d => d.st === 'unk').length, R = 19, C = 2 * Math.PI * R, pct = ms.t ? ms.d / ms.t : 0;
  return `<div class="row sb wrap" style="margin-bottom:10px;gap:10px">${demoTag()}<details class="howm"><summary>${icon('info', 'sm')}${_('How progress and health are measured', 'كيف يُقاس التقدم والصحة')}</summary><div class="howm-b"><p><b>${_('Progress', 'التقدم')}</b> · ${l(DEF_MS)}</p><p><b>${_('Health', 'الصحة')}</b> · ${_('From build status, open blockers and data freshness. With no source read, health is unknown, never green.', 'من حالة البناء والعوائق المفتوحة وحداثة البيانات. عند غياب المصدر تكون الصحة غير معروفة وليست خضراء.')}</p></div></details></div>
  <div class="kpis">
    <div class="kpi">${icon('layers')}<div><b class="num">${v.length}</b><span>${_('Products in scope', 'منتجات ضمن النطاق')}</span><span class="why">${_('Q4 2026', 'الربع الرابع 2026')}</span></div></div>
    <div class="kpi"><svg class="kring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="5"/><circle cx="24" cy="24" r="${R}" fill="none" stroke="var(--teal)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${pct * C} ${C}" transform="rotate(-90 24 24)"/></svg><div><b class="num">${ms.d}<small> / ${ms.t}</small></b><span>${_('Milestones done', 'معالم منجزة')}</span><span class="why">${_('Done ÷ planned', 'منجزة ÷ مخططة')}</span></div></div>
    <div class="kpi crit">${icon('alert')}<div><b class="num">${risks.length}</b><span>${_('Open risks', 'مخاطر مفتوحة')}</span><span class="why">${hi} ${_('high', 'عالية')}</span></div></div>
    <div class="kpi gold">${icon('link')}<div><b class="num">${deps.length}</b><span>${_('Dependencies', 'اعتمادات')}</span><span class="why">${unk} ${_('with unknown health', 'بحالة غير معروفة')}</span></div></div></div>`;
};
richCard = function (p) {
  const s = PSTATS[p.id], foot = `<div class="pfoot"><span>${icon('alert', 'sm')}<b class="num">${s[0]}</b> ${_('open issues', 'مشكلة مفتوحة')}</span><span>${icon('branch', 'sm')}<b class="num">${s[1]}</b> ${_('PRs', 'طلبات سحب')}</span><span style="color:var(--coral)">${icon('alert', 'sm')}<b class="num">${s[2]}</b> ${_('risks', 'مخاطر')}</span></div>`;
  return projectCard(p).replace(/^(<button class="pcard)([^>]*>)/, `$1 rich$2${sceneSVG(p.id)}`).replace(/<\/button>$/, foot + '</button>');
};
productsTab = function () {
  const v = visProjects();
  return `<div class="grid"><section class="panel c12" aria-label="${_('Products', 'المنتجات')}">${panelHead('layers', _('Products', 'المنتجات'), {n:v.length})}<div class="pcards">${v.map(richCard).join('')}</div></section>
    ${trajPanel().replace('panel c7', 'panel c12')}</div>`;
};

/* ---------- Decisions: no repeated status pill, one-line meta ---------- */
dCard = function (d) {
  const s = DST[dstate(d)], di = {D1:'rocket', D2:'activity', D3:'calendar', D4:'cpu', D5:'dollar', D8:'scale', D6:'layers', D7:'globe', D9:'search'};
  const showSt = S.tab.dec === 'all';
  return `<button class="dcard" data-act="dsel" data-id="${d.id}" aria-current="${S.dsel === d.id}"><span class="dtile p${d.p}">${icon(di[d.id] || 'decide', 'lg')}</span>
    <div style="min-width:0"><h3>${l(d.t)}</h3><div class="m one"><span class="pri p${d.p}" aria-label="${_('Priority', 'الأولوية')} ${d.p}">P${d.p}</span>${showSt ? badge(s[2], l(s.slice(0, 2)), s[3]) : ''}<span>${esc(l(PROJECTS[d.proj].name))}</span><span>${icon('calendar', 'sm')} ${l(d.due)}</span></div></div></button>`;
};

/* ---------- Agents: dense rows, read-only stated once, Current executions panel ---------- */
agentRow = function (a) {
  const s = agState(a), st = AST[s.st];
  return `<button class="arow dense" data-act="agent" data-id="${a.id}"><span class="ag glow ${a.mode === 'exec' ? 'off' : 't-' + a.id}">${icon(a.icon, 'lg')}</span>
    <div style="min-width:0"><h3>${l(a.n)} <span class="mut" style="font-weight:500">(${l(a.role)})</span></h3><div class="m" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l(s.task))}</div></div>
    <div class="row">${a.mode !== 'read' ? badge(MODE[a.mode][2], l(MODE[a.mode].slice(0, 2)), MODE[a.mode][3]) : ''}${badge(st[2], l(st.slice(0, 2)))}${icon('chev', 'flip')}</div></button>`;
};
function execPanel() {
  const run = AGENTS.filter(a => ['running', 'approval'].includes(agState(a).st));
  return `<section class="panel" aria-labelledby="h-ex">${panelHead('play', `<span id="h-ex">${_('Current executions', 'التنفيذات الحالية')}</span>`, {n:run.length})}
    ${run.length ? `<ul class="exl">${run.map(a => { const s = agState(a); return `<li><span class="ag glow t-${a.id}" style="width:32px;height:32px;border-radius:9px">${icon(a.icon, 'sm')}</span><div style="min-width:0"><b>${esc(l(s.task))}</b><div class="prog" style="margin-top:6px"><i data-prog="${a.id}" style="width:${s.prog}%"></i></div></div><span class="num mut">${s.st === 'approval' ? _('Approval', 'موافقة') : s.prog + '%'}</span></li>`; }).join('')}</ul>`
      : stateBox('', 'play', _('Nothing running', 'لا شيء قيد التشغيل'), _('No simulated task is running. Start one from the button above.', 'لا مهمة محاكاة قيد التشغيل. ابدأ واحدة من الزر أعلاه.'))}</section>`;
}
(function () {
  const base = SCREENS.agents;
  SCREENS.agents = () => base()
    .replace('<div class="c5" style="display:grid;gap:20px;align-content:start">', '<div class="c5" style="display:grid;gap:20px;align-content:start">' + execPanel())
    .replace('<div class="invlist">', `<p class="sub" style="margin:-6px 0 12px">${icon('eye', 'sm')} ${_('Analysis agents are read-only. Only Ops Watch can propose a change, and a person approves it.', 'وكلاء التحليل للقراءة فقط. مراقب التشغيل وحده يقترح تغييرًا ويعتمده شخص.')}</p><div class="invlist">`);
})();

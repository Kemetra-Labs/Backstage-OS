/* Investigation Room, cinematic rework (reference image 5, "AI-assisted SRE triage"), adapted for Mission Control:
   reasoning core + hypotheses + evidence weights | live dependency graph | ownership, changes, blast radius, next actions,
   incident timeline and a status bar. Everything is demo data. The "reasoning core" is a SIMULATED read-only agent.
   Later definitions replace the earlier ones from investigation.js (same global names). */
const WAR_ICON = {pos:'store', sync:'refresh', br:'branch', inv:'layers', rep:'bars', q:'server', db:'db', api:'activity', qe:'cpu', wh:'db', ca:'zap'};
const WAR_LV = {high:['High','عالٍ','b-crit'], med:['Medium','متوسط','b-warn'], low:['Low','منخفض','b-teal'], unk:['Unknown','غير معروف','b-unk']};

function warStrip(list) {
  const items = list.length ? list.map(v => `<button class="inv" data-act="invsel" data-id="${v.id}" aria-current="${S.inv === v.id}">
      <div class="row sb">${badge(SEV[v.sev][2], l(SEV[v.sev].slice(0, 2)))}<span class="mut num" style="font-size:12px">${v.id}</span></div>
      <h3>${l(v.t)}</h3><div class="m"><span>${esc(l(PROJECTS[v.proj].name))}</span><span>${ago(v.started)}</span></div></button>`).join('')
    : `<div style="grid-column:1/-1">${stateBox('', 'search', _('No investigations match', 'لا تحقيقات مطابقة'), _('Nothing matches this filter. Clear it to see every investigation.', 'لا شيء يطابق هذا المرشح. امسحه لرؤية كل التحقيقات.'), `<button class="btn sm" data-act="invclear">${_('Clear filters', 'مسح المرشحات')}</button>`)}</div>`;
  const chips = list.length ? list.map(v => `<button class="ichip" data-act="invsel" data-id="${v.id}" aria-current="${S.inv === v.id}">${sevDot(v.sev === 'high' ? 'crit' : 'warn')}<span class="num">${v.id}</span><span class="ichip-t">${l(v.t)}</span></button>`).join('')
    : `<span class="mut" style="font-size:13px">${_('No investigation matches. Clear the filter to see them all.', 'لا تحقيق مطابق. امسح المرشح لرؤيتها كلها.')} <button class="btn-link" data-act="invclear">${_('Clear filters', 'مسح المرشحات')}</button></span>`;
  return `<div class="invbar" role="group" aria-label="${_('Active and recent investigations', 'التحقيقات النشطة والأخيرة')}"><div class="invchips">${chips}</div>
    <div class="row wrap"><label class="search" style="max-width:220px;height:34px;cursor:text">${icon('search', 'sm')}<span class="sr">${_('Filter investigations', 'تصفية التحقيقات')}</span><input data-inp="invq" id="invq" type="text" value="${esc(S.invq)}" placeholder="${_('Filter by title or ID', 'صفِّ بالعنوان أو الرقم')}" style="background:transparent;border:0;outline:0;flex:1;min-width:0;font-size:13px"></label>
    <div class="pills" role="group" aria-label="${_('Severity', 'الخطورة')}">${[['all', _('All', 'الكل')], ['high', _('High', 'عالٍ')], ['med', _('Medium', 'متوسط')]].map(p => `<button class="pill" data-act="invsev" data-v="${p[0]}" aria-pressed="${S.invsev === p[0]}">${p[1]}</button>`).join('')}</div></div></div>`;
}

/* glowing reasoning core (SVG, simulated agent) */
function coreSVG() {
  const dots = [[110, 28], [176, 66], [176, 144], [110, 182], [44, 144], [44, 66], [110, 104]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#CFF6FF"/>`).join('');
  return `<svg class="core" viewBox="0 0 300 210" role="img" aria-label="${_('Simulated reasoning core', 'نواة استدلال محاكاة')}"><defs>
    <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="cg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#5CC8E8" stop-opacity=".38"/><stop offset="1" stop-color="#5CC8E8" stop-opacity="0"/></radialGradient>
    <linearGradient id="cf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A5EA8" stop-opacity=".55"/><stop offset="1" stop-color="#0B1A30" stop-opacity=".7"/></linearGradient></defs>
    <circle cx="110" cy="105" r="98" fill="url(#cg)"/>
    <g class="stream"><path class="s1" d="M176 84 C 215 70, 245 96, 296 78"/><path class="s2" d="M176 104 C 220 110, 250 100, 296 112"/><path class="s3" d="M176 126 C 212 142, 248 124, 296 146"/></g>
    <g filter="url(#gl)" fill="none" stroke="#5CC8E8" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
      <polygon points="110,28 176,66 176,144 110,182 44,144 44,66" fill="url(#cf)"/><polyline points="44,66 110,104 176,66"/><line x1="110" y1="104" x2="110" y2="182"/>
      <g stroke="#9FE3F5" stroke-width="1" opacity=".85"><polygon points="110,58 142,77 142,115 110,134 78,115 78,77"/><polyline points="78,77 110,96 142,77"/><line x1="110" y1="96" x2="110" y2="134"/></g>
      <g stroke="#5CC8E8" stroke-width=".7" opacity=".55"><line x1="110" y1="28" x2="110" y2="58"/><line x1="176" y1="66" x2="142" y2="77"/><line x1="44" y1="66" x2="78" y2="77"/><line x1="110" y1="182" x2="110" y2="134"/><line x1="176" y1="144" x2="142" y2="115"/><line x1="44" y1="144" x2="78" y2="115"/></g></g>${dots}</svg>`;
}
function confRing(c) {
  const R = 34, C = 2 * Math.PI * R, d = (c || 0) / 100 * C;
  return `<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="${_('Confidence', 'الثقة')} ${c == null ? _('unknown', 'غير معروفة') : c + '%'}"><circle cx="42" cy="42" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>
    ${c == null ? `<circle cx="42" cy="42" r="${R}" fill="none" stroke="#9AA7B8" stroke-width="3" stroke-dasharray="3 6"/>` : `<circle cx="42" cy="42" r="${R}" fill="none" stroke="${c >= 70 ? '#DDAA57' : '#9280CF'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${d} ${C}" transform="rotate(-90 42 42)"/>`}
    <text x="42" y="47" text-anchor="middle" style="fill:#EAF0F8;font:700 17px var(--f-ui)">${c == null ? '?' : c + '%'}</text></svg>`;
}
function warCore(v) {
  const top = (v.hyp && v.hyp[0]) ? v.hyp[0].c : null;
  const lbl = top == null ? _('Unknown', 'غير معروف') : top >= 70 ? _('Moderate to high', 'متوسطة إلى عالية') : _('Low', 'منخفضة');
  return `<section class="panel violet" aria-labelledby="h-core">${panelHead('bot', `<span id="h-core">${_('Reasoning core', 'نواة الاستدلال')}</span>`, {right:badge('b-ai', _('Simulated', 'محاكاة'))})}
    <div class="row" style="gap:14px;margin-bottom:6px">${confRing(top)}<div><div class="mut" style="font-size:11.5px;font-weight:600;letter-spacing:.06em">${_('TOP HYPOTHESIS CONFIDENCE', 'ثقة الفرضية الأولى')}</div><b style="font-size:15px">${lbl}</b><div class="sub">${top == null ? _('No evidence to reason over', 'لا أدلة للاستدلال عليها') : _('Inferred, not verified', 'استنتاج غير مُتحقَّق')}</div></div></div>
    <div class="coreview">${coreSVG()}</div>
    <ul class="oi" style="padding:0"><li>${icon('activity', 'sm')}<span><b>${_('Reasoning status', 'حالة الاستدلال')}</b><br><span class="sub">${top == null ? _('Waiting for readable sources', 'بانتظار مصادر قابلة للقراءة') : _('Analyzing evidence. Generating hypotheses.', 'تحليل الأدلة وتوليد الفرضيات.')}</span></span></li>
      <li>${icon('target', 'sm')}<span><b>${_('Goal', 'الهدف')}</b><br><span class="sub">${_('Find the likely cause and affected scope. Recommend safe next steps. Never act.', 'إيجاد السبب المرجح والنطاق المتأثر. اقتراح خطوات آمنة. دون تنفيذ.')}</span></span></li></ul></section>`;
}
function warHyp(v) {
  const hs = v.hyp || [];
  const body = hs.length ? hs.map((h, i) => `<div class="hyp"><div class="row sb"><span class="badge b-ai" style="height:22px">H${i + 1}</span><b class="num">${h.c}%</b></div><b style="font-size:13.5px;display:block;margin-top:6px">${l(h.t)}</b><div class="pb gold" style="margin:8px 0 6px;height:5px"><i style="width:${h.c}%;background:linear-gradient(90deg,var(--violet),var(--violet-ink))"></i></div><p class="sub" style="font-size:12.5px">${l(h.d)}</p></div>`).join('')
    : stateBox('unk', 'help', _('No hypotheses', 'لا فرضيات'), _('Nothing was read, so nothing can be inferred. Restore the source and re-read.', 'لم تُقرأ بيانات فلا يمكن استنتاج شيء. أعد ربط المصدر وأعد القراءة.'));
  return `<section class="panel" aria-labelledby="h-hyp">${panelHead('sparkles', `<span id="h-hyp">${_('Hypotheses', 'الفرضيات')}</span>`, {n:hs.length})}<div class="hyps">${body}</div></section>`;
}
function warWhy(v) {
  const w = v.evw || {}, ks = Object.keys(w);
  return `<section class="panel" aria-labelledby="h-why">${panelHead('file', `<span id="h-why">${_('Evidence links (why)', 'روابط الأدلة (لماذا)')}</span>`, {n:ks.length})}
    ${ks.length ? `<ul class="evlist why">${ks.map(k => { const e = EVIDENCE[k]; return `<li><button class="rowbtn" data-act="evopen" data-id="${k}"><div class="why-r"><span class="mut num" style="font-size:12px">${k}</span><span class="why-t">${l(e.t)}</span><b class="num">${w[k].toFixed(2)}</b><span class="mut" style="font-size:12px">${freshTag(e.age)}</span></div></button></li>`; }).join('')}</ul><p class="sub" style="margin-top:8px;font-size:12px">${_('Weight shows how strongly each item supports the top hypothesis. Based on evidence quality, relevance and recency.', 'يبين الوزن مدى دعم كل عنصر للفرضية الأولى. بحسب جودة الدليل وصلته وحداثته.')}</p>`
      : stateBox('unk', 'help', _('No evidence read', 'لا أدلة مقروءة'), _('This investigation has no readable source yet.', 'لا مصدر قابل للقراءة لهذا التحقيق بعد.'))}</section>`;
}

/* graph */
function mapSVG(v) {
  const W = 700, H = 372, h = 60, NN = v.nodes.map(n => ({...n, w:n.w + 34})), byId = Object.fromEntries(NN.map(n => [n.id, n]));
  const anchor = (a, b) => {
    const ac = a.x + a.w / 2, bc = b.x + b.w / 2;
    if (Math.abs(ac - bc) < 40) return b.y > a.y ? [ac, a.y + h, bc, b.y] : [ac, a.y, bc, b.y + h];
    return b.x > a.x ? [a.x + a.w, a.y + h / 2, b.x, b.y + h / 2] : [a.x, a.y + h / 2, b.x + b.w, b.y + h / 2];
  };
  let labels = '';
  const edges = v.edges.map(e => {
    const a = byId[e[0]], b = byId[e[1]], [x1, y1, x2, y2] = anchor(a, b), vert = Math.abs(x1 - x2) < 1, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const d = vert ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    if (e[4] != null) labels += `<g><rect x="${mx - 19}" y="${my - 9}" width="38" height="18" rx="9" fill="#0B1624" stroke="${e[3] ? '#EF6572' : '#2f4562'}"/><text class="el" x="${mx}" y="${my + 4}" text-anchor="middle" style="fill:${e[3] ? '#F7A1A9' : '#B9C5D5'};font-size:11px">${e[4].toFixed(2)}</text></g>`;
    return `<path class="edge ${e[2] === 'inf' ? 'inf' : ''} ${e[3] ? 'hot flow' : ''}" d="${d}"/>`;
  }).join('');
  const nodes = NN.map(n => {
    const sel = S.node === n.id, st = l(n.st), ic = WAR_ICON[n.id] || 'cpu';
    return `<g class="nd ${n.s} ${sel ? 'sel' : ''}" tabindex="0" role="button" aria-pressed="${sel}" data-act="node" data-id="${n.id}" aria-label="${esc(l(n.n))}: ${esc(st)}">
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${h}" rx="12"/>
      <g stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:${{crit:'#F7A1A9', warn:'#F4B64B', ok:'#6FE0B5', unk:'#9AA7B8'}[n.s]}"><use href="#i-${ic}" x="${n.x + 12}" y="${n.y + 18}" width="24" height="24"/></g>
      <text x="${n.x + 46}" y="${n.y + 26}">${esc(l(n.n))}</text><text class="st" x="${n.x + 46}" y="${n.y + 45}">${esc(st)}</text>
      <circle cx="${n.x + n.w - 14}" cy="${n.y + 14}" r="4.5" fill="${{crit:'#EF6572', warn:'#F4B64B', ok:'#24C98B', unk:'none'}[n.s]}" ${n.s === 'unk' ? 'stroke="#9AA7B8" stroke-dasharray="2 2" stroke-width="1.5"' : ''}/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${_('Service dependency graph', 'مخطط اعتماد الخدمات')}">${edges}${labels}${nodes}</svg>`;
}
function warGraph(v) {
  if (!v.nodes.length) return `<section class="panel">${panelHead('branch', _('Live dependency graph', 'مخطط الاعتماد'))}${stateBox('unk', 'help', _('No graph available', 'لا مخطط متاح'), _('The affected service is not known because no source could be read. Nothing is drawn rather than guessing.', 'الخدمة المتأثرة غير معروفة لأن أي مصدر لم يُقرأ. لا يُرسم شيء بدل التخمين.'))}</section>`;
  const n = v.nodes.find(x => x.id === S.node), e = n && n.ev ? EVIDENCE[n.ev] : null;
  const detail = n ? `<div class="node-detail"><div><span>${_('Service', 'الخدمة')}</span><b>${esc(l(n.n))}</b></div><div><span>${_('Status', 'الحالة')}</span><b>${esc(l(n.st))}</b></div><div><span>${_('Owner', 'المسؤول')}</span><b>${esc(l(n.own))}</b></div><div><span>${_('Evidence', 'الدليل')}</span>${e ? `<button class="btn-link" data-act="evopen" data-id="${n.ev}">${n.ev} · ${_('Inspect', 'فحص')}</button>` : `<b class="mut">${_('None read', 'لا شيء مقروء')}</b>`}</div></div>` : `<p class="sub" style="margin-top:12px">${_('Select a service to see its status, owner and evidence.', 'اختر خدمة لرؤية حالتها ومسؤولها وأدلتها.')}</p>`;
  return `<section class="panel" aria-labelledby="h-map">${panelHead('branch', `<span id="h-map">${_('Live dependency graph', 'مخطط الاعتماد المباشر')}</span>`, {right:`<span class="mut" style="font-size:12px">${_('Edge label = confidence', 'وسم الحافة = الثقة')}</span>`})}
    <div class="map cine">${mapSVG(v)}</div>
    <div class="legend"><span><span class="dot d-ok"></span>${_('Healthy', 'سليم')}</span><span><span class="dot d-warn"></span>${_('Degraded', 'متدهور')}</span><span><span class="dot d-crit"></span>${_('Down or suspected', 'معطل أو مشتبه')}</span><span><span class="dot d-unk"></span>${_('Unknown', 'غير معروف')}</span><span><i></i>${_('Observed', 'مرصود')}</span><span><i class="dash"></i>${_('Inferred', 'مستنتَج')}</span></div>${detail}</section>`;
}

/* right rail */
function warOwn(v) {
  const o = v.own || {}, row = (k, val) => `<div><dt>${k}</dt><dd>${val}</dd></div>`;
  return `<section class="panel" aria-labelledby="h-own">${panelHead('users', `<span id="h-own">${_('Ownership context', 'سياق الملكية')}</span>`)}<dl class="own">
    ${row(_('Service', 'الخدمة'), `<span class="num">${esc(o.svc || '—')}</span>`)}${row(_('Team', 'الفريق'), l(o.team || ['—', '—']))}${row(_('On-call', 'المناوب'), `<span class="num">${esc(o.oncall || '—')}</span>`)}
    ${row(_('Escalation', 'التصعيد'), `<span class="num">${esc(o.esc || '—')}</span>`)}${row(_('Schedule', 'الجدول'), l(o.sched || ['—', '—']))}${row(_('Runbook', 'دليل التشغيل'), o.rb && o.rb !== '(none found)' ? sampleBtn(o.rb) : `<span class="mut">${_('None found', 'لا شيء')}</span>`)}</dl></section>`;
}
function warChanges(v) {
  const cs = v.changes || [];
  return `<section class="panel" aria-labelledby="h-chg">${panelHead('history', `<span id="h-chg">${_('Recent changes', 'التغييرات الأخيرة')}</span>`, {n:cs.length})}
    ${cs.length ? `<ul class="sig">${cs.map(c => `<li>${sevDot(c.ago < 200 ? 'warn' : 'info')}<div><b>${l(c.t)}</b><div class="l"><span class="mut">${esc(c.by)}</span></div></div><time>${ago(c.ago)}</time></li>`).join('')}</ul>` : `<p class="mut">${_('No recent changes were read.', 'لم تُقرأ تغييرات حديثة.')}</p>`}</section>`;
}
function warBlast(v) {
  const bl = v.blast || [], hi = bl.some(b => b.lv === 'high');
  return `<section class="panel" aria-labelledby="h-bl">${panelHead('target', `<span id="h-bl">${_('Impacted paths (blast radius)', 'المسارات المتأثرة (نطاق الأثر)')}</span>`)}
    <ul class="blast">${bl.map(b => `<li style="padding-inline-start:${b.d * 18}px"><span class="blw">${b.d ? '<i aria-hidden="true"></i>' : ''}${b.go ? `<button class="btn-link" data-act="${b.go === 'network' ? 'gonet' : ''}">${l(b.t)}</button>` : `<span>${l(b.t)}</span>`}</span>${badge(WAR_LV[b.lv][2], l(WAR_LV[b.lv].slice(0, 2)))}</li>`).join('')}</ul>
    <div class="row sb" style="margin-top:10px"><span class="sub">${_('Blast radius', 'نطاق الأثر')}</span><b style="color:${hi ? 'var(--coral)' : 'var(--ink-2)'}">${hi ? _('HIGH', 'عالٍ') : _('UNKNOWN', 'غير معروف')}</b></div></section>`;
}
function warActions(v) {
  const as = v.actions || [];
  return `<section class="panel gold" aria-labelledby="h-act">${panelHead('send', `<span id="h-act">${_('Recommended next actions', 'الإجراءات التالية الموصى بها')}</span>`)}
    <ol class="acts">${as.map(a => `<li>${l(a)}</li>`).join('')}</ol><div class="notice" style="margin-top:12px">${icon('shield')}<span>${_('Proposals only. A person approves each one in the source system.', 'اقتراحات فقط. يعتمد شخص كل واحد منها في النظام المصدر.')}</span></div></section>`;
}

/* bottom: timeline + status bar */
function warTimeline(v) {
  const ev = v.timeline.slice().sort((a, b) => b.ago - a.ago), k2 = {obs:'info', crit:'crit', warn:'warn', ai:'ai'};
  const t0 = ev.findIndex(e => e.k === 'crit');
  return `<section class="panel" aria-labelledby="h-htl">${panelHead('history', `<span id="h-htl">${_('Incident timeline', 'الجدول الزمني للحادث')}</span>`, {n:ev.length})}
    <div class="scroll-x"><ol class="htl">${ev.map((e, i) => `<li><span class="when ${i === t0 ? 't0' : ''}">${i === t0 ? 'T0' : ago(e.ago)}</span><span class="dotline"><span class="dot d-${k2[e.k]}" aria-hidden="true"></span></span><b>${l(e.t)}</b>${i === t0 ? `<span class="mut" style="font-size:12px">${ago(e.ago)}</span>` : ''}</li>`).join('')}<li><span class="when">${_('Now', 'الآن')}</span><span class="dotline"><span class="dot d-ok" aria-hidden="true"></span></span><b>${_('Investigating', 'قيد التحقيق')}</b></li></ol></div></section>`;
}
function warStatus(v) {
  const st = INVST[v.status], top = v.hyp && v.hyp[0] ? v.hyp[0].c : null;
  return `<div class="statbar" role="group" aria-label="${_('Investigation status', 'حالة التحقيق')}">
    <div><span>${_('STATUS', 'الحالة')}</span><b class="${v.empty ? 'unk' : 'st-on'}">${l(st.slice(0, 2)).toUpperCase()}</b></div>
    <div><span>${_('TIME TO DETECTION', 'زمن الاكتشاف')}</span><b class="num">${v.detect || '—'}</b></div>
    <div><span>${_('TIME TO ACK', 'زمن الإقرار')}</span><b class="num">${v.ack || '—'}</b></div>
    <div class="wide"><span>${_('AI CONFIDENCE', 'ثقة الذكاء الاصطناعي')}</span><div class="row"><div class="pb gold" style="flex:1"><i style="width:${top || 0}%"></i></div><b class="num">${top == null ? '?' : (top / 100).toFixed(2)}</b></div></div></div>`;
}

overviewTab = function (v) {
  const biz = S.persona === 'biz';
  const right = `<div class="warcol">${warOwn(v)}${warChanges(v)}${warBlast(v)}${warActions(v)}</div>`;
  const left = `<div class="warcol">${warCore(v)}${warHyp(v)}${warWhy(v)}</div>`;
  const mid = `<div class="warcol">${warGraph(v)}${oiPanel(v).replace('panel c8', 'panel')}${warTimeline(v)}${warStatus(v)}</div>`;
  return `<div class="war">${left}${mid}${right}</div>
    <div class="grid" style="margin-top:20px">${impactPanel(v).replace('class="c4"', 'class="c4"')}${summaryPanel(v).replace('panel violet c5', 'panel violet c4')}${nextPanel(v).replace('panel gold c5', 'panel gold c4')}</div>`;
};

SCREENS.investigation = () => {
  const list = invList(); let v = INVESTIGATIONS[S.inv];
  if (!v || !list.includes(v)) v = list[0] || null;
  const strip = warStrip(list), bc = id => crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Investigation', 'التحقيق'), act:id ? 'nav' : '', id:'investigation'}].concat(id ? [{t:id}] : []));
  if (!v) return `${bc()}<div class="page-head"><div><h1>${_('Investigation Room', 'غرفة التحقيق')}</h1></div></div>${strip}`;
  S.inv = v.id;
  const st = INVST[v.status], t = S.tab.inv;
  const cell = (k, val) => `<div class="wh-c"><span>${k}</span><b class="num">${val}</b></div>`;
  const head = `<div class="warhead"><div style="min-width:0"><div class="row wrap" style="margin-bottom:6px">${badge(st[2], l(st.slice(0, 2)), st[3])}${v.empty ? '' : badge(SEV[v.sev][2], _('Impact: ', 'الأثر: ') + l(SEV[v.sev].slice(0, 2)))}<span class="chip">${esc(l(PROJECTS[v.proj].name))}</span>${demoTag()}</div><h1>${l(v.t)}</h1></div>
    <div class="wh-cells">${cell(_('INCIDENT', 'الحادث'), v.id)}${cell(_('SEVERITY', 'الخطورة'), v.empty ? '?' : l(SEV[v.sev].slice(0, 2)).toUpperCase())}${cell(_('DURATION', 'المدة'), ago(v.started).replace(/ ago| مضت/, ''))}${cell(_('EVIDENCE', 'الأدلة'), v.ev.length)}</div></div>`;
  const body = {overview:overviewTab, evidence:evidenceTab, timeline:timelineTab, related:relatedTab}[t](v);
  const raw = v.empty ? `<div style="margin-bottom:18px">${stateBox('unk', 'help', _('No evidence was read', 'لم تُقرأ أي أدلة'), _('Monitoring for this service could not be reached. Everything below is unknown, not healthy. Restore the connection, then re-read.', 'تعذّر الوصول إلى مراقبة هذه الخدمة. كل ما يلي غير معروف وليس سليمًا. أعد الاتصال ثم أعد القراءة.'))}</div>` : '';
  return `${bc(v.id)}
  <div class="page-head" style="margin-bottom:12px"><div><h1 style="font-size:clamp(24px,2.2vw,30px)">${_('Investigation Room', 'غرفة التحقيق')}</h1></div><span class="badge b-teal">${icon('eye')}${_('Read-only investigation', 'تحقيق للقراءة فقط')}</span></div>
  ${strip}${head}${raw}
  ${tabsHTML('inv', [['overview', _('Overview', 'نظرة عامة')], ['evidence', _('Evidence', 'الأدلة'), v.ev.length], ['timeline', _('Timeline', 'الجدول الزمني')], ['related', _('Related', 'ذات صلة'), v.related.length]])}
  <div role="tabpanel" aria-labelledby="tab-inv-${t}">${body}</div>`;
};

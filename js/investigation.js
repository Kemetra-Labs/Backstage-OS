/* Screen 03: Investigation Room. A working surface: list, service map, evidence, timeline, next safe action.
   Graph and edge styling follow reference image 5. All data is demo data. */
const SEV = {high:['High','عالٍ','b-crit'], med:['Medium','متوسط','b-warn']};
const INVST = {ongoing:['Ongoing','جارٍ','b-crit','alert'], monitoring:['Monitoring','قيد المراقبة','b-warn','eye'], noevidence:['No evidence read','لا أدلة مقروءة','b-unk','help']};

function invList() {
  const q = S.invq.trim().toLowerCase();
  return Object.values(INVESTIGATIONS).filter(v => inProject(v.proj) && (S.invsev === 'all' || v.sev === S.invsev) && (!q || (l(v.t) + v.id).toLowerCase().includes(q)))
    .sort((a, b) => (a.sev === 'high' ? 0 : 1) - (b.sev === 'high' ? 0 : 1));
}
function invListPanel(list) {
  const items = list.length ? list.map(v => `<button class="inv" data-act="invsel" data-id="${v.id}" aria-current="${S.inv === v.id}">
      <div class="row sb">${badge(SEV[v.sev][2], l(SEV[v.sev].slice(0, 2)))}<span class="mut num" style="font-size:12px">${v.id}</span></div>
      <h3>${l(v.t)}</h3><div class="m"><span>${esc(l(PROJECTS[v.proj].name))}</span><span>${ago(v.started)}</span></div></button>`).join('')
    : stateBox('', 'search', _('No investigations match', 'لا تحقيقات مطابقة'), _('Clear the filters or search for another ID.', 'امسح المرشحات أو ابحث عن رقم آخر.'), `<button class="btn sm" data-act="invclear">${_('Clear filters', 'مسح المرشحات')}</button>`);
  return `<section class="panel tight" aria-labelledby="h-invl">${panelHead('history', `<span id="h-invl">${_('Active and recent', 'النشطة والأخيرة')}</span>`, {nodemo:true})}
    <label class="search" style="max-width:none;height:36px;margin-bottom:10px;cursor:text">${icon('search', 'sm')}<span class="sr">${_('Filter investigations', 'تصفية التحقيقات')}</span><input data-inp="invq" id="invq" type="text" value="${esc(S.invq)}" placeholder="${_('Filter by title or ID', 'صفِّ بالعنوان أو الرقم')}" style="background:transparent;border:0;outline:0;flex:1;min-width:0;font-size:13.5px"></label>
    <div class="pills" role="group" aria-label="${_('Severity', 'الخطورة')}" style="margin-bottom:12px">${[['all', _('All', 'الكل')], ['high', _('High', 'عالٍ')], ['med', _('Medium', 'متوسط')]].map(p => `<button class="pill" data-act="invsev" data-v="${p[0]}" aria-pressed="${S.invsev === p[0]}">${p[1]}</button>`).join('')}</div>
    <div class="invlist">${items}</div></section>`;
}

/* service map */
function mapSVG(v) {
  const W = 680, H = 372, h = 60, NN = v.nodes.map(n => ({...n, w:n.w + 18})), byId = Object.fromEntries(NN.map(n => [n.id, n]));
  const anchor = (a, b) => {
    const ac = a.x + a.w / 2, bc = b.x + b.w / 2;
    if (Math.abs(ac - bc) < 40) return b.y > a.y ? [ac, a.y + h, bc, b.y] : [ac, a.y, bc, b.y + h];
    return b.x > a.x ? [a.x + a.w, a.y + h / 2, b.x, b.y + h / 2] : [a.x, a.y + h / 2, b.x + b.w, b.y + h / 2];
  };
  const edges = v.edges.map(e => {
    const a = byId[e[0]], b = byId[e[1]], [x1, y1, x2, y2] = anchor(a, b), vert = Math.abs(x1 - x2) < 1, mx = (x1 + x2) / 2;
    const d = vert ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    return `<path class="edge ${e[2] === 'inf' ? 'inf' : ''} ${e[3] ? 'hot flow' : ''}" d="${d}"/>`;
  }).join('');
  const nodes = NN.map(n => {
    const sel = S.node === n.id, st = l(n.st);
    return `<g class="nd ${n.s} ${sel ? 'sel' : ''}" tabindex="0" role="button" aria-pressed="${sel}" data-act="node" data-id="${n.id}" aria-label="${esc(l(n.n))}: ${esc(st)}">
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${h}" rx="11"/>
      <text x="${n.x + 14}" y="${n.y + 25}">${esc(l(n.n))}</text><text class="st" x="${n.x + 14}" y="${n.y + 44}">${esc(st)}</text>
      <circle cx="${n.x + n.w - 16}" cy="${n.y + 18}" r="5" fill="${{crit:'#EF6572', warn:'#F4B64B', ok:'#24C98B', unk:'none'}[n.s]}" ${n.s === 'unk' ? 'stroke="#9AA7B8" stroke-dasharray="2 2" stroke-width="1.5"' : ''}/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${_('Service dependency map', 'خريطة اعتماد الخدمات')}">${edges}${nodes}</svg>`;
}
function mapPanel(v) {
  if (!v.nodes.length) return `<section class="panel c8">${panelHead('branch', _('Service dependency map', 'خريطة اعتماد الخدمات'))}${stateBox('unk', 'help', _('No map available', 'لا خريطة متاحة'), _('The affected service is not known because no source could be read. Nothing is drawn rather than guessing.', 'الخدمة المتأثرة غير معروفة لأن أي مصدر لم يُقرأ. لا يُرسم شيء بدل التخمين.'))}</section>`;
  const n = v.nodes.find(x => x.id === S.node), e = n && n.ev ? EVIDENCE[n.ev] : null;
  const detail = n ? `<div class="node-detail"><div><span>${_('Service', 'الخدمة')}</span><b>${esc(l(n.n))}</b></div><div><span>${_('Status', 'الحالة')}</span><b>${esc(l(n.st))}</b></div><div><span>${_('Owner', 'المسؤول')}</span><b>${esc(l(n.own))}</b></div><div><span>${_('Evidence', 'الدليل')}</span>${e ? `<button class="btn-link" data-act="evopen" data-id="${n.ev}">${n.ev} · ${_('Inspect', 'فحص')}</button>` : `<b class="mut">${_('None read', 'لا شيء مقروء')}</b>`}</div></div>`
    : `<p class="sub" style="margin-top:12px">${_('Select a service to see its status, owner and evidence.', 'اختر خدمة لرؤية حالتها ومسؤولها وأدلتها.')}</p>`;
  return `<section class="panel c8" aria-labelledby="h-map">${panelHead('branch', `<span id="h-map">${_('Service dependency map', 'خريطة اعتماد الخدمات')}</span>`, {right:badge('b-teal', _('Affected path highlighted', 'المسار المتأثر مظلل'))})}
    <div class="map">${mapSVG(v)}</div>
    <div class="legend"><span><i></i>${_('Observed dependency', 'اعتماد مرصود')}</span><span><i class="dash"></i>${_('Inferred dependency', 'اعتماد مستنتَج')}</span><span><i class="hot"></i>${_('Failing path', 'المسار المتعطل')}</span><span><span class="dot d-unk"></span>${_('Unknown', 'غير معروف')}</span></div>${detail}</section>`;
}
function impactPanel(v) {
  const biz = S.persona === 'biz', conf = (EVIDENCE[v.ev.find(k => EVIDENCE[k].kind === 'inf')] || {}).conf;
  const scope = v.id === 'INV-418' ? `<div style="margin-top:12px"><div class="pb gold"><i style="width:33%"></i></div><div class="cap" style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:6px"><span>${_('Branches affected', 'الفروع المتأثرة')}</span><span class="num">4 / 12</span></div></div>` : '';
  return `<div class="c4" style="display:grid;gap:20px;align-content:start">
  <section class="panel" aria-labelledby="h-imp">${panelHead('alert', `<span id="h-imp">${_('Impact assessment', 'تقييم الأثر')}</span>`)}
    <div class="row wrap" style="margin-bottom:8px">${v.empty ? badge('b-unk', _('Unknown', 'غير معروف'), 'help') : badge(SEV[v.sev][2], _('Impact: ', 'الأثر: ') + l(SEV[v.sev].slice(0, 2)))}<span class="sub">${l(v.scope)}</span></div>
    <p>${biz ? l(v.plain) : l(v.impact)}</p>${scope}</section>
  <section class="panel" aria-labelledby="h-cause">${panelHead('sparkles', `<span id="h-cause">${_('Suspected cause', 'السبب المشتبه')}</span>`)}
    ${v.empty ? '' : `<div style="margin:-4px 0 10px">${srcTag('inf')}</div>`}<p>${l(v.cause)}</p>
    ${conf ? `<div class="conf" style="margin-top:12px"><span class="sub">${_('Confidence', 'الثقة')}</span><div class="pb gold"><i style="width:${conf}%;background:linear-gradient(90deg,var(--violet),var(--violet-ink))"></i></div><b class="num">${conf}%</b></div><p class="sub" style="margin-top:8px">${_('Not confirmed by a test. Treat as a hypothesis.', 'لم يؤكده اختبار. اعتبره فرضية.')}</p>` : ''}</section></div>`;
}
function oiPanel(v) {
  const li = (arr, ic, cls) => arr.length ? arr.map(a => `<li>${icon(ic, 'sm ' + cls)}<span>${l(a)}</span></li>`).join('') : `<li class="mut">${_('Nothing recorded', 'لا شيء مسجل')}</li>`;
  return `<section class="panel c8" aria-labelledby="h-oi">${panelHead('eye', `<span id="h-oi">${_('Observed, inferred, unknown', 'مرصود ومستنتَج ومجهول')}</span>`)}
    <div class="split2 oi"><div><h3>${srcTag('obs')}</h3><ul>${li(v.observed, 'check', '')}</ul></div>
    <div><h3>${srcTag('inf')}</h3><ul>${li(v.inferred, 'sparkles', '')}</ul><h3 style="margin-top:14px">${srcTag('unk')}</h3><ul>${li(v.unknown, 'help', '')}</ul></div></div></section>`;
}
function nextPanel(v) {
  const made = S.extra.includes(v.id), biz = S.persona === 'biz';
  return `<section class="panel gold c5" aria-labelledby="h-next">${panelHead('send', `<span id="h-next">${_('Proposed next safe action', 'الإجراء الآمن التالي المقترح')}</span>`)}
    <div style="margin:-4px 0 10px">${badge('b-gold', _('Needs approval', 'يحتاج موافقة'), 'lock')}</div>
    <p style="font-size:15px;font-weight:500">${l(v.next)}</p>
    <div class="notice" style="margin:12px 0">${icon('shield')}<span>${_('Read-only. Nothing runs until a person approves it in the source system. Here it only adds a decision to the prototype inbox.', 'للقراءة فقط. لا يُنفَّذ شيء حتى يوافق شخص عليه في النظام المصدر. هنا يضيف قرارًا إلى صندوق النموذج فقط.')}</span></div>
    ${biz ? `<button class="btn pri-btn" data-act="escalate" data-id="${v.id}">${icon('send', 'sm')}${_('Escalate to the technical team', 'تصعيد إلى الفريق التقني')}</button>`
      : made ? `<button class="btn ok" data-act="opendec" data-id="D9">${icon('checkc', 'sm')}${_('Added: open in Decision Center', 'أُضيف: افتح في مركز القرارات')}</button>`
      : `<button class="btn pri-btn" data-act="adddec" data-id="${v.id}">${icon('decide', 'sm')}${_('Add to Decision Center', 'إضافة إلى مركز القرارات')}</button>`}</section>`;
}
function summaryPanel(v) {
  return `<section class="panel violet c5" aria-labelledby="h-sum">${panelHead('bot', `<span id="h-sum">${_('AI-assisted summary', 'ملخص بمساعدة الذكاء الاصطناعي')}</span>`)}<div style="margin:-4px 0 10px">${badge('b-ai', _('Read-only', 'قراءة فقط'), 'eye')}</div><p>${l(v.summary)}</p><p class="sub" style="margin-top:8px">${_('Generated from demo evidence. It can be wrong. Check the evidence tab.', 'مولَّد من أدلة تجريبية. قد يكون خاطئًا. راجع تبويب الأدلة.')}</p></section>`;
}
function overviewTab(v) { return `<div class="grid">${mapPanel(v)}${impactPanel(v)}${oiPanel(v)}<div class="c4" style="display:grid;gap:20px;align-content:start">${summaryPanel(v).replace('panel violet c5', 'panel violet')}${nextPanel(v).replace('panel gold c5', 'panel gold')}</div></div>`; }

/* Source-state helpers. Down = nothing can be read, so ages and service health are unavailable (not healthy).
   Stale = readings are old. "Unavailable" is kept distinct from "Not read" / "Unknown" (never instrumented). */
const effNode = n => S.src === 'down' ? {...n, s:'unk', st:['Unavailable', 'غير متاح']} : n;
function srcBanner() {
  if (S.src === 'down') return `<div class="notice crit" style="margin-bottom:12px">${icon('alert')}<span>${_('Sources are not being read. Evidence ages and service health are unavailable, not healthy. Text and figures below are the last demo snapshot, not a current reading.', 'المصادر غير مقروءة. أعمار الأدلة وصحة الخدمات غير متاحة وليست سليمة. النصوص والأرقام أدناه آخر لقطة تجريبية وليست قراءة حالية.')}</span></div>`;
  if (S.src === 'stale') return `<div class="notice warn" style="margin-bottom:12px">${icon('clock')}<span>${_('Source reads are 9 h old. Treat everything here as last known, not current. Each row shows its own age.', 'قراءات المصادر عمرها 9 ساعات. اعتبر كل ما هنا آخر حالة معروفة وليست حالية. كل صف يعرض عمره.')}</span></div>`;
  return '';
}
function evRow(k) {
  const e = EVIDENCE[k], a = e.age == null ? null : effAge(e.age);
  return `<li><div class="ev"><span class="evsrc">${icon(e.ic)}</span><div><h3>${l(e.t)}</h3><div class="m">${srcTag(e.kind)}<span>${l(e.src)}</span>${e.conf ? `<span>${_('Confidence', 'الثقة')} ${e.conf}%</span>` : ''}${e.kind === 'unk' && a == null ? '' : freshTag(e.age)}</div></div>
    <button class="btn sm" data-act="evopen" data-id="${k}">${_('Inspect', 'فحص')}${icon('chev', 'sm flip')}</button></div></li>`;
}
function evidenceTab(v) {
  const f = S.evsel || 'all', keys = v.ev.filter(k => f === 'all' || EVIDENCE[k].kind === f);
  const chart = v.id === 'INV-418' ? `<section class="panel c12">${panelHead('activity', _('Message queue depth', 'عمق طابور الرسائل'), {right:srcTag('obs')})}${lineChart({id:'queue', label:['Message queue depth over the last 3 hours, in thousands', 'عمق طابور الرسائل خلال آخر 3 ساعات بالآلاف'], x:QUEUE.x, ymax:8, ticks:[0, 2, 4, 6, 8], thr:QUEUE.thr, thrLabel:_('Alert threshold 5k', 'حد التنبيه 5 آلاف'), fmt:n => n + 'k', w:1000, h:270, series:[{name:['Queue depth','عمق الطابور'], color:'var(--ch-1)', data:QUEUE.y, area:true, lab:'up'}]})}</section>` : '';
  const pills = [['all', _('All', 'الكل'), v.ev.length], ['obs', _('Observed', 'مرصود')], ['inf', _('Inferred', 'مستنتَج')], ['unk', _('Unknown', 'مجهول')]];
  const sbanner = srcBanner();
  return `<div class="grid">${chart}<section class="panel c12" aria-labelledby="h-evl">${panelHead('file', `<span id="h-evl">${_('Evidence from source systems', 'الأدلة من الأنظمة المصدر')}</span>`, {n:keys.length})}
    <div class="pills" role="group" aria-label="${_('Evidence type', 'نوع الدليل')}" style="margin-bottom:10px">${pills.map(p => `<button class="pill" data-act="evfilter" data-v="${p[0]}" aria-pressed="${f === p[0]}">${p[1]}</button>`).join('')}</div>
    ${sbanner}${keys.length ? `<ul class="evlist">${keys.map(evRow).join('')}</ul>` : stateBox('', 'file', _('No evidence of this type', 'لا أدلة من هذا النوع'), _('Try another filter.', 'جرّب مرشحًا آخر.'))}</section></div>`;
}
function timelineTab(v) {
  const k2 = {obs:'info', crit:'crit', warn:'warn', ai:'ai'};
  return `<section class="panel">${panelHead('history', _('Incident timeline', 'الجدول الزمني للحادث'), {n:v.timeline.length})}<ol class="tl" style="margin:0;padding:0">${v.timeline.map(t => `<li><time>${ago(t.ago)}</time><span class="dot d-${k2[t.k]}" aria-hidden="true"></span><div><b>${l(t.t)}</b><p>${l(t.d)}</p></div></li>`).join('')}<li style="padding:0"><time>${_('Now', 'الآن')}</time><span class="dot d-ok" aria-hidden="true"></span><div><b>${_('Investigating (read-only)', 'قيد التحقيق (قراءة فقط)')}</b></div></li></ol></section>`;
}
function relatedTab(v) {
  const rows = v.related.map(r => {
    if (r.k === 'dec') { const d = S.dec.find(x => x.id === r.id); return d ? `<li><div class="ev"><span class="evsrc">${icon('decide')}</span><div><h3>${l(d.t)}</h3><div class="m"><span class="pri p${d.p}">P${d.p}</span><span>${d.id}</span></div></div><button class="btn sm" data-act="opendec" data-id="${d.id}">${_('Open', 'فتح')}${icon('chev', 'sm flip')}</button></div></li>` : ''; }
    if (r.k === 'risk') { const x = RISKS.find(q => q.id === r.id); return `<li><div class="ev"><span class="evsrc">${icon('alert')}</span><div><h3>${l(x.t)}</h3><div class="m"><span>${x.id}</span><span>${l(x.own)}</span></div></div><button class="btn sm" data-act="gotab" data-id="portfolio" data-v="risks">${_('Open', 'فتح')}${icon('chev', 'sm flip')}</button></div></li>`; }
    const x = SIGNALS.find(q => q.id === r.id); return `<li><div class="ev"><span class="evsrc">${icon('cpu')}</span><div><h3>${l(x.t)}</h3><div class="m"><span>${l(x.src)}</span>${freshTag(x.age)}</div></div><button class="btn sm" data-act="sample">${_('Sample link', 'رابط عيّنة')}${icon('ext', 'sm')}</button></div></li>`;
  }).join('');
  return `<section class="panel">${panelHead('link', _('Related items', 'عناصر ذات صلة'), {n:v.related.length})}<ul class="evlist">${rows}</ul></section>`;
}

SCREENS.investigation = () => {
  const list = invList(); let v = INVESTIGATIONS[S.inv];
  if (!v || !list.includes(v)) v = list[0] || null;
  const side = invListPanel(list);
  if (!v) return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Investigation', 'التحقيق')}])}<div class="page-head"><div><h1>${_('Investigation Room', 'غرفة التحقيق')}</h1></div></div><div class="invlayout">${side}${stateBox('', 'search', _('Nothing selected', 'لا شيء محدد'), _('No investigation matches the current filters.', 'لا تحقيق يطابق المرشحات الحالية.'))}</div>`;
  S.inv = v.id;
  const st = INVST[v.status], t = S.tab.inv;
  const head = `<div class="invhead"><div class="row wrap">${badge(st[2], l(st.slice(0, 2)), st[3])}${v.empty ? '' : badge(SEV[v.sev][2], _('Severity: ', 'الخطورة: ') + l(SEV[v.sev].slice(0, 2)))}<span class="mut num" style="font-size:12.5px">${v.id}</span>${demoTag()}</div>
    <h1>${l(v.t)}</h1><div class="metaline"><span>${icon('layers', 'sm')}${esc(l(PROJECTS[v.proj].name))}</span><span>${icon('clock', 'sm')}${_('Started', 'بدأ')} ${ago(v.started)}</span><span>${icon('users', 'sm')}${_('Owner: unassigned', 'المسؤول: غير معيّن')}</span><span>${icon('file', 'sm')}${v.ev.length} ${_('evidence items', 'عناصر دليل')}</span></div></div>`;
  const body = {overview:overviewTab, evidence:evidenceTab, timeline:timelineTab, related:relatedTab}[t](v);
  const raw = v.empty ? stateBox('unk', 'help', _('No evidence was read', 'لم تُقرأ أي أدلة'), _('Monitoring for this service could not be reached. Everything below is unknown, not healthy.', 'تعذّر الوصول إلى مراقبة هذه الخدمة. كل ما يلي غير معروف وليس سليمًا.')) : '';
  return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Investigation', 'التحقيق'), act:'nav', id:'investigation'}, {t:v.id}])}
  <div class="page-head" style="margin-bottom:16px"><div><h1 style="font-size:clamp(26px,2.6vw,34px)">${_('Investigation Room', 'غرفة التحقيق')}</h1><p class="lede" style="margin-top:6px">${_('Understand an incident, check the evidence, find the root cause. Read-only.', 'افهم الحادث وافحص الأدلة وابحث عن السبب. للقراءة فقط.')}</p></div></div>
  <div class="invlayout"><aside>${side}</aside><div style="min-width:0">${head}${raw ? `<div style="margin-bottom:18px">${raw}</div>` : ''}
  ${tabsHTML('inv', [['overview', _('Overview', 'نظرة عامة')], ['evidence', _('Evidence', 'الأدلة'), v.ev.length], ['timeline', _('Timeline', 'الجدول الزمني')], ['related', _('Related', 'ذات صلة'), v.related.length]])}
  <div role="tabpanel" aria-labelledby="tab-inv-${t}">${body}</div></div></div>`;
};

/* evidence drawer */
DRAWERS.evidence = k => {
  const e = EVIDENCE[k], used = S.dec.filter(d => d.ev.includes(k)), a = e.age == null ? null : effAge(e.age);
  return {
    title:l(e.t), sub:srcTag(e.kind) + freshTag(e.age) + demoTag(),
    body:`<div class="sec"><h3>${_('What it says', 'ما الذي يقوله')}</h3><p>${l(e.sum)}</p></div>
    <div class="sec"><h3>${_('Source', 'المصدر')}</h3><div class="row"><span class="evsrc">${icon(e.ic)}</span><div><b>${l(e.src)}</b><div class="sub">${e.kind === 'unk' ? _('Not read. Treated as unknown.', 'غير مقروء. يُعامل كمجهول.') : S.src === 'down' ? _('Sources are unavailable. This is the last demo snapshot, not a current reading.', 'المصادر غير متاحة. هذه آخر لقطة تجريبية وليست قراءة حالية.') : _('Read ', 'قُرئ ') + ago(a)}</div></div></div></div>
    <div class="sec"><h3>${e.kind === 'inf' ? _('How it was inferred', 'كيف استُنتج') : _('Raw payload (sample)', 'الحمولة الخام (عينة)')}</h3>${can('raw') ? `<pre class="code">${esc(e.raw)}</pre>` : `<div class="redact">${icon('eyeoff', 'lg')}<span>${_('Technical detail is hidden for your role. Ask the technical team if you need it.', 'التفاصيل التقنية مخفية لدورك. اسأل الفريق التقني إن احتجتها.')}</span></div>`}</div>
    ${e.kind === 'inf' ? `<div class="notice ai">${icon('sparkles')}<span>${_('An inference is a guess built from other evidence. It is not an observation.', 'الاستنتاج تخمين مبني على أدلة أخرى. وليس ملاحظة.')}</span></div>` : ''}
    ${e.kind === 'unk' ? `<div class="notice">${icon('help')}<span>${_('No data. This is unknown, not healthy. A person must verify it.', 'لا بيانات. هذا مجهول وليس سليمًا. يجب أن يتحقق منه شخص.')}</span></div>` : ''}
    <div class="sec"><h3>${_('Used by decisions', 'مستخدم في القرارات')}</h3><div class="chips">${used.length ? used.map(d => `<button class="chip" data-act="opendec" data-id="${d.id}">${icon('decide', 'sm')}${d.id}</button>`).join('') : `<span class="mut">${_('No decision cites it yet.', 'لا قرار يستشهد به بعد.')}</span>`}</div></div>`
  };
};

Object.assign(ACT, {
  invsel: el => { S.inv = el.dataset.id; S.node = null; S.tab.inv = 'overview'; renderApp(); },
  invsev: el => { S.invsev = el.dataset.v; renderApp(); },
  invq: el => { S.invq = el.value; renderApp(); },
  invclear: () => { S.invq = ''; S.invsev = 'all'; renderApp(); },
  node: el => { S.node = S.node === el.dataset.id ? null : el.dataset.id; renderApp(); },
  evfilter: el => { S.evsel = el.dataset.v; renderApp(); },
  evopen: el => openDrawer('evidence', el.dataset.id, el),
  escalate: () => toast(_('Escalation sent to the technical team (simulated)', 'أُرسل التصعيد إلى الفريق التقني (محاكاة)')),
  adddec: el => {
    const v = INVESTIGATIONS[el.dataset.id]; if (S.extra.includes(v.id)) return;
    S.dec.push({id:'D9', p:1, proj:v.proj, st:'inbox', est:5, impact:'high', inv:v.id, due:['Nov 16', '16 نوفمبر'], ev:v.ev.slice(0, 3),
      t:[`Approve a read-only Verification item for ${v.id}`, `الموافقة على بند تحقق للقراءة فقط لـ ${v.id}`],
      why:['Proposed as the next safe action in the investigation.', 'اقتراح كإجراء آمن تالٍ في التحقيق.'],
      opts:[{id:'ok', rec:true, t:['Approve the draft', 'الموافقة على المسودة'], d:['A person creates the item in the work tracker.', 'ينشئ شخص البند في متتبع العمل.'], r:['Risk: none. Verification does not change systems.', 'الخطر: لا يوجد. التحقق لا يغيّر الأنظمة.']}, {id:'no', rec:false, t:['Not now', 'ليس الآن'], d:['Keep watching the evidence.', 'مواصلة مراقبة الأدلة.'], r:['Risk: slower diagnosis.', 'الخطر: تشخيص أبطأ.']}],
      hist:[{w:['Investigation INV-418', 'التحقيق INV-418'], a:['Proposed a safe next action (demo)', 'اقترح إجراءً آمنًا تاليًا (تجريبي)'], t:'Nov 15, 15:20'}]});
    S.extra.push(v.id); renderApp(); toast(_('Added to the Decision Center inbox (prototype only)', 'أُضيف إلى صندوق مركز القرارات (نموذج فقط)'));
  }
});

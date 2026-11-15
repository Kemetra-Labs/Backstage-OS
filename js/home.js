/* Screen 01: Command Home. Layout authority: reference image 2 (Executive Brief + Engineering Signals,
   Projects Overview, Decision Inbox + AI Chief of Staff), extended with risks and milestones. */
const QA = {
  owner:[
    [['What changed','ما الذي تغيّر'],['Retail Tower OS main build failed 42 min ago. Khepri error rate is up.','فشل بناء Retail Tower OS الرئيسي قبل 42 دقيقة. ارتفع معدل أخطاء Khepri.']],
    [['What matters','ما المهم'],['The Nov 18 pilot go/no-go depends on the sync issue.','قرار الانطلاق التجريبي في 18 نوفمبر يعتمد على مشكلة المزامنة.']],
    [['Needs your decision','يحتاج قرارك'],['Pilot go/no-go and the Khepri incident plan.','قرار الانطلاق التجريبي وخطة حادث Khepri.']],
    [['What next','الخطوة التالية'],['Review the go/no-go evidence first (about 10 min).','راجع أدلة قرار الانطلاق أولًا (نحو 10 دقائق).']] ],
  tech:[
    [['What changed','ما الذي تغيّر'],['CI red on the Backend service (run #4821, sample). Ingest 5xx up on Khepri.','CI أحمر على الخدمة الخلفية (التشغيل 4821، عينة). ارتفاع 5xx في استقبال Khepri.']],
    [['What matters','ما المهم'],['Queue backpressure is the leading hypothesis (72%, inferred, unverified).','ضغط الطابور هو الفرضية الأقوى (72%، استنتاج، غير مُتحقَّق).']],
    [['Needs your input','يحتاج مدخلاتك'],['Evidence for the go/no-go and a worker capacity change.','أدلة قرار الانطلاق وتغيير سعة العمال.']],
    [['What next','الخطوة التالية'],['Open INV-418 and confirm the queue depth evidence.','افتح INV-418 وأكّد دليل عمق الطابور.']] ],
  biz:[
    [['What changed','ما الذي تغيّر'],['A build problem and a service slowdown were found this morning.','رُصدت مشكلة بناء وبطء في إحدى الخدمات صباح اليوم.']],
    [['What matters','ما المهم'],['Pilot stores may see stock numbers update late.','قد تتأخر أرقام المخزون في المتاجر التجريبية.']],
    [['Who decides','من يقرر'],['The Owner is reviewing 2 decisions. No action is needed from you.','المالك يراجع قرارين. لا إجراء مطلوبًا منك.']],
    [['What next','الخطوة التالية'],['Escalate if a store reports missing stock updates.','صعّد إذا أبلغ متجر عن تحديثات مخزون مفقودة.']] ]
};
const BIGLBL = {
  owner:['Decisions awaiting review','قرارات بانتظار المراجعة'],
  tech:['Decisions that need your evidence','قرارات تحتاج أدلتك'],
  biz:['Decisions with the Owner','قرارات لدى المالك']
};

function briefPanel(wide) {
  const vis = Object.values(PROJECTS).filter(p => inProject(p.id));
  const p1 = pending().filter(d => d.p === 1 && inProject(d.proj)).length;
  const cnt = k => vis.filter(p => effStatus(p) === k).length;
  const qa = QA[S.persona].map((r, i) => {
    let a = l(r[1]);
    if (i === 0 && S.src === 'down') a = _('Engineering sources were not read. Recent changes are unknown.', 'لم تُقرأ مصادر الهندسة. التغييرات الأخيرة غير معروفة.');
    if (i === 0 && S.src === 'stale') a = _('Engineering data is 9 h old. It may not show recent changes.', 'بيانات الهندسة عمرها 9 ساعات. قد لا تُظهر التغييرات الأخيرة.');
    return `<div><dt>${l(r[0])}</dt><dd>${a}</dd></div>`;
  }).join('');
  const note = S.src === 'down' ? `<div class="notice crit">${icon('alert')}<span>${_('Engineering sources are not being read. Project health below is shown as unknown, never as healthy.', 'مصادر الهندسة غير مقروءة. تُعرض صحة المشاريع أدناه كغير معروفة وليس كسليمة.')}</span></div>`
    : S.src === 'stale' ? `<div class="notice warn">${icon('clock')}<span>${_('Engineering data is stale (9 h old). Check freshness before acting on it.', 'بيانات الهندسة قديمة (عمرها 9 ساعات). تحقق من الحداثة قبل الاعتماد عليها.')}</span></div>`
    : `<div class="notice">${icon('info')}<span>${_('Information shown is demo data, not live. Recommendations are generated from available context and may be incomplete. Review the evidence before deciding.', 'المعلومات المعروضة تجريبية وليست مباشرة. التوصيات مبنية على السياق المتاح وقد تكون ناقصة. راجع الأدلة قبل القرار.')}</span></div>`;
  return `<section class="panel gold ${wide ? 'c8' : 'c4'}" aria-labelledby="h-brief">
    ${panelHead('file', `<span id="h-brief">${_('Executive Brief', 'الملخص التنفيذي')}</span>`)}
    <div class="brief"><div class="big"><span class="n num">${p1}</span><span class="l">${l(BIGLBL[S.persona])}</span><span class="s">${_('They keep projects on track and rest on current evidence.', 'تُبقي المشاريع على المسار وتعتمد على الأدلة الحالية.')}</span></div>
    <dl class="qa" style="margin:0">${qa}</dl></div>
    <div class="stats">
      <div class="stat">${icon('layers')}<div><b class="num">${vis.length}</b><span>${_('Projects in scope', 'مشاريع ضمن النطاق')}</span></div></div>
      <div class="stat">${icon('alert')}<div><b class="num">${cnt('review') + cnt('stale')}</b><span>${_('Needs review', 'تحتاج مراجعة')}</span></div></div>
      <div class="stat">${icon('help')}<div><b class="num">${cnt('unavailable')}</b><span>${_('Data unavailable', 'بيانات غير متاحة')}</span></div></div>
      <div class="stat">${icon('clock')}<div><b class="num">${cnt('planning')}</b><span>${_('In planning', 'قيد التخطيط')}</span></div></div></div>
    <div style="margin-top:14px">${note}</div></section>`;
}

function signalsPanel(wide) {
  const sigs = SIGNALS.filter(s => inProject(s.proj));
  let body;
  if (S.src === 'down') body = stateBox('err', 'alert', _('Not read', 'غير مقروء'), _('Engineering sources could not be reached. No signals are shown, and none should be assumed healthy.', 'تعذّر الوصول إلى مصادر الهندسة. لا تُعرض إشارات، ولا يُفترض أن شيئًا سليم.'), `<button class="btn sm" data-act="reread">${icon('refresh', 'sm')}${_('Retry read', 'إعادة المحاولة')}</button>`);
  else if (!sigs.length) body = stateBox('unk', 'help', _('No signals for this project', 'لا إشارات لهذا المشروع'), _('No source is connected for it yet. That is unknown, not healthy.', 'لا مصدر متصل به بعد. هذا غير معروف وليس سليمًا.'));
  else {
    const stale = S.src === 'stale' ? `<div class="notice warn" style="margin-bottom:12px">${icon('clock')}<span>${_('Showing the last read from 9 h ago.', 'يُعرض آخر قراءة قبل 9 ساعات.')}</span></div>` : '';
    body = stale + `<ul class="sig">${sigs.map(s => {
      const biz = S.persona === 'biz';
      return `<li>${sevDot(s.sev)}<div><b>${biz ? l(s.plain) : l(s.t)}</b>${biz ? '' : `<p class="m">${l(s.d)} <span class="mut">· ${l(s.src)}</span></p>`}
        <div class="l">${biz ? `<span class="mut">${l(s.src)}</span>` : sampleBtn(l(s.links[0]))}${s.inv && can('raw') ? `<button class="btn-link" data-act="openinv" data-id="${s.inv}">${_('Investigate', 'تحقيق')}${icon('chev', 'sm flip')}</button>` : ''}</div></div>
        <time>${freshTag(s.age)}</time></li>`;
    }).join('')}</ul>`;
  }
  return `<section class="panel ${wide ? 'c8' : 'c4'}" aria-labelledby="h-sig">${panelHead('cpu', `<span id="h-sig">${S.persona === 'biz' ? _('Plain-language signals', 'إشارات بلغة بسيطة') : _('Engineering Signals', 'الإشارات الهندسية')}</span>`)}
    <p class="sub" style="margin:-6px 0 12px">${_('Recent activity from CI, monitoring and issue trackers.', 'نشاط حديث من التكامل المستمر والمراقبة ومتتبعات المشكلات.')}</p>${body}</section>`;
}

function projectsPanel() {
  const vis = Object.values(PROJECTS).filter(p => inProject(p.id));
  return `<section class="panel c12" aria-labelledby="h-proj">${panelHead('layers', `<span id="h-proj">${_('Projects Overview', 'نظرة عامة على المشاريع')}</span>`, {right:`<button class="btn-link" data-act="nav" data-id="portfolio">${_('Open portfolio', 'فتح المحفظة')}${icon('chev', 'sm flip')}</button>`})}
    <div class="pcards">${vis.map(projectCard).join('')}</div></section>`;
}
function projectCard(p) {
  const st = effStatus(p), pct = Math.round(p.ms.done / p.ms.total * 100), unk = st === 'unavailable';
  return `<button class="pcard" data-act="product" data-id="${p.id}" aria-label="${esc(l(p.name))}: ${l(STATUS[st].slice(0, 2))}">
    <div class="t"><span class="glyph ${p.tone}">${icon(p.icon, 'lg')}</span><div><h3>${esc(l(p.name))}</h3><p>${l(p.desc)}</p></div>${statusBadge(st)}</div>
    <div><div class="pb ${unk ? 'unk' : ''}" role="img" aria-label="${p.ms.done} / ${p.ms.total}"><i style="width:${pct}%"></i></div>
      <div class="cap" style="margin-top:6px"><span>${_('Milestones done', 'المعالم المنجزة')}</span><span class="num"><strong style="color:var(--ink)">${p.ms.done}</strong> / ${p.ms.total}</span></div></div>
    <div class="kv"><div><span>${_('Focus', 'التركيز')}</span><b>${l(p.focus)}</b></div><div><span>${_('Key item', 'البند الرئيسي')}</span><b>${l(p.key)}</b></div><div><span>${_('Next date', 'الموعد القادم')}</span><b>${(l(p.next).split('·')[1] || '').trim()}</b></div></div></button>`;
}

function inboxPanel() {
  const items = pending().filter(d => inProject(d.proj)).sort((a, b) => a.p - b.p).slice(0, 3);
  const total = pending().filter(d => inProject(d.proj)).length;
  const body = items.length ? items.map(d => `<div class="drow"><span class="pri p${d.p}" aria-label="${_('Priority', 'الأولوية')} ${d.p}">P${d.p}</span>
      <div><h3>${l(d.t)}</h3><p class="reason">${l(d.why)}</p>
        <div class="m"><span>${icon('layers', 'sm')}${esc(l(PROJECTS[d.proj].name))}</span><span>${icon('clock', 'sm')}${_('About', 'نحو')} ${d.est} ${_('min', 'دقيقة')}</span><span>${icon('calendar', 'sm')}${l(d.due)}</span></div></div>
      <button class="btn ${S.persona === 'owner' ? 'pri-btn' : ''}" data-act="opendec" data-id="${d.id}">${S.persona === 'owner' ? _('Review', 'مراجعة') : _('View', 'عرض')}${icon('arrow', 'sm flip')}</button></div>`).join('')
    : stateBox('', 'checkc', _('Nothing waiting', 'لا شيء بانتظارك'), _('No pending decisions for this project in the demo.', 'لا قرارات معلّقة لهذا المشروع في العرض التجريبي.'));
  return `<section class="panel c8" aria-labelledby="h-inbox">${panelHead('decide', `<span id="h-inbox">${_('Decision Inbox', 'صندوق القرارات')}</span>`, {n:total, right:`<button class="btn-link" data-act="nav" data-id="decisions">${_('View all decisions', 'عرض كل القرارات')}${icon('chev', 'sm flip')}</button>`})}
    ${body}</section>`;
}

function chiefPanel() {
  const it = (ic, k, t, act, id, lab) => `<li>${icon(ic)}<div><b>${k}</b> ${t}<br><button data-act="${act}" data-id="${id}">${lab}${icon('chev', 'sm flip')}</button></div></li>`;
  return `<section class="panel violet c4" aria-labelledby="h-cos">${panelHead('sparkles', `<span id="h-cos">${_('AI Chief of Staff', 'رئيس الأركان الذكي')}</span>`)}
    <div style="margin:-6px 0 8px">${badge('b-ai', _('Read-only analysis', 'تحليل للقراءة فقط'), 'eye')}</div>
    <p class="sub" style="margin:0 0 8px">${_('Cross-project insights from demo context. No actions are executed.', 'رؤى عبر المشاريع من سياق تجريبي. لا تُنفَّذ أي إجراءات.')}</p>
    <ul class="cos">
    ${it('target', _('Focus:', 'ركّز:'), _('Resolve the sync issue to protect the Nov 18 pilot date.', 'عالج مشكلة المزامنة لحماية موعد التجربة في 18 نوفمبر.'), 'openinv', 'INV-418', _('Open the investigation', 'افتح التحقيق'))}
    ${it('eye', _('Watch:', 'راقب:'), _('Khepri has no telemetry. Confirm whether the error rise is real.', 'لا قياسات لـ Khepri. تأكد من أن ارتفاع الأخطاء حقيقي.'), 'openinv', 'INV-402', _('See what is unknown', 'اعرف ما هو مجهول'))}
    ${it('calendar', _('Plan:', 'خطّط:'), _('Keep Seshat-BI in planning and confirm scope with stakeholders.', 'أبقِ Seshat-BI في التخطيط وأكّد النطاق مع أصحاب المصلحة.'), 'opendec', 'D3', _('Review the scope decision', 'راجع قرار النطاق'))}
    </ul></section>`;
}

function risksPanel() {
  const rs = RISKS.filter(r => inProject(r.proj));
  const lv = {high:['High','عالٍ','b-crit'], med:['Medium','متوسط','b-warn']};
  return `<section class="panel c6" aria-labelledby="h-risk">${panelHead('alert', `<span id="h-risk">${_('Risks and Blockers', 'المخاطر والعوائق')}</span>`, {n:rs.length, right:`<button class="btn-link" data-act="gotab" data-id="portfolio" data-v="risks">${_('All risks', 'كل المخاطر')}${icon('chev', 'sm flip')}</button>`})}
    <ul class="sig">${rs.map(r => `<li>${sevDot(r.unk ? 'unk' : r.lvl === 'high' ? 'crit' : 'warn')}<div><b>${l(r.t)}</b><div class="l"><span class="mut">${esc(l(PROJECTS[r.proj].name))}</span><span class="mut">${l(r.own)}</span>${r.blk ? badge('b-crit', _('Blocker', 'عائق')) : ''}${r.unk ? badge('b-unk', _('Cause unknown', 'السبب مجهول'), 'help') : ''}</div></div>${badge(lv[r.lvl][2], l(lv[r.lvl].slice(0, 2)))}</li>`).join('') || stateBox('', 'checkc', _('No open risks', 'لا مخاطر مفتوحة'), _('None recorded for this project in the demo.', 'لا شيء مسجل لهذا المشروع في العرض التجريبي.'))}</ul></section>`;
}
function msPanel() {
  const ms = MILESTONES.filter(m => inProject(m.proj));
  return `<section class="panel c6" aria-labelledby="h-ms">${panelHead('flag', `<span id="h-ms">${_('Upcoming Milestones', 'المعالم القادمة')}</span>`, {n:ms.length, right:`<button class="btn-link" data-act="gotab" data-id="portfolio" data-v="milestones">${_('All milestones', 'كل المعالم')}${icon('chev', 'sm flip')}</button>`})}
    <ul class="sig">${ms.map(m => `<li>${sevDot(m.st)}<div><b>${l(m.t)}</b><div class="l"><span class="mut">${esc(l(PROJECTS[m.proj].name))}</span><span class="mut">${l(m.note)}</span></div></div><time class="num" style="color:var(--ink-2)">${dateStr(m.d)}</time></li>`).join('') || stateBox('', 'calendar', _('No milestones', 'لا معالم'), _('Nothing scheduled in the demo.', 'لا شيء مجدول في العرض التجريبي.'))}</ul></section>`;
}

SCREENS.home = () => {
  const names = {owner:['Commander','أيها القائد'], tech:['Engineer','أيها المهندس'], biz:['Team','أيها الفريق']};
  const eng = S.persona === 'tech';
  const date = S.lang === 'ar' ? 'الأحد، 15 نوفمبر 2026' : 'Sun, Nov 15, 2026';
  return `<div class="hero"><div class="arc"></div><div class="stars"></div>${heroDunes()}
    <div class="date">${icon('calendar', 'sm')}${date}</div>
    <h1>${_('Good morning,', 'صباح الخير،')} <em>${l(names[S.persona])}</em></h1>
    <p class="lede">${_('Management and engineering. One operational picture.', 'الإدارة والهندسة. صورة تشغيلية واحدة.')}</p></div>
  <div class="grid">${eng ? signalsPanel(true) + briefPanel(false) : briefPanel(true) + signalsPanel(false)}
    ${projectsPanel()}${homeTraj()}${focusPanel()}${inboxPanel()}${chiefPanel()}${risksPanel()}${msPanel()}</div>`;
};

Object.assign(ACT, {
  openinv: el => go('investigation', {after:() => {S.inv = el.dataset.id; S.tab.inv = 'overview'; S.node = null;}}),
  opendec: el => go('decisions', {after:() => {const d = S.dec.find(x => x.id === el.dataset.id); S.dsel = d.id; S.tab.dec = d.st === 'decided' ? 'decided' : d.st === 'review' ? 'review' : 'inbox'; S.dfilter = 'all';}}),
  gotab: el => go(el.dataset.id, {after:() => S.tab.portfolio = el.dataset.v}),
  product: el => openDrawer('product', el.dataset.id, el)
});

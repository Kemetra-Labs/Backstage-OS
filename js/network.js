/* Screen 06: Customers & Branches. An IMAGINED internal view of Retail Tower OS's customer layer, linked to its services.
   Staff only. Read-only. No customer data exists here: every company, branch and count is invented.
   Real source of truth would be Backend-Core read contracts, none of which is authorized in this prototype. */
S.net = {tenant:null, branch:null};
const NET_SVC = {
  iv:{n:['Inventory Service','خدمة المخزون'], st:['Updates delayed','التحديثات متأخرة'], s:'warn', ic:'layers'},
  bs:{n:['Branch Service','خدمة الفروع'], st:['Healthy','سليمة'], s:'ok', ic:'branch'},
  sy:{n:['Sync Service','خدمة المزامنة'], st:['Degraded','متدهورة'], s:'crit', ic:'refresh'},
  q:{n:['Message Queue','طابور الرسائل'], st:['Suspected cause','سبب مشتبه'], s:'crit', ic:'server'}
};
const netTenantsOK = () => S.persona !== 'biz';
const tById = id => TENANTS.find(t => t.id === id);
const tLabel = id => netTenantsOK() ? l(tById(id).n) : _('Company ', 'شركة ') + 'ABCD'[TENANTS.findIndex(t => t.id === id)];
const bLabel = id => netTenantsOK() ? id + ' · ' + l(BRANCHES[id].n) : _('Branch ', 'فرع ') + String(BR_ORDER.indexOf(id) + 1).padStart(2, '0');
const brN = n => S.lang === 'ar' ? (n === 1 ? 'فرع واحد' : n + ' فروع') : n + (n === 1 ? ' branch' : ' branches');
const brAffected = ids => ids.filter(i => BRANCHES[i].st === 'delayed').length;
const netStats = () => {
  const all = BR_ORDER, aff = brAffected(all), inst = all.filter(i => BRANCHES[i].inst).length;
  return {companies:TENANTS.length, branches:all.length, affected:aff, tenantsHit:TENANTS.filter(t => brAffected(t.br) > 0).length, inst, terminals:all.reduce((a, i) => a + BRANCHES[i].term, 0)};
};

function netMap() {
  const W = 870, H = 452 + TENANTS.length * 14, RH = 34, Y0 = 22, BX = 290, BW = 220;
  const bp = {}; BR_ORDER.forEach((id, i) => { const g = TENANTS.findIndex(t => t.br.includes(id)); bp[id] = {x:BX, y:Y0 + i * RH + g * 14, w:BW, h:28}; });
  const tp = {}; TENANTS.forEach(t => { const ys = t.br.map(b => bp[b].y + 14); const cy = (Math.min(...ys) + Math.max(...ys)) / 2; tp[t.id] = {x:20, y:cy - 23, w:200, h:46, cy}; });
  const sp = {iv:{x:640, y:20}, bs:{x:640, y:104}, sy:{x:640, y:200}, q:{x:640, y:318}}; const SW = 190, SH = 56;
  const sy = {x:sp.sy.x, y:sp.sy.y + SH / 2};
  let e = '';
  TENANTS.forEach(t => t.br.forEach(b => { const a = tp[t.id], c = bp[b]; e += `<path class="edge" d="M${a.x + a.w} ${a.cy} C ${a.x + a.w + 40} ${a.cy}, ${BX - 40} ${c.y + 14}, ${BX} ${c.y + 14}"/>`; }));
  const lines = {ok:[], delayed:[], new:[]};
  BR_ORDER.forEach(id => { const c = bp[id], y = c.y + 14; lines[BRANCHES[id].st].push(`<path class="edge ${BRANCHES[id].st === 'delayed' ? 'hot flow' : BRANCHES[id].st === 'new' ? 'inf' : ''}" d="M${BX + BW} ${y} C ${BX + BW + 80} ${y}, ${sy.x - 70} ${sy.y}, ${sy.x} ${sy.y}"/>`); });
  e += lines.ok.join('') + lines.new.join('') + lines.delayed.join('');
  e += `<path class="edge" d="M${sp.sy.x + SW / 2} ${sp.sy.y} L${sp.sy.x + SW / 2} ${sp.bs.y + SH}"/><path class="edge hot flow" d="M${sp.sy.x + SW / 2} ${sp.sy.y + SH} L${sp.sy.x + SW / 2} ${sp.q.y}"/>`;
  e += `<path class="edge" d="M${sp.sy.x + SW} ${sp.sy.y + SH / 2} C ${sp.sy.x + SW + 34} ${sp.sy.y + SH / 2}, ${sp.sy.x + SW + 34} ${sp.iv.y + SH / 2}, ${sp.sy.x + SW} ${sp.iv.y + SH / 2}"/>`;
  const dot = s => ({crit:'#EF6572', warn:'#F4B64B', ok:'#24C98B', unk:'none'}[s]);
  let n = '';
  TENANTS.forEach(t => {
    const a = tp[t.id], aff = brAffected(t.br), sel = S.net.tenant === t.id && !S.net.branch, cls = aff ? 'warn' : 'ok';
    n += `<g class="nd ${cls} ${sel ? 'sel' : ''}" tabindex="0" role="button" aria-pressed="${sel}" data-act="netsel" data-id="${t.id}" aria-label="${esc(tLabel(t.id))}: ${t.br.length} ${_('branches', 'فروع')}, ${aff} ${_('affected', 'متأثرة')}">
      <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="11"/><text x="${a.x + 14}" y="${a.y + 20}">${esc(tLabel(t.id))}</text>
      <text class="st" x="${a.x + 14}" y="${a.y + 37}">${brN(t.br.length)} · ${aff} ${_('affected', 'متأثرة')}</text></g>`;
  });
  BR_ORDER.forEach(id => {
    const c = bp[id], b = BRANCHES[id], s = BRST[b.st][4], sel = S.net.branch === id;
    n += `<g class="nd ${s} ${sel ? 'sel' : ''}" tabindex="0" role="button" aria-pressed="${sel}" data-act="netbr" data-id="${id}" aria-label="${esc(bLabel(id))}: ${esc(l(BRST[b.st]))}">
      <rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="9"/><circle cx="${c.x + 14}" cy="${c.y + 14}" r="4.5" fill="${dot(s)}" ${s === 'unk' ? 'stroke="#9AA7B8" stroke-dasharray="2 2" stroke-width="1.5"' : ''}/>
      <text x="${c.x + 28}" y="${c.y + 18.5}" style="font-size:12.5px">${esc(bLabel(id))}</text>
      <text class="st" x="${c.x + c.w - 10}" y="${c.y + 18.5}" text-anchor="end" style="font-size:12px">${b.sync == null ? _('no sync', 'لا مزامنة') : b.sync + ' ' + _('min', 'د')}</text></g>`;
  });
  Object.entries(sp).forEach(([k, p]) => {
    const v = NET_SVC[k], act = k === 'sy' && can('raw');
    n += `<g class="nd ${v.s}" ${act ? `tabindex="0" role="button" data-act="openinv" data-id="INV-418" aria-label="${esc(l(v.n))}: ${esc(l(v.st))}. ${_('Open investigation', 'افتح التحقيق')}"` : 'role="img" aria-label="' + esc(l(v.n)) + ': ' + esc(l(v.st)) + '"'}>
      <rect x="${p.x}" y="${p.y}" width="${SW}" height="${SH}" rx="11"/>
      <g stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:#8E9CB0"><use href="#i-${v.ic}" x="${p.x + 12}" y="${p.y + 16}" width="22" height="22"/></g>
      <text x="${p.x + 44}" y="${p.y + 25}">${esc(l(v.n))}</text><text class="st" x="${p.x + 44}" y="${p.y + 43}">${esc(l(v.st))}</text>
      <circle cx="${p.x + SW - 14}" cy="${p.y + 16}" r="4.5" fill="${dot(v.s)}"/></g>`;
  });
  n += `<text class="el" x="20" y="${H - 6}">${_('Companies', 'الشركات')}</text><text class="el" x="${BX}" y="${H - 6}">${_('Branches', 'الفروع')}</text><text class="el" x="${sp.iv.x}" y="${H - 6}">${_('Retail Tower services', 'خدمات Retail Tower')}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${_('Map linking companies and branches to Retail Tower services', 'خريطة تربط الشركات والفروع بخدمات Retail Tower')}">${e}${n}</svg>`;
}

function netDetail() {
  const st = netStats(), nb = S.net.branch, nt = S.net.tenant;
  if (nb) {
    const b = BRANCHES[nb], sx = BRST[b.st], t = tById(b.t), ok = netTenantsOK();
    if (!ok) return `<section class="panel c4" style="align-self:start" aria-labelledby="h-nd">${panelHead('store', `<span id="h-nd">${bLabel(nb)}</span>`)}
      <p>${_('Branch details need authorization through Backend-Core. Your role sees totals only.', 'تفاصيل الفرع تحتاج تفويضًا عبر Backend-Core. دورك يرى الإجماليات فقط.')}</p>
      <div class="row wrap" style="margin-top:12px">${badge(sx[2], l(sx.slice(0, 2)), sx[3])}</div>
      <div class="row wrap" style="margin-top:14px"><button class="btn sm" data-act="netclear">${_('Back to overview', 'العودة إلى النظرة العامة')}</button><button class="btn sm ghost" data-act="netask">${_('Request access (simulated)', 'طلب وصول (محاكاة)')}</button></div></section>`;
    const terms = Array.from({length:b.term}, (_x, i) => ({id:`${nb}-T${i + 1}`, ver:b.ver}));
    const svcState = b.st === 'delayed' ? [['sy', 'crit'], ['q', 'crit'], ['iv', 'warn'], ['bs', 'ok']] : b.st === 'new' ? [['sy', 'unk'], ['q', 'unk'], ['iv', 'unk'], ['bs', 'unk']] : [['sy', 'ok'], ['q', 'ok'], ['iv', 'ok'], ['bs', 'ok']];
    return `<section class="panel c4" style="align-self:start" aria-labelledby="h-nd">${panelHead('store', `<span id="h-nd">${esc(bLabel(nb))}</span>`)}
      <div class="row wrap">${badge(sx[2], l(sx.slice(0, 2)), sx[3])}<span class="chip">${esc(l(t.n))}</span></div>
      <div class="facts" style="margin-top:14px;grid-template-columns:repeat(2,minmax(0,1fr))"><div><span>${_('Last sync', 'آخر مزامنة')}</span><b class="num">${b.sync == null ? _('Never', 'أبدًا') : b.sync + ' ' + _('min ago', 'د مضت')}</b></div><div><span>${_('POS version', 'إصدار نقطة البيع')}</span><b class="num">${b.ver}</b></div></div>
      <div class="sec" style="margin-top:14px"><h3>${_('Terminals', 'الأجهزة')} (${b.term})</h3>
        <table class="tbl"><thead><tr><th>${_('Terminal', 'الجهاز')}</th><th>${_('Connectivity', 'الاتصال')}</th></tr></thead><tbody>${terms.map(x => `<tr><td class="num">${x.id}</td><td>${b.inst ? badge('b-ok', _('Reporting (demo)', 'يرسل بيانات (تجريبي)'), 'check') : badge('b-unk', _('Unknown: not instrumented', 'غير معروف: بلا قياس'), 'help')}</td></tr>`).join('')}</tbody></table></div>
      <div class="sec" style="margin-top:14px"><h3>${_('Linked Retail Tower services', 'خدمات Retail Tower المرتبطة')}</h3><ul class="sig">${svcState.map(([k, s]) => `<li>${sevDot(s)}<div><b>${l(NET_SVC[k].n)}</b></div><span class="mut" style="font-size:12.5px">${s === 'unk' ? _('Unknown', 'غير معروف') : s === 'ok' ? _('Healthy', 'سليمة') : s === 'warn' ? _('Delayed', 'متأخرة') : _('Degraded', 'متدهورة')}</span></li>`).join('')}</ul></div>
      ${b.st === 'delayed' ? `<div class="notice warn" style="margin-top:14px">${icon('alert')}<span>${_('Sales still complete at the till. Stock numbers here update late. This is inferred, not confirmed by the branch.', 'البيع ما زال يكتمل عند الصندوق. تتأخر أرقام المخزون هنا. هذا استنتاج وليس مؤكدًا من الفرع.')}</span></div>` : ''}
      <div class="row wrap" style="margin-top:14px">${b.st === 'delayed' && can('raw') ? `<button class="btn pri-btn sm" data-act="openinv" data-id="INV-418">${icon('search', 'sm')}${_('Open investigation', 'افتح التحقيق')}</button><button class="btn sm" data-act="evopen" data-id="E1">${_('Inspect evidence', 'افحص الدليل')}</button>` : ''}<button class="btn sm ghost" data-act="netsel" data-id="${b.t}">${_('Back to company', 'العودة إلى الشركة')}</button></div>
      <p class="sub" style="margin-top:12px">${_('To change a branch, use Admin-Console. This view only reads.', 'لتعديل فرع استخدم Admin-Console. هذه الشاشة للقراءة فقط.')}</p></section>`;
  }
  if (nt) {
    const t = tById(nt), aff = brAffected(t.br), ok = netTenantsOK();
    return `<section class="panel c4" style="align-self:start" aria-labelledby="h-nd">${panelHead('users', `<span id="h-nd">${esc(tLabel(nt))}</span>`)}
      <div class="row wrap"><span class="chip">${l(t.sector)}</span>${badge('b-unk', _('Subscription: unverified', 'الاشتراك: غير مؤكد'), 'help')}</div>
      <div class="facts" style="margin-top:14px;grid-template-columns:repeat(2,minmax(0,1fr))"><div><span>${_('Branches', 'الفروع')}</span><b class="num">${t.br.length}</b></div><div><span>${_('Sync delayed', 'مزامنة متأخرة')}</span><b class="num" style="color:${aff ? 'var(--amber)' : 'var(--green)'}">${aff}</b></div></div>
      ${ok ? `<ul class="sig" style="margin-top:12px">${t.br.map(id => { const b = BRANCHES[id], sx = BRST[b.st]; return `<li>${sevDot(sx[4])}<div><button class="btn-link" data-act="netbr" data-id="${id}">${esc(bLabel(id))}</button></div>${badge(sx[2], l(sx.slice(0, 2)))}</li>`; }).join('')}</ul>`
        : `<div class="redact" style="margin-top:12px">${icon('eyeoff', 'lg')}<span>${_('Branch names and details are hidden for your role. You see counts only.', 'أسماء الفروع وتفاصيلها مخفية لدورك. ترى الأعداد فقط.')}</span></div>`}
      <div class="row wrap" style="margin-top:14px"><button class="btn sm ghost" data-act="netclear">${_('Back to overview', 'العودة إلى النظرة العامة')}</button></div>
      <p class="sub" style="margin-top:12px">${_('Billing and contract data are not read. Manage the company in Admin-Console.', 'بيانات الفوترة والعقد غير مقروءة. أدر الشركة من Admin-Console.')}</p></section>`;
  }
  return `<section class="panel c4" style="align-self:start" aria-labelledby="h-nd">${panelHead('users', `<span id="h-nd">${_('Companies', 'الشركات')}</span>`, {n:st.companies})}
    <p class="sub" style="margin:-6px 0 10px">${_('Select a company or a branch on the map.', 'اختر شركة أو فرعًا على الخريطة.')}</p>
    <ul class="sig">${TENANTS.map(t => { const a = brAffected(t.br); return `<li>${sevDot(a ? 'warn' : 'ok')}<div><button class="btn-link" data-act="netsel" data-id="${t.id}">${esc(tLabel(t.id))}</button><div class="l"><span class="mut">${brN(t.br.length)}</span></div></div>${a ? badge('b-warn', a + ' ' + _('delayed', 'متأخر'), 'clock') : badge('b-ok', _('All syncing', 'الكل متزامن'), 'check')}</li>`; }).join('')}</ul></section>`;
}

function netJourney() {
  const st = netStats(), step = (n, tag, h, p, act) => `<div class="jstep"><div class="row sb"><span class="jn">${n}</span>${tag}</div><h3>${h}</h3><p>${p}</p>${act || ''}</div>`;
  return `<section class="panel c12" aria-labelledby="h-jr">${panelHead('flag', `<span id="h-jr">${_('A hypothetical multi-branch problem', 'مشكلة افتراضية متعددة الفروع')}</span>`, {right:badge('b-teal', _('Read-only', 'قراءة فقط'), 'eye')})}
    <p class="sub" style="margin:-6px 0 14px">${_('How staff would move from an alert to a safe next step. The numbers are invented.', 'كيف ينتقل الموظفون من تنبيه إلى خطوة تالية آمنة. الأرقام مخترعة.')}</p>
    <div class="jr">
      ${step(1, srcTag('obs'), _('Alert', 'تنبيه'), _('Sync timeouts rise across several branches.', 'ترتفع مهل المزامنة في عدة فروع.'))}
      ${step(2, srcTag('inf'), _('Affected scope', 'النطاق المتأثر'), `${st.affected} ${_('of', 'من')} ${st.branches} ${_('branches, in', 'فرعًا، في')} ${st.tenantsHit} ${_('companies', 'شركات')}. ${_('Counted from last-sync age.', 'محسوبة من عمر آخر مزامنة.')}`)}
      ${step(3, srcTag('obs'), _('Source evidence', 'الدليل من المصدر'), _('Error tracker and monitoring agree on the timing.', 'يتفق متتبع الأخطاء والمراقبة على التوقيت.'), `<button class="btn sm" data-act="evopen" data-id="E1">${_('Inspect E1', 'افحص E1')}</button>`)}
      ${step(4, srcTag('unk'), _('Terminals', 'الأجهزة'), `${st.terminals - BR_ORDER.filter(i => BRANCHES[i].inst).reduce((a, i) => a + BRANCHES[i].term, 0)} ${_('terminals have no telemetry. Their state is unknown, not online.', 'جهازًا بلا قياس. حالتها غير معروفة وليست متصلة.')}`)}
      ${step(5, badge('b-gold', _('Proposal', 'اقتراح'), 'lock'), _('Safe next action', 'الإجراء الآمن التالي'), _('Draft a read-only Verification item. A person approves it.', 'صياغة بند تحقق للقراءة فقط. يعتمده شخص.'), can('raw') ? `<button class="btn pri-btn sm" data-act="openinv" data-id="INV-418">${_('Open the investigation', 'افتح التحقيق')}</button>` : `<button class="btn sm" data-act="escalate" data-id="INV-418">${_('Escalate', 'تصعيد')}</button>`)}
    </div></section>`;
}
function netTable() {
  return `<section class="panel c8" aria-labelledby="h-nt">${panelHead('users', `<span id="h-nt">${_('Companies at a glance', 'الشركات في لمحة')}</span>`, {n:TENANTS.length})}
    <div class="scroll-x"><table class="tbl"><thead><tr><th>${_('Company', 'الشركة')}</th><th>${_('Sector', 'القطاع')}</th><th>${_('Branches', 'الفروع')}</th><th>${_('Sync delayed', 'مزامنة متأخرة')}</th><th>${_('Subscription', 'الاشتراك')}</th></tr></thead><tbody>${TENANTS.map(t => `<tr class="click" data-act="netsel" data-id="${t.id}" tabindex="0"><td><b>${esc(tLabel(t.id))}</b></td><td class="mut">${l(t.sector)}</td><td class="num">${t.br.length}</td><td>${brAffected(t.br) ? badge('b-warn', num(brAffected(t.br)), 'clock') : badge('b-ok', '0', 'check')}</td><td>${badge('b-unk', _('Unverified', 'غير مؤكد'), 'help')}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function netBoundary() {
  const row = (ic, h, src, s) => `<div><span class="b-unk badge">${icon(ic, 'lg')}</span><div><b>${h}</b><p>${src}</p><div style="margin-top:6px">${s}</div></div></div>`;
  return `<section class="panel c4" aria-labelledby="h-nb">${panelHead('lock', `<span id="h-nb">${_('Where this data would come from', 'من أين ستأتي هذه البيانات')}</span>`)}
    <div class="mode">
      ${row('users', _('Company', 'الشركة'), _('Backend-Core tenant read contract', 'عقد قراءة المستأجرين في Backend-Core'), badge('b-unk', _('Not authorized', 'غير مفوَّض'), 'lock'))}
      ${row('store', _('Branch', 'الفرع'), _('Backend-Core store read contract', 'عقد قراءة المتاجر في Backend-Core'), badge('b-unk', _('Not authorized', 'غير مفوَّض'), 'lock'))}
      ${row('cpu', _('Terminal', 'الجهاز'), _('POS sync heartbeat', 'نبضة مزامنة نقطة البيع'), badge('b-unk', _('Not instrumented', 'بلا قياس'), 'help'))}</div>
    <ul class="oi" style="padding:0;margin-top:12px"><li>${icon('shield', 'sm')}<span>${_('Staff only. Customers never sign in to Mission Control.', 'للموظفين فقط. لا يدخل العملاء إلى Mission Control أبدًا.')}</span></li><li>${icon('eye', 'sm')}<span>${_('Groups under 3 branches are shown as totals to non-technical roles.', 'تُعرض المجموعات الأقل من 3 فروع كإجماليات للأدوار غير التقنية.')}</span></li><li>${icon('help', 'sm')}<span>${_('Missing telemetry reads Unknown, never Online.', 'غياب القياس يُقرأ غير معروف وليس متصلًا.')}</span></li></ul></section>`;
}

SCREENS.network = () => {
  const st = netStats(), nb = S.net.branch, nt = S.net.tenant || (nb ? BRANCHES[nb].t : null);
  if (S.project !== 'all' && S.project !== 'rt') return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Customers & Branches', 'العملاء والفروع')}])}<div class="page-head"><div><h1>${_('Customers & Branches', 'العملاء والفروع')}</h1></div></div>
    ${stateBox('', 'store', _('No customer layer for this project', 'لا طبقة عملاء لهذا المشروع'), _('Only Retail Tower OS has companies and branches in this prototype. Pick All projects or Retail Tower OS to continue.', 'Retail Tower OS وحده لديه شركات وفروع في هذا النموذج. اختر كل المشاريع أو Retail Tower OS للمتابعة.'), `<button class="btn pri-btn" data-act="netall">${_('Show Retail Tower OS', 'اعرض Retail Tower OS')}</button>`)}`;
  if (S.src === 'down') return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Customers & Branches', 'العملاء والفروع')}])}<div class="page-head"><div><h1>${_('Customers & Branches', 'العملاء والفروع')}</h1></div></div>
    ${stateBox('err', 'alert', _('Not read', 'غير مقروء'), _('Sync sources could not be reached, so no branch state is shown. Unavailable is not the same as syncing, and none should be assumed healthy.', 'تعذّر الوصول إلى مصادر المزامنة، لذلك لا تُعرض حالة أي فرع. غير متاح لا يعني متزامنًا، ولا يُفترض أن شيئًا سليم.'), `<button class="btn sm" data-act="reread">${icon('refresh', 'sm')}${_('Retry read', 'إعادة المحاولة')}</button>`)}`;
  const stale = S.src === 'stale' ? `<div class="notice warn" style="margin-bottom:18px">${icon('clock')}<span>${_('Showing the last read from 9 h ago. Sync ages and branch states below were measured then and may have changed.', 'يُعرض آخر قراءة قبل 9 ساعات. أعمار المزامنة وحالات الفروع أدناه قيست حينها وقد تكون تغيّرت.')}</span></div>` : '';
  const path = [[_('Portfolio', 'المحفظة'), 'portfolio'], ['Retail Tower OS', 'netclear'], [_('Company', 'الشركة'), nt ? 'netsel' : null], [_('Branch', 'الفرع'), nb ? 'netbr' : null], [_('Terminal', 'الجهاز'), null]];
  const cur = nb ? 3 : nt ? 2 : 1;
  return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Customers & Branches', 'العملاء والفروع')}])}
  <div class="page-head"><div><h1>${_('Customers & Branches', 'العملاء والفروع')}</h1><p class="lede">${_('An imagined view of who uses Retail Tower OS, which branches they run, and how each branch links to our services.', 'عرض متخيَّل لمن يستخدم Retail Tower OS، وأي فروع يديرون، وكيف يرتبط كل فرع بخدماتنا.')}</p></div>
    <span class="badge b-gold">${icon('lock')}${_('Hypothetical · staff only', 'افتراضي · للموظفين فقط')}</span></div>
  <div class="notice ai" style="margin-bottom:18px">${icon('info')}<span><b>${_('Imagined.', 'متخيَّل.')}</b> ${_('No customer data exists in this prototype. Every company, branch and count is invented. A real version needs authorized Backend-Core read contracts.', 'لا توجد بيانات عملاء في هذا النموذج. كل شركة وفرع وعدد مخترع. النسخة الحقيقية تحتاج عقود قراءة مفوَّضة من Backend-Core.')}</span></div>${stale}
  <ol class="drill" aria-label="${_('Drill-down level', 'مستوى التعمق')}">${path.map((p, i) => `<li ${i === cur ? 'aria-current="step"' : ''} class="${i < cur ? 'done' : i === cur ? 'cur' : ''}">${p[1] && i !== cur && i < 3 ? `<button data-act="${p[1]}" data-id="${p[1] === 'netsel' ? nt : ''}">${p[0]}</button>` : `<span>${p[0]}</span>`}</li>`).join('')}</ol>
  <div class="kpis">
    <div class="kpi">${icon('users')}<div><b class="num">${st.companies}</b><span>${_('Companies (demo)', 'شركات (تجريبي)')}</span></div></div>
    <div class="kpi">${icon('store')}<div><b class="num">${st.branches}</b><span>${_('Branches (demo)', 'فروع (تجريبي)')}</span></div></div>
    <div class="kpi crit">${icon('alert')}<div><b class="num">${st.affected}<small> / ${st.branches}</small></b><span>${_('Branches with delayed sync', 'فروع بمزامنة متأخرة')}</span><span class="why">${_('Inferred from last-sync age', 'مستنتَج من عمر آخر مزامنة')}</span></div></div>
    <div class="kpi gold">${icon('help')}<div><b class="num">${st.inst}<small> / ${st.branches}</small></b><span>${_('Branches with terminal telemetry', 'فروع بقياس الأجهزة')}</span><span class="why">${_('The rest are unknown, not online', 'الباقي غير معروف وليس متصلًا')}</span></div></div></div>
  <div class="grid">
    <section class="panel c8" aria-labelledby="h-nm">${panelHead('branch', `<span id="h-nm">${_('Retail Tower network', 'شبكة Retail Tower')}</span>`, {right:badge('b-teal', _('Failing link highlighted', 'الرابط المتعطل مظلل'))})}
      <div class="map">${netMap()}</div>
      <div class="legend"><span><i></i>${_('Syncing', 'متزامن')}</span><span><i class="dash"></i>${_('Not synced yet', 'لم يتزامن بعد')}</span><span><i class="hot"></i>${_('Sync delayed', 'مزامنة متأخرة')}</span><span><span class="dot d-unk"></span>${_('Unknown', 'غير معروف')}</span></div></section>
    ${netDetail()}
    ${netJourney()}${netTable()}${netBoundary()}</div>`;
};

Object.assign(ACT, {
  netsel: el => { S.net = {tenant:el.dataset.id || S.net.tenant, branch:null}; renderApp(); },
  netbr: el => { S.net = {tenant:BRANCHES[el.dataset.id].t, branch:el.dataset.id}; renderApp(); },
  netclear: () => { S.net = {tenant:null, branch:null}; if (S.route !== 'network') go('network'); else renderApp(); },
  netall: () => { S.project = 'all'; persist(); renderApp(); },
  gonet: () => go('network', {after:() => {S.net = {tenant:null, branch:null};}}),
  netask: () => toast(_('Access request sent (simulated)', 'أُرسل طلب الوصول (محاكاة)'))
});

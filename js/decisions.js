/* Screen 04: Decision Center. Approvals here are local prototype state only. Nothing leaves the page. */
const DST = {inbox:['Awaiting decision','بانتظار القرار','b-gold','clock'], review:['In review','قيد المراجعة','b-info','eye'], approved:['Approved','تمت الموافقة','b-ok','checkc'], deferred:['Deferred','مؤجل','b-warn','clock']};
const IMP = {high:['High','عالٍ','b-crit'], med:['Medium','متوسط','b-warn'], low:['Low','منخفض','b-teal']};
function dstate(d) { return d.st === 'decided' ? d.outcome : d.st; }
/* Normalized due date for sorting. due[0] is the English label ("Nov 18"), never the localized string.
   The demo is set in 2026. An unparseable label sorts last instead of throwing. */
const DUE_MONTHS = {Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11};
function dueKey(d) {
  const m = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec(String((d.due || [])[0] || '').trim());
  return m && m[1] in DUE_MONTHS ? Date.UTC(2026, DUE_MONTHS[m[1]], +m[2]) : Infinity;
}
function dList() {
  const t = S.tab.dec, all = S.dec.filter(d => inProject(d.proj));
  let l2 = t === 'all' ? all : all.filter(d => d.st === t);
  if (S.dfilter !== 'all') l2 = l2.filter(d => d.p === +S.dfilter);
  const byDue = (a, b) => (dueKey(a) === dueKey(b) ? 0 : dueKey(a) < dueKey(b) ? -1 : 1);
  const idCmp = (a, b) => a.id.localeCompare(b.id, undefined, {numeric:true});
  return l2.slice().sort((a, b) => S.dsort === 'due' ? byDue(a, b) || a.p - b.p || idCmp(a, b) : a.p - b.p);
}
CHG.dsort = el => { S.dsort = el.value; renderApp(); };

function dCard(d) {
  const s = DST[dstate(d)];
  const di = {D1:'rocket', D2:'activity', D3:'calendar', D4:'cpu', D5:'dollar', D8:'scale', D6:'layers', D7:'globe', D9:'search'};
  return `<button class="dcard" data-act="dsel" data-id="${d.id}" aria-current="${S.dsel === d.id}"><span class="dtile p${d.p}">${icon(di[d.id] || 'decide', 'lg')}</span>
    <div><h3>${l(d.t)}</h3><div class="m"><span class="pri p${d.p}" aria-label="${_('Priority', 'الأولوية')} ${d.p}">P${d.p}</span>${badge(s[2], l(s.slice(0, 2)), s[3])}<span>${esc(l(PROJECTS[d.proj].name))}</span><span>${icon('calendar', 'sm')} ${l(d.due)}</span></div></div></button>`;
}
function dEvidence(d) {
  if (!d.ev.length) return `<div class="notice warn">${icon('alert')}<span>${_('No evidence is attached. A decision without evidence should usually be deferred.', 'لا أدلة مرفقة. القرار بلا أدلة يُفضَّل عادة تأجيله.')}</span></div>`;
  return `<ul class="evlist">${d.ev.map(k => { const e = EVIDENCE[k]; return `<li><div class="ev" style="padding:10px 0"><span class="evsrc">${icon(e.ic)}</span><div><h3>${l(e.t)}</h3><div class="m">${srcTag(e.kind)}<span>${l(e.src)}</span>${freshTag(e.age)}</div></div><button class="btn sm" data-act="evopen" data-id="${k}">${_('Inspect', 'فحص')}</button></div></li>`; }).join('')}</ul>`;
}
function dApproval(d) {
  const st = dstate(d), pick = S.approvals[d.id] || (d.opts.find(o => o.rec) || d.opts[0]).id;
  if (d.st === 'decided') {
    const last = d.hist[d.hist.length - 1];
    return `<div class="approval done"><div class="row">${icon('checkc', 'lg')}<div><b>${st === 'approved' ? _('Approved', 'تمت الموافقة') : _('Deferred', 'تم التأجيل')}${d.chosen ? ': ' + esc(l(d.opts.find(o => o.id === d.chosen).t)) : ''}</b><div class="sub">${l(last.w)} · ${last.t}</div></div></div>
      <p class="sub">${_('Recorded in this prototype only. No production action was run.', 'سُجّل في هذا النموذج فقط. لم يُنفَّذ أي إجراء إنتاجي.')}</p></div>`;
  }
  const owner = can('approve');
  return `<div class="approval"><div class="row">${icon('lock', 'lg')}<div><b>${_('Human approval required', 'مطلوب موافقة بشرية')}</b><div class="sub">${owner ? _('You are the approver in this demo.', 'أنت المعتمِد في هذا العرض.') : _('Only the Owner can approve. You can ask for a review.', 'المالك وحده يعتمد. يمكنك طلب مراجعة.')}</div></div></div>
    <div class="radios" role="radiogroup" aria-label="${_('Choose an option', 'اختر خيارًا')}">${d.opts.map(o => `<button role="radio" aria-checked="${pick === o.id}" data-act="dopt" data-id="${d.id}" data-v="${o.id}" ${owner ? '' : 'disabled'}><i></i><span>${l(o.t)}${o.rec ? ` <span class="badge b-gold" style="height:20px;font-size:11px">${_('Recommended', 'موصى به')}</span>` : ''}<small>${l(o.d)}</small></span></button>`).join('')}</div>
    <div class="row wrap">${owner ? `<button class="btn pri-btn" data-act="dapprove" data-id="${d.id}">${icon('check', 'sm')}${_('Approve chosen option', 'اعتماد الخيار المحدد')}</button><button class="btn" data-act="dchanges" data-id="${d.id}">${_('Request more evidence', 'طلب أدلة إضافية')}</button><button class="btn ghost" data-act="ddefer" data-id="${d.id}">${_('Defer', 'تأجيل')}</button>`
      : `<button class="btn pri-btn" data-act="dask" data-id="${d.id}">${icon('send', 'sm')}${_('Ask the Owner to review (simulated)', 'اطلب من المالك المراجعة (محاكاة)')}</button>`}</div>
    <p class="sub">${_('Approving records your choice here only. It never runs a production action.', 'الاعتماد يسجّل اختيارك هنا فقط. ولا ينفّذ أي إجراء إنتاجي.')}</p></div>`;
}
function dDetail(d) {
  const s = DST[dstate(d)], p = PROJECTS[d.proj];
  return `<div class="dh"><div class="panel" style="display:grid;gap:14px">
    <div class="row wrap"><span class="pri p${d.p}">P${d.p}</span>${badge(s[2], l(s.slice(0, 2)), s[3])}<span class="mut num" style="font-size:12.5px">${d.id}</span>${demoTag()}</div>
    <h2>${l(d.t)}</h2><p class="sub" style="font-size:14px">${l(d.why)}</p>
    <div class="facts"><div><span>${_('Impact', 'الأثر')}</span><b>${badge(IMP[d.impact][2], l(IMP[d.impact].slice(0, 2)))}</b></div><div><span>${_('Priority', 'الأولوية')}</span><b>P${d.p}</b></div><div><span>${_('Review time', 'وقت المراجعة')}</span><b>${_('About', 'نحو')} ${d.est} ${_('min', 'دقيقة')}</b></div><div><span>${_('Needed by', 'مطلوب قبل')}</span><b>${l(d.due)}</b></div></div></div>
  <div class="grid">
    <section class="panel c7" aria-labelledby="h-dev">${panelHead('file', `<span id="h-dev">${_('Supporting evidence', 'الأدلة الداعمة')}</span>`, {n:d.ev.length})}${dEvidence(d)}
      <div class="sec" style="margin-top:14px"><h3>${_('Linked', 'مرتبط')}</h3><div class="chips"><button class="chip" data-act="product" data-id="${d.proj}">${icon(p.icon, 'sm')}${esc(l(p.name))}</button>${d.inv && can('raw') ? `<button class="chip" data-act="openinv" data-id="${d.inv}">${icon('search', 'sm')}${d.inv}</button>` : ''}${d.inv && !can('raw') ? `<span class="chip" style="color:var(--muted)">${icon('eyeoff', 'sm')}${_('Investigation hidden for your role', 'التحقيق مخفي لدورك')}</span>` : ''}</div></div></section>
    <section class="panel c5" aria-labelledby="h-dopt">${panelHead('scale' in ICONS ? 'scale' : 'decide', `<span id="h-dopt">${_('Options and risks', 'الخيارات والمخاطر')}</span>`)}
      <div class="opts">${d.opts.map(o => `<div class="opt ${o.rec ? 'rec' : ''}"><div><h4>${l(o.t)}${o.rec ? badge('b-gold', _('Recommended', 'موصى به')) : ''}</h4><p>${l(o.d)}</p><p style="color:var(--amber)">${l(o.r)}</p></div></div>`).join('')}</div></section>
    <section class="c12">${dApproval(d)}</section>
    <section class="panel c12" aria-labelledby="h-aud">${panelHead('history', `<span id="h-aud">${_('Decision history and audit', 'سجل القرار والتدقيق')}</span>`, {n:d.hist.length})}
      <ul class="audit">${d.hist.slice().reverse().map(h => `<li><time>${h.t}</time><span><b>${l(h.w)}</b> · ${l(h.a)}</span></li>`).join('')}</ul></section></div></div>`;
}
SCREENS.decisions = () => {
  const all = S.dec.filter(d => inProject(d.proj)), c = k => all.filter(d => d.st === k).length;
  const list = dList(); let d = S.dec.find(x => x.id === S.dsel);
  if (!d || !list.includes(d)) d = list[0] || null; if (d) S.dsel = d.id;
  const pills = [['all', _('All', 'الكل')], ['1', 'P1'], ['2', 'P2'], ['3', 'P3']];
  const side = `<section class="panel tight">${panelHead('filter', _('Queue', 'الطابور'), {nodemo:true, n:list.length})}
    <div class="row sb wrap" style="margin-bottom:12px"><div class="pills" role="group" aria-label="${_('Priority', 'الأولوية')}">${pills.map(p => `<button class="pill" data-act="dpri" data-v="${p[0]}" aria-pressed="${S.dfilter === p[0]}">${p[1]}</button>`).join('')}</div>
      <label class="sel"><span class="sr">${_('Sort', 'الترتيب')}</span><select class="plain" data-chg="dsort" style="height:34px;padding-block:5px;font-size:13px"><option value="priority" ${S.dsort === 'priority' ? 'selected' : ''}>${_('Priority first', 'الأولوية أولًا')}</option><option value="due" ${S.dsort === 'due' ? 'selected' : ''}>${_('Soonest due', 'الأقرب موعدًا')}</option></select>${icon('chevd', 'chev')}</label></div>
    <div class="dlist">${list.length ? list.map(dCard).join('') : stateBox('', 'decide', _('Nothing here', 'لا شيء هنا'), _('No decisions match this tab and filter.', 'لا قرارات تطابق هذا التبويب والمرشح.'))}</div></section>`;
  return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Decisions', 'القرارات')}])}
  <div class="page-head"><div><h1>${_('Decision Center', 'مركز القرارات')}</h1><p class="lede">${_('Requests that need your review and approval, with the evidence behind each.', 'طلبات تحتاج مراجعتك واعتمادك، مع الأدلة خلف كل منها.')}</p></div>
    <span class="badge b-gold">${icon('lock')}${_('Approvals stay in this prototype', 'الاعتمادات تبقى داخل النموذج')}</span></div>
  ${tabsHTML('dec', [['inbox', _('My inbox', 'صندوقي'), c('inbox')], ['review', _('In review', 'قيد المراجعة'), c('review')], ['decided', _('Decided', 'تم البت'), c('decided')], ['all', _('All', 'الكل'), all.length]])}
  <div class="declayout"><aside>${side}</aside><div style="min-width:0" role="tabpanel" aria-labelledby="tab-dec-${S.tab.dec}">${d ? dDetail(d) : stateBox('', 'decide', _('No decision selected', 'لا قرار محدد'), _('Pick a decision from the queue.', 'اختر قرارًا من الطابور.'))}</div></div>`;
};

function logDecision(d, who, en, ar) {
  d.hist.push({w:who, a:[en, ar], t:'Nov 15, 15:2' + Math.min(9, d.hist.length)});
}
Object.assign(ACT, {
  dsel: el => { S.dsel = el.dataset.id; renderApp(); const h = $('.dh h2'); if (h && window.innerWidth <= 1100) h.scrollIntoView({block:'start', behavior:'smooth'}); },
  dpri: el => { S.dfilter = el.dataset.v; renderApp(); },
  dopt: el => { S.approvals[el.dataset.id] = el.dataset.v; renderApp(); },
  dapprove: el => {
    const d = S.dec.find(x => x.id === el.dataset.id), pick = S.approvals[d.id] || (d.opts.find(o => o.rec) || d.opts[0]).id, o = d.opts.find(x => x.id === pick);
    d.st = 'decided'; d.outcome = 'approved'; d.chosen = pick;
    logDecision(d, ['Owner (demo)', 'المالك (تجريبي)'], 'Approved: ' + o.t[0], 'تمت الموافقة: ' + o.t[1]);
    S.tab.dec = 'decided'; renderApp(); toast(_('Recorded locally. No production action ran.', 'سُجّل محليًا. لم يُنفَّذ أي إجراء إنتاجي.'));
  },
  ddefer: el => {
    const d = S.dec.find(x => x.id === el.dataset.id); d.st = 'decided'; d.outcome = 'deferred'; d.chosen = null;
    logDecision(d, ['Owner (demo)', 'المالك (تجريبي)'], 'Deferred', 'تم التأجيل'); S.tab.dec = 'decided'; renderApp(); toast(_('Deferred (prototype only)', 'أُجّل (نموذج فقط)'));
  },
  dchanges: el => {
    const d = S.dec.find(x => x.id === el.dataset.id); d.st = 'review';
    logDecision(d, ['Owner (demo)', 'المالك (تجريبي)'], 'Asked for more evidence', 'طلب أدلة إضافية'); S.tab.dec = 'review'; renderApp(); toast(_('Sent back for more evidence (simulated)', 'أُعيد لطلب أدلة إضافية (محاكاة)'));
  },
  dask: el => { const d = S.dec.find(x => x.id === el.dataset.id); logDecision(d, [personaName(S.persona) + ' (demo)', personaName(S.persona) + ' (تجريبي)'], 'Asked the Owner to review', 'طلب من المالك المراجعة'); renderApp(); toast(_('Review requested (simulated)', 'طُلبت المراجعة (محاكاة)')); }
});

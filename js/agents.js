/* Screen 05: Agent Control. Every agent and task here is SIMULATED. Nothing is connected to any system. */
const MODE = {read:['Read-only analysis','تحليل للقراءة فقط','b-ai','eye'], propose:['Proposes, human approves','يقترح والإنسان يعتمد','b-gold','lock'], exec:['Execution off','التنفيذ متوقف','b-unk','ban']};
const AST = {running:['Running','قيد التشغيل','b-teal'], idle:['Idle','خامل','b-unk'], approval:['Waiting for approval','بانتظار الموافقة','b-gold'], off:['Off','متوقف','b-unk']};
const TIMERS = {}, DONE_APPROVAL = {};

function agState(a) {
  if (S.runs[a.id]) return {st:'running', prog:S.runs[a.id].prog, task:S.runs[a.id].task};
  if (a.id === 'A4' && DONE_APPROVAL.A4) return {st:'idle', prog:0, task:['Approval recorded (simulated). Nothing executed.', 'سُجّلت الموافقة (محاكاة). لم يُنفَّذ شيء.']};
  return {st:a.st, prog:a.prog, task:a.task};
}
function histAll() { return (S.hist.items || []).concat(HISTORY); }
function agentCost() { return AGENTS.reduce((s, a) => s + a.cost, 0); }

function agentRow(a) {
  const s = agState(a), m = MODE[a.mode], st = AST[s.st];
  return `<button class="arow" data-act="agent" data-id="${a.id}"><span class="ag ${a.mode === 'exec' ? 'off' : 't-' + a.id}">${icon(a.icon, 'lg')}</span>
    <div style="min-width:0"><div class="row wrap" style="gap:8px"><h3>${l(a.n)}</h3><span class="mut" style="font-size:12.5px">${l(a.role)}</span></div>
      <div class="m">${esc(l(s.task))}</div>
      ${s.st === 'running' ? `<div class="prog" style="margin-top:8px" role="progressbar" aria-valuenow="${s.prog}" aria-valuemin="0" aria-valuemax="100"><i data-prog="${a.id}" style="width:${s.prog}%"></i></div>` : ''}
      <div class="row wrap" style="margin-top:8px">${badge(m[2], l(m.slice(0, 2)), m[3])}${badge(st[2], l(st.slice(0, 2)))}</div></div>${icon('chev', 'flip')}</button>`;
}
function boundaries() {
  const t = (ic, cls, h, p) => `<div><span class="${cls}">${icon(ic, 'lg')}</span><div><b>${h}</b><p>${p}</p></div></div>`;
  return `<section class="panel c5" aria-labelledby="h-bnd">${panelHead('shield', `<span id="h-bnd">${_('Human approval boundaries', 'حدود الموافقة البشرية')}</span>`)}
    <div class="mode">
      ${t('eye', 'b-ai badge', _('Read and summarize', 'القراءة والتلخيص'), _('Automatic. Agents read evidence and write summaries. They change nothing.', 'تلقائي. يقرأ الوكلاء الأدلة ويكتبون الملخصات. ولا يغيّرون شيئًا.'))}
      ${t('lock', 'b-gold badge', _('Propose a change', 'اقتراح تغيير'), _('A person reviews the proposal. Nothing runs until they approve it.', 'يراجع شخص الاقتراح. لا يعمل شيء حتى يوافق عليه.'))}
      ${t('ban', 'b-unk badge', _('Execute a change', 'تنفيذ تغيير'), _('Needs explicit sign-off in the source system. Switched off in this prototype.', 'يحتاج موافقة صريحة في النظام المصدر. متوقف في هذا النموذج.'))}</div></section>`;
}
function costPanel() {
  const max = Math.max(...AGENTS.map(a => a.cost));
  return `<section class="panel c5" aria-labelledby="h-cost">${panelHead('dollar', `<span id="h-cost">${_('Cost by agent, last 24 h', 'التكلفة لكل وكيل، آخر 24 ساعة')}</span>`)}
    <div class="bars">${AGENTS.map(a => `<div class="bar"><span>${l(a.n)}</span><div class="t" role="img" aria-label="$${a.cost.toFixed(2)}"><i style="width:${max ? a.cost / max * 100 : 0}%"></i></div><b class="num">$${a.cost.toFixed(2)}</b></div>`).join('')}</div>
    <p class="sub" style="margin-top:12px">${_('Estimated spend, simulated. Total', 'إنفاق تقديري، محاكى. الإجمالي')} <b class="num" style="color:var(--ink)">$${agentCost().toFixed(2)}</b></p></section>`;
}
function histPanel() {
  const t = S.tab.agents, all = histAll().map(h => ({...h, st:(h.st === 'approval' && DONE_APPROVAL[h.a]) ? 'done' : h.st}));
  const f = t === 'all' ? all : all.filter(h => (t === 'running' && h.st === 'running') || (t === 'approval' && h.st === 'approval') || (t === 'done' && h.st === 'done'));
  const cnt = k => all.filter(h => h.st === k).length;
  const sb = {running:['Running','قيد التشغيل','b-teal'], approval:['Needs approval','يحتاج موافقة','b-gold'], done:['Completed','مكتمل','b-ok']};
  return `<section class="panel c12" aria-labelledby="h-hist">${panelHead('history', `<span id="h-hist">${_('Tasks and execution history', 'المهام وسجل التنفيذ')}</span>`, {n:f.length})}
    ${tabsHTML('agents', [['all', _('All', 'الكل'), all.length], ['running', _('Running', 'قيد التشغيل'), cnt('running')], ['approval', _('Needs approval', 'يحتاج موافقة'), cnt('approval')], ['done', _('Completed', 'مكتمل'), cnt('done')]])}
    <div class="scroll-x" role="tabpanel" aria-labelledby="tab-agents-${t}">${f.length ? `<table class="tbl"><thead><tr><th>${_('Task', 'المهمة')}</th><th>${_('Agent', 'الوكيل')}</th><th>${_('When', 'متى')}</th><th>${_('Status', 'الحالة')}</th><th>${_('Outcome', 'النتيجة')}</th><th></th></tr></thead><tbody>${f.map(h => {
      const a = AGENTS.find(x => x.id === h.a);
      return `<tr><td><b>${l(h.t)}</b></td><td>${l(a.n)}</td><td class="mut">${ago(h.ago)}</td><td>${badge(sb[h.st][2], l(sb[h.st].slice(0, 2)))}</td><td class="mut">${l(h.out)}</td><td style="text-align:end">${h.st === 'approval' ? `<button class="btn sm ${can('approve') ? 'pri-btn' : ''}" data-act="agentapprove" data-id="${h.a}" ${can('approve') ? '' : 'disabled'}>${_('Approve', 'اعتماد')}</button>` : `<button class="btn sm ghost" data-act="agent" data-id="${h.a}">${_('Details', 'تفاصيل')}</button>`}</td></tr>`; }).join('')}</tbody></table>` : stateBox('', 'history', _('Nothing here yet', 'لا شيء بعد'), _('No simulated tasks match this filter.', 'لا مهام محاكاة تطابق هذا المرشح.'))}</div></section>`;
}
SCREENS.agents = () => {
  const run = AGENTS.filter(a => agState(a).st === 'running').length, ap = AGENTS.filter(a => agState(a).st === 'approval').length;
  return `${crumbs([{t:_('Home', 'الرئيسية'), act:'nav', id:'home'}, {t:_('Agents', 'الوكلاء')}])}
  <div class="page-head"><div><h1>${_('Agent Control', 'التحكم في الوكلاء')}</h1><p class="lede">${_('The future AI orchestration layer: who can do what, what they are working on, and where a human must approve.', 'طبقة تنسيق الذكاء الاصطناعي المستقبلية: من يستطيع فعل ماذا، وماذا يعمل عليه، وأين يجب أن يوافق إنسان.')}</p></div>
    <button class="btn pri-btn" data-act="agentnew" ${can('run') ? '' : 'disabled'}>${icon('play', 'sm')}${_('Run simulated task', 'تشغيل مهمة محاكاة')}</button></div>
  <div class="notice ai" style="margin-bottom:20px">${icon('info')}<span><b>${_('Simulated.', 'محاكاة.')}</b> ${_('These agents and tasks are placeholders for design review. No agent is connected to any system, and none can act.', 'هذه الوكلاء والمهام عناصر نموذجية لمراجعة التصميم. لا وكيل متصل بأي نظام ولا يستطيع أحد التنفيذ.')}${can('run') ? '' : ' ' + _('Your role can view agents but not run them.', 'يمكن لدورك عرض الوكلاء دون تشغيلهم.')}</span></div>
  <div class="kpis">
    <div class="kpi vio">${icon('bot')}<div><b class="num">${AGENTS.length}</b><span>${_('Agents (simulated)', 'وكلاء (محاكاة)')}</span></div></div>
    <div class="kpi">${icon('play')}<div><b class="num">${run}</b><span>${_('Running now', 'قيد التشغيل الآن')}</span></div></div>
    <div class="kpi gold">${icon('lock')}<div><b class="num">${ap}</b><span>${_('Waiting for approval', 'بانتظار الموافقة')}</span></div></div>
    <div class="kpi">${icon('dollar')}<div><b class="num">$${agentCost().toFixed(2)}</b><span>${_('Est. cost, last 24 h', 'التكلفة التقديرية، آخر 24 ساعة')}</span><span class="why">${_('Simulated', 'محاكى')}</span></div></div></div>
  <div class="grid"><section class="panel c7" aria-labelledby="h-ag">${panelHead('bot', `<span id="h-ag">${_('Specialist agents', 'الوكلاء المتخصصون')}</span>`, {n:AGENTS.length})}<div class="invlist">${AGENTS.map(agentRow).join('')}</div></section>
    <div class="c5" style="display:grid;gap:20px;align-content:start">${boundaries().replace('panel c5', 'panel')}${costPanel().replace('panel c5', 'panel')}</div>${histPanel()}</div>`;
};

DRAWERS.agent = id => {
  const a = AGENTS.find(x => x.id === id), s = agState(a), m = MODE[a.mode], st = AST[s.st];
  const pv = {r:['Read','قراءة','b-teal','eye'], p:['Proposal only','اقتراح فقط','b-gold','lock'], n:['Not allowed','غير مسموح','b-unk','ban']};
  const mine = histAll().filter(h => h.a === id).slice(0, 4);
  return {
    title:`<span class="row" style="gap:12px"><span class="ag ${a.mode === 'exec' ? 'off' : 't-' + a.id}">${icon(a.icon, 'lg')}</span><span>${l(a.n)}<small style="display:block;font-size:13px;font-weight:400;color:var(--ink-2)">${l(a.role)}</small></span></span>`,
    sub:badge(m[2], l(m.slice(0, 2)), m[3]) + badge(st[2], l(st.slice(0, 2))) + `<span class="badge b-ai">${_('Simulated', 'محاكاة')}</span>`,
    body:`<div class="sec"><h3>${_('Current task', 'المهمة الحالية')}</h3><p>${esc(l(s.task))}</p>${s.st === 'running' ? `<div class="prog" role="progressbar" aria-valuenow="${s.prog}" aria-valuemin="0" aria-valuemax="100"><i data-prog="${a.id}" style="width:${s.prog}%"></i></div>` : ''}
      <div class="row wrap">${s.st === 'approval' ? `<button class="btn pri-btn" data-act="agentapprove" data-id="${a.id}" ${can('approve') ? '' : 'disabled'}>${icon('check', 'sm')}${_('Approve proposal (simulated)', 'اعتماد الاقتراح (محاكاة)')}</button>` : ''}
      ${a.mode !== 'exec' && s.st !== 'running' && s.st !== 'approval' ? `<button class="btn ai" data-act="agentrun" data-id="${a.id}" ${can('run') ? '' : 'disabled'}>${icon('play', 'sm')}${_('Run simulated task', 'تشغيل مهمة محاكاة')}</button>` : ''}</div>
      ${S.runs[a.id] ? `<ul class="audit" style="margin-top:4px">${S.runs[a.id].log.map(x => `<li><time>${x[0]}</time><span>${l(x[1])}</span></li>`).join('')}</ul>` : ''}</div>
    <div class="sec"><h3>${_('What it can do', 'ما الذي يستطيع فعله')}</h3><ul class="oi" style="padding:0">${a.caps.map(c => `<li>${icon('check', 'sm')}<span>${l(c)}</span></li>`).join('')}</ul></div>
    <div class="sec"><h3>${_('Permissions', 'الصلاحيات')}</h3><table class="perm"><tbody>${PERMS.map(p => `<tr><td>${l(p[1])}</td><td>${badge(pv[a.perm[p[0]]][2], l(pv[a.perm[p[0]]].slice(0, 2)), pv[a.perm[p[0]]][3])}</td></tr>`).join('')}</tbody></table>
      <div class="notice">${icon('lock')}<span>${_('Anything beyond reading needs a person to approve it in the source system.', 'أي شيء يتجاوز القراءة يحتاج موافقة شخص في النظام المصدر.')}</span></div></div>
    <div class="sec"><h3>${_('Cost and resources, last 24 h (simulated)', 'التكلفة والموارد، آخر 24 ساعة (محاكاة)')}</h3><div class="facts"><div><span>${_('Est. cost', 'التكلفة')}</span><b class="num">$${a.cost.toFixed(2)}</b></div><div><span>${_('Runs', 'التشغيلات')}</span><b class="num">${a.runs}</b></div><div><span>${_('Est. tokens', 'الرموز')}</span><b class="num">${Math.round(a.cost * 29)}k</b></div><div><span>${_('Data access', 'الوصول للبيانات')}</span><b>${_('Read-only', 'قراءة فقط')}</b></div></div></div>
    <div class="sec"><h3>${_('Recent tasks', 'المهام الأخيرة')}</h3>${mine.length ? `<ul class="audit">${mine.map(h => `<li><time>${ago(h.ago)}</time><span><b>${l(h.t)}</b> · ${l(h.out)}</span></li>`).join('')}</ul>` : `<p class="mut">${_('None in the demo.', 'لا شيء في العرض التجريبي.')}</p>`}</div>`
  };
};

function startRun(id) {
  const a = AGENTS.find(x => x.id === id); if (S.runs[id]) return;
  const steps = [[['Reading sources (sample)', 'قراءة المصادر (عينة)']], [['Comparing recent changes', 'مقارنة التغييرات الأخيرة']], [['Ranking hypotheses', 'ترتيب الفرضيات']], [['Writing a read-only summary', 'كتابة ملخص للقراءة فقط']]];
  S.runs[id] = {prog:0, task:['Simulated task: ' + a.task[0].toLowerCase(), 'مهمة محاكاة: ' + a.task[1]], log:[['00:00', ['Task started (simulated)', 'بدأت المهمة (محاكاة)']]]};
  let i = 0; renderApp(); if (S.drawer) renderOverlay();
  TIMERS[id] = setInterval(() => {
    i++; const r = S.runs[id]; if (!r) { clearInterval(TIMERS[id]); return; }
    if (i <= steps.length) { r.prog = Math.round(i / steps.length * 100); r.log.push(['00:0' + i, steps[i - 1][0]]); }
    if (i > steps.length) {
      clearInterval(TIMERS[id]); delete S.runs[id]; (S.hist.items = S.hist.items || []).unshift({id:'X' + Date.now(), a:id, st:'done', t:a.task, ago:0, out:['Completed (simulated). Nothing was changed.', 'اكتمل (محاكاة). لم يتغير شيء.']});
      renderApp(); if (S.drawer && S.drawer.kind === 'agent') renderOverlay(); toast(_('Simulated task finished. Nothing was changed.', 'انتهت مهمة المحاكاة. لم يتغير شيء.')); return;
    }
    $$('[data-prog="' + id + '"]').forEach(e => { e.style.width = r.prog + '%'; });
    if (S.drawer && S.drawer.kind === 'agent' && S.drawer.id === id) { const df = document.activeElement; renderOverlay(); const b = $('#drawer'); if (b && df && df.dataset && df.dataset.act) { const t = $$('#drawer [data-act]').find(e => fkOf(e) === fkOf(df)); if (t) t.focus(); } }
  }, 900);
}
Object.assign(ACT, {
  agent: el => openDrawer('agent', el.dataset.id, el),
  agentrun: el => startRun(el.dataset.id),
  agentnew: el => { const a = AGENTS.find(x => x.mode !== 'exec' && agState(x).st === 'idle'); if (!a) { toast(_('All agents are busy or switched off', 'كل الوكلاء مشغولون أو متوقفون')); return; } toast(_('Starting a simulated task on ', 'بدء مهمة محاكاة لدى ') + l(a.n)); startRun(a.id); },
  agentapprove: el => { DONE_APPROVAL[el.dataset.id] = true; renderApp(); if (S.drawer) renderOverlay(); toast(_('Approval recorded. Nothing was executed (simulated).', 'سُجّلت الموافقة. لم يُنفَّذ شيء (محاكاة).')); }
});

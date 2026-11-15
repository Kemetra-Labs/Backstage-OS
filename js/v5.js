/* v5: fixes from the second finish review. Overrides earlier definitions. Demo data only. */

/* Investigation: graph + observed/inferred share the centre column so it fills; streams reach into the graph. */
overviewTab = function (v) {
  const hud = s => s.replace(/class="panel( violet| gold)?/, m => m + ' hudp');
  return `${srcBanner()}<div class="hud">
    <div class="hud-l">${hud(warCore(v))}${hud(warHyp(v))}${warWhy(v)}</div>
    <div class="hud-c">${warGraph(v)}${hud(oiPanel(v).replace('panel c8', 'panel'))}</div>
    <div class="hud-r">${hud(warOwn(v))}${hud(warChanges(v))}${hud(warBlast(v))}${hud(warActions(v))}</div>
    <div class="hud-tl">${hud(warTimeline(v))}</div>
    <div class="hud-st">${warStatus(v)}</div></div>`;
};
const _coreSVG = coreSVG;
coreSVG = function () {
  return _coreSVG().replace('M176 84 C 215 70, 245 96, 296 78', 'M176 84 C 220 66, 260 98, 350 80')
    .replace('M176 104 C 220 110, 250 100, 296 112', 'M176 104 C 230 112, 270 98, 350 110')
    .replace('M176 126 C 212 142, 248 124, 296 146', 'M176 126 C 220 146, 266 124, 350 142');
};

/* Trajectory chart drawn at the container's real width so text stays 12 px. */
function trajSized(cls, w, h) {
  const chart = lineChart({id:'traj', label:['Milestones planned to date and done, by week', 'المعالم المخططة حتى تاريخه والمنجزة، أسبوعيًا'], x:TRAJ.x, ymax:24, ticks:[0, 6, 12, 18, 24], w, h,
    series:[{name:['Planned to date', 'المخطط حتى الآن'], color:'var(--ch-2)', data:TRAJ.planned, dash:true, lab:'up'}, {name:['Done', 'المنجز'], color:'var(--ch-1)', data:TRAJ.done, lab:'down', area:true}]});
  return `<section class="panel ${cls}" aria-labelledby="h-traj">${panelHead('activity', `<span id="h-traj">${_('Company Trajectory', 'مسار الشركة')}</span>`)}
    <p class="sub" style="margin:-6px 0 8px">${_('All three products together, cumulative milestones per week.', 'المنتجات الثلاثة معًا، المعالم التراكمية أسبوعيًا.')}</p>${chart}</section>`;
}
homeTraj = () => trajSized('c8', 880, 250);
productsTab = function () {
  const v = visProjects();
  return `<div class="grid"><section class="panel c12" aria-label="${_('Products', 'المنتجات')}">${panelHead('layers', _('Products', 'المنتجات'), {n:v.length})}<div class="pcards">${v.map(richCard).join('')}</div></section>
    ${trajSized('c12', 1260, 280)}</div>`;
};

/* Home inbox: neutral titles; priority shown by the edge and badge only. */
const _inbox = inboxPanel;
inboxPanel = () => _inbox().replace(/class="irow p(\d)"/g, 'class="irow ip$1"');

/* Customers: Arabic-safe "no sync" text. */
const _netMap = netMap;
netMap = () => S.lang === 'ar' ? _netMap().replace(/>لا مزامنة</g, '>—<') : _netMap();

/* Design System: real tokens, both title sizes, data-viz samples, logo lockup. */
const _ds = SCREENS['design-system'];
SCREENS['design-system'] = () => {
  let h = _ds()
    .replace('#080F1A', '#060B13').replace('#101C2B', '#0C1622').replace('#17273A', '#132134').replace('#F4B64B', '#F59A2E')
    .replace("H1 · 36 / 700", 'Home title · 50 / 700').replace('font-size:34px;font-weight:700', 'font-size:44px;font-weight:700')
    .replace('<section class="panel c5">', '<section class="panel c5" style="align-self:start">')
    .replace("H2 · 22 / 650", 'Page title · 28 / 650').replace('font-size:22px;font-weight:650', 'font-size:28px;font-weight:650');
  const R = 30, C = 2 * Math.PI * R, ring = `<svg viewBox="0 0 80 80" width="96" height="96" aria-hidden="true"><circle cx="40" cy="40" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--teal)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * .55} ${C}" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" style="fill:#EAF0F8;font:700 15px var(--f-ui)">12/22</text></svg>`;
  const area = `<svg viewBox="0 0 200 80" width="100%" height="96" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,80 0,62 30,58 60,50 90,52 120,36 150,30 180,18 200,14 200,80" fill="var(--ch-1)" opacity=".18"/><polyline points="0,62 30,58 60,50 90,52 120,36 150,30 180,18 200,14" fill="none" stroke="var(--ch-1)" stroke-width="2"/></svg>`;
  const bars = `<svg viewBox="0 0 200 80" width="100%" height="96" preserveAspectRatio="none" aria-hidden="true">${[30, 44, 36, 56, 48, 66, 58, 74].map((v, i) => `<rect x="${i * 25 + 4}" y="${80 - v}" width="17" height="${v}" rx="3" fill="${i === 7 ? 'var(--gold)' : 'var(--ch-3)'}" opacity="${i === 7 ? 1 : .75}"/>`).join('')}</svg>`;
  const extra = `<section class="panel c8">${panelHead('bars', _('Data visualization samples', 'نماذج عرض البيانات'), {nodemo:true})}<div class="dvs"><div>${ring}<small>${_('Progress ring · done ÷ planned', 'حلقة التقدم · المنجز ÷ المخطط')}</small></div><div>${area}<small>${_('Trend · area with one line', 'الاتجاه · مساحة بخط واحد')}</small></div><div>${bars}<small>${_('Comparison · one highlighted bar', 'المقارنة · عمود واحد مميز')}</small></div></div></section>
    <section class="panel c4">${panelHead('flag', _('Logo lockup', 'شعار العلامة'), {nodemo:true})}<div class="lockup">${logoMark()}<div><b>Kemetra Labs</b><span>${_('Mission Control', 'مركز القيادة')}</span></div></div><p class="sub" style="margin-top:12px">${_('Gold pyramid mark with a K. Use on dark surfaces only. Keep clear space equal to the mark height.', 'علامة الهرم الذهبي مع حرف K. تُستخدم على الأسطح الداكنة فقط. اترك مساحة فارغة بقدر ارتفاع العلامة.')}</p></section>`;
  return h.replace(/<\/div>\s*$/, extra + '</div>');
};

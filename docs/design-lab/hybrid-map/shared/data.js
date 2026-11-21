/* Hybrid Mission Map pilot: shared data + derivation. Design exploration only, not application code.
 *
 * Every raw value below is copied from the V2 lab fixture (app/src/design-lab/v2/fixtures/world.ts and
 * app/src/fixture/inv-demo-7.ts). Every figure shown by a concept is DERIVED here with the same rules as
 * app/src/contract/rules.ts (freshnessOf, effectiveFreshness, resolveLabel, resolveHealth) and
 * app/src/design-lab/v2/logic/status.ts (nodeStatus, sourceStatus, isRiskNode) and logic/evidence.ts (nodeChip).
 * Nothing is invented. All concepts read this one file so they differ in layout and visuals, not in data.
 * Positions (x, y) are presentational only and are chosen per concept (see layouts in a.js / b.js / c.js).
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const LANG = q.get('lang') === 'ar' ? 'ar' : 'en';
  const RM = q.get('motion') === 'reduce';
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  if (RM) document.documentElement.dataset.motion = 'reduce';

  const NOW = '2026-11-16T14:09:00Z';
  const MIN = 60000;
  const minutesSince = (iso) => Math.round((Date.parse(NOW) - Date.parse(iso)) / MIN);

  /* ---------- sources (inv-demo-7 + world.ts) ---------- */
  const RAW_SOURCES = [
    { id: 'github', conn: 'reachable', age: 6, ttl: 1800, claim: 'healthy', basis: ['E-8'] },
    { id: 'jira', conn: 'reachable', age: 12, ttl: 7200, claim: 'healthy', basis: [] },
    { id: 'sentry', conn: 'reachable', age: 540, ttl: 900, claim: 'healthy', basis: ['E-5'] },
    { id: 'datadog', conn: 'not_configured', age: null, ttl: 900, claim: 'unknown', basis: [] },
    { id: 'confluence', conn: 'not_configured', age: null, ttl: 3600, claim: 'unknown', basis: [] },
    { id: 'port', conn: 'unavailable', age: 1500, ttl: 86400, claim: 'unknown', basis: ['E-9'] },
  ];
  // rules.ts freshnessOf
  const freshnessOf = (s) => {
    if (s.conn === 'not_configured' || s.age === null) return 'unknown';
    if (s.conn === 'unavailable') return 'stale';
    return s.age * 60 > s.ttl ? 'stale' : 'current';
  };
  const srcById = (id) => RAW_SOURCES.find((s) => s.id === id);

  /* ---------- evidence (E-1..E-9) ---------- */
  const RAW_EVIDENCE = [
    { id: 'E-1', cls: 'observed', fresh: 'current', src: 'github', at: '2026-11-16T14:02:00Z', vis: 'all' },
    { id: 'E-2', cls: 'observed', fresh: 'current', src: 'github', at: '2026-11-16T13:27:00Z', vis: 'all' },
    { id: 'E-3', cls: 'correlated', fresh: 'current', src: 'jira', at: '2026-11-16T13:51:00Z', vis: 'all', rule: true },
    { id: 'E-4', cls: 'observed', fresh: 'current', src: 'jira', at: '2026-11-16T13:51:00Z', vis: 'all' },
    { id: 'E-5', cls: 'observed', fresh: 'stale', src: 'sentry', at: '2026-11-16T05:03:00Z', vis: 'technical' },
    { id: 'E-6', cls: 'observed', fresh: 'unknown', src: null, at: null, vis: 'all', unread: 'not_configured' },
    { id: 'E-7', cls: 'observed', fresh: 'stale', src: null, at: null, vis: 'all', unread: 'unavailable' },
    { id: 'E-8', cls: 'observed', fresh: 'current', src: 'github', at: '2026-11-16T14:03:00Z', vis: 'all' },
    { id: 'E-9', cls: 'observed', fresh: 'stale', src: 'port', at: '2026-11-15T13:09:00Z', vis: 'all' },
  ];
  const worst = (l) => (l.length === 0 ? 'unknown' : l.includes('unknown') ? 'unknown' : l.includes('stale') ? 'stale' : 'current');
  const EVIDENCE = RAW_EVIDENCE.map((e) => {
    const s = e.src ? srcById(e.src) : null;
    const label = !s ? 'unknown' : e.cls === 'correlated' && !e.rule ? 'hypothesis' : e.cls; // resolveLabel
    const fresh = !s ? 'unknown' : worst([e.fresh, freshnessOf(s)]); // effectiveFreshness
    return { ...e, label, fresh, age: s ? minutesSince(e.at) : null };
  });
  const evById = (id) => EVIDENCE.find((e) => e.id === id);
  const isCurrentObserved = (id) => { const e = evById(id); return e.label === 'observed' && e.fresh === 'current'; };
  // rules.ts resolveHealth
  const resolveHealth = (claim, basis) => {
    if (claim === 'healthy') return basis.some(isCurrentObserved) ? 'healthy' : 'unknown';
    if (claim === 'degraded' || claim === 'down') return basis.some((id) => evById(id).src) ? claim : 'unknown';
    return 'unknown';
  };

  const SOURCES = RAW_SOURCES.map((s) => {
    const fresh = freshnessOf(s);
    return {
      ...s,
      fresh,
      health: resolveHealth(s.claim, s.basis),
      used: s.age === null ? 0 : s.age / (s.ttl / 60),
      ttlMin: Math.round(s.ttl / 60),
      issue: s.conn === 'unavailable' || fresh === 'stale',
    };
  });
  const source = (id) => SOURCES.find((s) => s.id === id);

  /* ---------- nodes (world.ts) ---------- */
  const RAW_NODES = [
    { id: 'retail-tower', kind: 'product', title: 'Retail Tower OS', claim: 'unknown', basis: ['E-1'], nfresh: 'unknown', ev: ['E-1', 'E-2'] },
    { id: 'khepri', kind: 'product', title: 'Khepri', claim: 'healthy', basis: [], nfresh: 'unknown', ev: [] },
    { id: 'stock-sync', kind: 'project', title: 'stock-sync', claim: 'unknown', basis: ['E-6'], nfresh: 'unknown', check: 'failing', ev: ['E-1', 'E-2', 'E-3', 'E-6'] },
    { id: 'pos', kind: 'project', title: 'POS client', claim: 'unknown', basis: [], nfresh: 'unknown', ev: [] },
    { id: 'inventory', kind: 'project', title: 'Inventory service', claim: 'healthy', basis: ['E-5'], nfresh: 'stale', ev: ['E-5'] },
    { id: 'github', kind: 'service', title: 'GitHub', provider: 'github', ev: ['E-1', 'E-2', 'E-8'] },
    { id: 'jira', kind: 'service', title: 'Jira', provider: 'jira', ev: ['E-3', 'E-4'] },
    { id: 'sentry', kind: 'service', title: 'Sentry', provider: 'sentry', ev: ['E-5'] },
    { id: 'port', kind: 'service', title: 'Port', provider: 'port', ev: ['E-7', 'E-9'] },
    { id: 'seshat-bi', kind: 'service', title: 'Seshat BI', claim: 'degraded', basis: [], nfresh: 'unknown', ev: [] },
  ];
  const NODES = RAW_NODES.map((n) => {
    const p = n.provider ? source(n.provider) : null;
    const claim = p ? (srcById(p.id).claim) : n.claim;
    const basis = p ? srcById(p.id).basis : n.basis;
    const nfresh = p ? p.fresh : n.nfresh;
    const health = resolveHealth(claim, basis);
    const read = basis.filter((id) => evById(id).src);
    const nodeFresh = worst(read.map((id) => evById(id).fresh));
    // logic/evidence.ts nodeChip
    let chip;
    if (n.check === 'failing') chip = { kind: 'check', tone: 'warn' };
    else if (p && p.conn === 'unavailable') chip = { kind: 'unavailable', tone: 'bad' };
    else if (p && p.conn === 'not_configured') chip = { kind: 'notset', tone: 'unk' };
    else if (health === 'healthy') chip = { kind: 'healthy', tone: 'ok' };
    else if (health === 'degraded') chip = { kind: 'degraded', tone: 'warn' };
    else if (health === 'down') chip = { kind: 'down', tone: 'bad' };
    else if (nfresh === 'stale' || nodeFresh === 'stale') chip = { kind: 'stale', tone: 'warn' };
    else chip = { kind: 'unknown', tone: 'unk' };
    const risk = n.check === 'failing' || (p ? p.issue : false);
    return { ...n, health, chip, risk, nfresh };
  });
  const node = (id) => NODES.find((n) => n.id === id);

  /* ---------- edges (world.ts) ---------- */
  const RAW_EDGES = [
    { id: 'g1', a: 'retail-tower', b: 'stock-sync', cls: 'group', truth: 'unknown', basis: 'edge.group', ev: [] },
    { id: 'g2', a: 'retail-tower', b: 'pos', cls: 'group', truth: 'unknown', basis: 'edge.group', ev: [] },
    { id: 'g3', a: 'retail-tower', b: 'inventory', cls: 'group', truth: 'unknown', basis: 'edge.group', ev: [] },
    { id: 'd1', a: 'stock-sync', b: 'github', cls: 'dep', truth: 'observed', basis: 'edge.ciOnGithub', ev: ['E-1'] },
    { id: 'd2', a: 'stock-sync', b: 'jira', cls: 'dep', truth: 'correlated', basis: 'edge.commitKey', ev: ['E-3'] },
    { id: 'd3', a: 'stock-sync', b: 'inventory', cls: 'dep', truth: 'hypothesis', basis: 'edge.readsInventory', ev: [] },
    { id: 'd4', a: 'inventory', b: 'sentry', cls: 'dep', truth: 'observed', basis: 'edge.errorsInSentry', ev: ['E-5'] },
    { id: 'd5', a: 'pos', b: 'stock-sync', cls: 'dep', truth: 'unknown', basis: 'edge.posUnknown', ev: [] },
    { id: 'd6', a: 'retail-tower', b: 'khepri', cls: 'dep', truth: 'unknown', basis: 'edge.notEvidenced', ev: [] },
    { id: 'd7', a: 'retail-tower', b: 'seshat-bi', cls: 'dep', truth: 'unknown', basis: 'edge.notEvidenced', ev: [] },
    { id: 'd8', a: 'retail-tower', b: 'port', cls: 'dep', truth: 'unknown', basis: 'edge.catalogUnavailable', ev: ['E-7'] },
  ];
  const EDGES = RAW_EDGES.map((e) => ({
    ...e,
    // index.tsx edgeStale: classified but every supporting read is not current
    stale: e.truth !== 'unknown' && e.ev.length > 0 && e.ev.every((id) => evById(id).fresh !== 'current'),
  }));

  const EVENTS = [
    { id: 'S-1', at: '2026-11-15T13:09:00Z', provider: 'port', axis: 'conn', tone: 'bad', key: 'sev.portLast' },
    { id: 'S-2', at: '2026-11-16T05:09:00Z', provider: 'sentry', axis: 'fresh', tone: 'ok', key: 'sev.sentryLast' },
    { id: 'S-3', at: '2026-11-16T05:24:00Z', provider: 'sentry', axis: 'fresh', tone: 'warn', key: 'sev.sentryStale' },
    { id: 'S-4', at: '2026-11-16T13:57:00Z', provider: 'jira', axis: 'conn', tone: 'ok', key: 'sev.jiraRead' },
    { id: 'S-5', at: '2026-11-16T14:02:00Z', provider: 'github', axis: 'incident', tone: 'bad', key: 'sev.ciFailed' },
    { id: 'S-6', at: '2026-11-16T14:03:00Z', provider: 'github', axis: 'conn', tone: 'ok', key: 'sev.githubRead' },
  ];

  /* ---------- derived figures (audit trail: see SPEC.md "figure to derivation") ---------- */
  const neighbours = (id) => {
    const out = new Set();
    EDGES.forEach((e) => { if (e.a === id) out.add(e.b); else if (e.b === id) out.add(e.a); });
    return [...out];
  };
  const linkCounts = (id) => {
    const c = { observed: 0, correlated: 0, hypothesis: 0, unknown: 0 };
    EDGES.forEach((e) => { if (e.cls === 'dep' && (!id || e.a === id || e.b === id)) c[e.truth] += 1; });
    return c;
  };
  const observedChanges = new Set(
    EVIDENCE.filter((e) => e.src && e.label === 'observed' && minutesSince(e.at) <= 24 * 60).map((e) => e.id),
  ).size;
  const FIG = {
    products: NODES.filter((n) => n.kind === 'product').length,
    projects: NODES.filter((n) => n.kind === 'project').length,
    services: NODES.filter((n) => n.kind === 'service').length,
    risks: NODES.filter((n) => n.risk).length,
    sourceIssues: SOURCES.filter((s) => s.issue).length,
    reachable: SOURCES.filter((s) => s.conn === 'reachable').length,
    current: SOURCES.filter((s) => s.fresh === 'current').length,
    healthy: SOURCES.filter((s) => s.health === 'healthy').length,
    stale: SOURCES.filter((s) => s.conn !== 'not_configured' && s.fresh === 'stale').length,
    unavailable: SOURCES.filter((s) => s.conn === 'unavailable').length,
    notSet: SOURCES.filter((s) => s.conn === 'not_configured').length,
    sourceTotal: SOURCES.length,
    observedChanges,
    links: linkCounts(null),
    depEdges: EDGES.filter((e) => e.cls === 'dep').length,
    groupEdges: EDGES.filter((e) => e.cls === 'group').length,
    activeInvestigations: 1,
    proposalsWaiting: 1,
  };

  /* ---------- copy (EN | AR). Keys that exist in app/src/design-lab/v2/i18n reuse its wording; keys starting "n." are NEW and
     their Arabic has NOT had a native-speaker review. Latin digits everywhere. ---------- */
  const S = {
    skip: ['Skip to content', 'انتقل إلى المحتوى'],
    'brand.tag': ['Unified Mission Control for Product & Operations', 'مركز قيادة موحّد للمنتج والعمليات'],
    demo: ['Demo data, not live', 'بيانات تجريبية، ليست مباشرة'],
    'nav.map': ['Mission Map', 'خريطة المهمة'],
    'nav.obs': ['Source Observatory', 'مرصد المصادر'],
    'nav.replay': ['Mission Replay', 'إعادة المهمة'],
    'nav.deck': ['Agent Flight Deck', 'لوحة قيادة الوكلاء'],
    'nav.screens': ['Screens', 'الشاشات'],
    'ws.name': ['Operations', 'العمليات'],
    'ws.sub': ['Multi-project view', 'عرض متعدد المشاريع'],
    'scope.portfolios': ['Portfolios', 'المحافظ'],
    'search.ph': ['Search systems, sources, evidence, missions', 'ابحث في الأنظمة والمصادر والأدلة والمهام'],
    'persona.owner': ['Owner', 'المالك'], // n.
    'persona.technical': ['Technical', 'تقني'], // n.
    'persona.nontechnical': ['Nontechnical', 'غير تقني'], // n.
    'map.eyebrow': ['Mission control', 'مركز القيادة'],
    'map.lede': [
      'A cross-project map of products, projects and services, and how they relate. Every link says how we know it.',
      'خريطة عابرة للمشاريع للمنتجات والمشاريع والخدمات وكيف ترتبط. كل رابط يذكر كيف عرفناه.',
    ],
    'map.kpi.products': ['Products', 'منتجات'],
    'map.kpi.projects': ['Projects', 'مشاريع'],
    'map.kpi.services': ['Services', 'خدمات'],
    'map.kpi.risks': ['Active risks', 'مخاطر قائمة'],
    'map.kpi.issues': ['Service issues', 'مشكلات الخدمات'],
    'map.f.label': ['Filter the map', 'تصفية الخريطة'],
    'map.f.all': ['All systems', 'كل الأنظمة'],
    'map.f.products': ['Products', 'المنتجات'],
    'map.f.projects': ['Projects', 'المشاريع'],
    'map.f.services': ['Services', 'الخدمات'],
    'map.f.risks': ['Risks', 'المخاطر'],
    'map.scope.label': ['Scope', 'النطاق'],
    'view.map': ['Map', 'خريطة'],
    'view.list': ['List', 'قائمة'],
    'map.canvas.label': [
      'Mission constellation. Products, projects and services shown as linked nodes. A list view with the same content is available.',
      'كوكبة المهمة. المنتجات والمشاريع والخدمات كعقد مترابطة. تتوفر قائمة بالمحتوى نفسه.',
    ],
    'map.hint': ['Arrow keys move between nodes. Enter selects.', 'مفاتيح الأسهم تنتقل بين العقد. مفتاح الإدخال يحدد.'], // n.
    'map.legend.title': ['How we know a link', 'كيف نعرف الرابط'],
    'map.legend.group': ['Part of', 'جزء من'],
    'map.legend.stale': ['Observed (stale)', 'مرصود (قديم)'], // n.
    'map.part': ['is part of', 'جزء من'],
    'ns.checkFailing': ['CI check failing', 'فحص CI فاشل'],
    'chip.stale': ['Stale', 'قديم'],
    'chip.unavailable': ['Unavailable', 'غير متاح'],
    'chip.notset': ['Not set up', 'غير مُعد'],
    'chip.healthy': ['Healthy', 'سليمة'],
    'chip.degraded': ['Degraded', 'متدهورة'],
    'chip.down': ['Down', 'متوقفة'],
    'chip.unknown': ['Health unknown', 'الصحة غير معروفة'],
    'label.observed': ['Observed', 'مرصود'],
    'label.correlated': ['Correlated', 'مرتبط'],
    'label.hypothesis': ['Hypothesis', 'فرضية'],
    'label.unknown': ['Unknown', 'مجهول'],
    'kind.product': ['Product', 'منتج'],
    'kind.project': ['Project', 'مشروع'],
    'kind.service': ['Service', 'خدمة'],
    'kind.products': ['Products', 'المنتجات'], // n. plural layer names (orbit and column headings)
    'kind.projects': ['Projects', 'المشاريع'],
    'kind.services': ['Services', 'الخدمات'],
    'tab.overview': ['Overview', 'نظرة عامة'],
    'tab.evidence': ['Evidence', 'الأدلة'],
    'tab.sources': ['Sources', 'المصادر'],
    'tab.label': ['Selected item', 'العنصر المحدد'],
    'map.stat.projects': ['Projects', 'مشاريع'],
    'map.stat.services': ['Services', 'خدمات'],
    'map.stat.linked': ['Linked', 'مرتبطة'],
    'map.signals': ['Key signals', 'الإشارات الرئيسية'],
    'map.signals.sub': ['Observed and correlated, never scored', 'مرصودة ومرتبطة، دون درجات'],
    'map.signals.none': ['No evidence has been read for this item.', 'لم تُقرأ أدلة لهذا العنصر.'],
    'map.links': ['Link classification', 'تصنيف الروابط'],
    'map.links.none': ['No dependency links', 'لا روابط اعتماد'],
    'map.open.replay': ['Open the investigation replay', 'افتح إعادة التحقيق'],
    'map.open.source': ['Open in Source Observatory', 'افتح في مرصد المصادر'],
    'map.center': ['Center on this item', 'ركّز على هذا العنصر'],
    'map.focus': ['Focus', 'التركيز'],
    'obs.readings': ['Three readings', 'ثلاث قراءات'],
    'obs.readings.sub': ['Side by side, never combined', 'جنبًا إلى جنب، دون دمج'],
    'obs.read.conn': ['Connectivity', 'الاتصال'],
    'obs.read.fresh': ['Evidence freshness', 'حداثة الأدلة'],
    'obs.read.health': ['Target health', 'صحة الهدف'],
    'n.unit.reachable': ['reachable', 'متصلة'],
    'n.unit.current': ['within target', 'ضمن الهدف'],
    'n.unit.healthy': ['confirmed healthy', 'سليمة بدليل'],
    'obs.pin.conn.sub': ['$u unavailable, $c not set up', '$u غير متاحة، $c غير مُعدة'],
    'obs.pin.fresh.sub': ['$s stale, $k never read', '$s قديمة، $k لم تُقرأ قط'],
    'obs.pin.health.sub': ['$n unknown', '$n غير معروفة'],
    'c.reachable': ['Online', 'متصل'],
    'c.unavailable': ['Offline', 'غير متصل'],
    'c.not_configured': ['Not set up', 'غير مُعد'],
    'f.current': ['Current', 'حديث'],
    'f.stale': ['Stale', 'قديم'],
    'f.unknown': ['Unknown', 'غير معروف'],
    'obs.read.age': ['$a of $m min', '$a من $m د'],
    'n.target': ['target $m min', 'الهدف $m د'],
    'n.over': ['$x× target', '$x× الهدف'],
    'n.never': ['never read', 'لم تُقرأ قط'],
    'n.min': ['min', 'د'],
    'n.h': ['h', 'س'],
    'n.ago': ['ago', 'مضت'],
    'map.feed': ['Evidence feed', 'سجل الأدلة'],
    'map.feed.sub': ['Latest reads, newest first', 'أحدث القراءات أولًا'],
    'map.srcs': ['Source status', 'حالة المصادر'],
    'map.srcs.sub': ['Age of the last good read against its freshness target', 'عمر آخر قراءة ناجحة مقابل هدف الحداثة'],
    'obs.tl': ['Signal timeline', 'خط إشارات المصادر'],
    'obs.tl.sub': ['Ordered, not to time scale', 'مرتبة، وليست بمقياس زمني'], // n.
    'n.ledger': ['Systems ledger', 'سجل الأنظمة'],
    'n.ledger.sub': ['Every system, its status and its evidence count', 'كل نظام وحالته وعدد أدلته'],
    'n.topology': ['Topology', 'الطوبولوجيا'],
    'n.topology.sub': ['Products, projects and services, linked by how we know it', 'المنتجات والمشاريع والخدمات، مرتبطة بحسب كيفية معرفتها'],
    'n.matrix': ['Source readings', 'قراءات المصادر'],
    'n.matrix.sub': ['Connectivity, freshness and health, each on its own', 'الاتصال والحداثة والصحة، كلٌّ على حدة'],
    'n.layer.sub': ['Orbit = kind of system, not importance', 'المدار = نوع النظام، وليس الأهمية'],
    'n.th.system': ['System', 'النظام'],
    'n.th.status': ['Status', 'الحالة'],
    'n.th.ev': ['Evidence', 'الأدلة'],
    'n.th.links': ['Links', 'الروابط'],
    'n.th.source': ['Source', 'المصدر'],
    'n.th.conn': ['Connectivity', 'الاتصال'],
    'n.th.fresh': ['Freshness', 'الحداثة'],
    'n.th.health': ['Target health', 'صحة الهدف'],
    'n.th.from': ['From', 'من'],
    'n.th.to': ['To', 'إلى'],
    'n.th.how': ['How we know', 'كيف نعرف'],
    'n.th.basis': ['Basis', 'الأساس'],
    'n.cap.nodes': ['Systems on the map', 'الأنظمة على الخريطة'],
    'n.cap.links': ['Links between systems', 'الروابط بين الأنظمة'],
    'n.sel.reveal': ['Selection shows its links', 'التحديد يُظهر روابطه'],
    'n.panel.tri': ['Three readings of 6 sources', 'ثلاث قراءات لـ 6 مصادر'],
    'n.chg': ['Observed reads, 24 h', 'قراءات مرصودة، 24 ساعة'],
    'n.chg.sub': ['From $n sources', 'من $n مصادر'],
    'n.inv': ['Active investigations', 'تحقيقات نشطة'],
    'n.inv.sub': ['Customer impact unknown', 'أثر العملاء غير معروف'],
    'n.prop': ['Proposals waiting', 'اقتراحات بالانتظار'],
    'n.prop.sub': ['Display only, nothing is decided here', 'للعرض فقط، لا يُتخذ قرار هنا'],
    'n.rail.sources': ['Source posture', 'وضع المصادر'],
    'n.pips': ['One pip per source', 'نقطة لكل مصدر'],
    'n.stats.links': ['dependency links', 'روابط اعتماد'],
    'n.stats.group': ['structure links', 'روابط بنية'],
    'prov.github': ['GitHub', 'GitHub'], 'prov.jira': ['Jira', 'Jira'], 'prov.sentry': ['Sentry', 'Sentry'],
    'prov.datadog': ['Datadog', 'Datadog'], 'prov.confluence': ['Confluence', 'Confluence'], 'prov.port': ['Port', 'Port'],
    'map.nd.retail-tower': ['Core platform', 'المنصة الأساسية'],
    'map.nd.khepri': ['Product', 'منتج'],
    'map.nd.stock-sync': ['Backend-Core project', 'مشروع الخلفية'],
    'map.nd.pos': ['Store client project', 'مشروع عميل المتجر'],
    'map.nd.inventory': ['Inventory project', 'مشروع المخزون'],
    'map.nd.github': ['Source control', 'إدارة الشيفرة'],
    'map.nd.jira': ['Work and releases', 'العمل والإصدارات'],
    'map.nd.sentry': ['Error monitoring', 'رصد الأخطاء'],
    'map.nd.port': ['Service catalogue', 'فهرس الخدمات'],
    'map.nd.seshat-bi': ['Analytics', 'التحليلات'],
    'map.nl.retail-tower': ['The flagship platform that connects retail systems. Its failing CI check is the one thing observed so far.', 'المنصة الرئيسية التي تربط أنظمة التجزئة. فشل فحص التكامل هو الشيء الوحيد المرصود حتى الآن.'],
    'map.nl.khepri': ['A sibling product. How it relates to Retail Tower is not evidenced.', 'منتج شقيق. علاقته بـ Retail Tower غير مثبتة.'],
    'map.nl.stock-sync': ['The stock synchronisation project whose integration check is failing.', 'مشروع مزامنة المخزون الذي يفشل فحص التكامل فيه.'],
    'map.nl.pos': ['The store-side client. How it reaches stock-sync is not evidenced.', 'عميل جهة المتجر. طريقة وصوله إلى stock-sync غير مثبتة.'],
    'map.nl.inventory': ['The inventory service. Its latest error read is stale.', 'خدمة المخزون. آخر قراءة للأخطاء قديمة.'],
    'map.nl.github': ['Source control and CI for the repositories.', 'إدارة الشيفرة والتكامل المستمر للمستودعات.'],
    'map.nl.jira': ['Work items and release planning.', 'بنود العمل وتخطيط الإصدارات.'],
    'map.nl.sentry': ['Error monitoring. Its last read is stale.', 'رصد الأخطاء. آخر قراءة قديمة.'],
    'map.nl.port': ['The service catalogue. It is not answering, so ownership is unknown.', 'فهرس الخدمات. لا يستجيب، لذا الملكية غير معروفة.'],
    'map.nl.seshat-bi': ['The analytics service. No evidence has been read for it.', 'خدمة التحليلات. لم تُقرأ أدلة لها.'],
    'edge.group': ['Part of the product (structure)', 'جزء من المنتج (بنية)'],
    'edge.ciOnGithub': ['The CI check for stock-sync ran on GitHub', 'فحص CI لـ stock-sync جرى على GitHub'],
    'edge.commitKey': ['Jira key in the commit message of the merged PR', 'مفتاح Jira في رسالة الالتزام للدمج'],
    'edge.readsInventory': ['stock-sync probably reads Inventory data, not confirmed', 'يُرجَّح أن stock-sync يقرأ بيانات المخزون، غير مؤكد'],
    'edge.errorsInSentry': ['Inventory errors were reported in Sentry (stale read)', 'أُبلغ عن أخطاء المخزون في Sentry (قراءة قديمة)'],
    'edge.posUnknown': ['No evidence of how POS reaches stock-sync', 'لا دليل على كيفية وصول POS إلى stock-sync'],
    'edge.notEvidenced': ['No evidence for this link', 'لا دليل على هذا الرابط'],
    'edge.catalogUnavailable': ['The Port catalogue is unavailable, so the link is unknown', 'فهرس Port غير متاح، لذا الرابط غير معروف'],
    'ev.E-1': ['The stock-sync integration check failed on main', 'فشل فحص تكامل stock-sync على main'],
    'ev.E-2': ['A test data change was merged 35 min before the failure', 'دُمج تغيير في بيانات الاختبار قبل الفشل بـ 35 دقيقة'],
    'ev.E-3': ['Linked to work item RT-DEMO-112', 'مرتبط ببند العمل RT-DEMO-112'],
    'ev.E-4': ['RT-DEMO-112 is in release RT 2.14-rc, planned 18 Nov', 'RT-DEMO-112 ضمن الإصدار RT 2.14-rc المخطط في 18 نوفمبر'],
    'ev.E-5': ['Recent errors for the inventory service', 'الأخطاء الأخيرة لخدمة المخزون'],
    'ev.E-6': ['Runtime monitoring for stock-sync', 'مراقبة التشغيل لـ stock-sync'],
    'ev.E-7': ['Catalog owner for stock-sync', 'مالك stock-sync في الكتالوج'],
    'ev.E-8': ['GitHub answered a current status read', 'ردّ GitHub على قراءة حالة حديثة'],
    'ev.E-9': ['Port last answered a day ago', 'آخر ردّ من Port كان قبل يوم'],
    'ev.unread.not_configured': ['Not read: not set up', 'غير مقروء: غير مُعد'], // n.
    'ev.unread.unavailable': ['Not read: source unavailable', 'غير مقروء: المصدر غير متاح'], // n.
    'sev.portLast': ['Last good read, no answer since', 'آخر قراءة ناجحة، دون ردّ منذئذٍ'],
    'sev.sentryLast': ['Last observation read', 'قراءة آخر رصد'],
    'sev.sentryStale': ['Passed its freshness target', 'تجاوز هدف الحداثة'],
    'sev.jiraRead': ['Read completed', 'اكتملت القراءة'],
    'sev.ciFailed': ['An integration check failed', 'فشل فحص تكامل'],
    'sev.githubRead': ['Read completed', 'اكتملت القراءة'],
    'c.map': ['Concept', 'تصور'],
  };
  const t = (k, v) => {
    const row = S[k];
    let s = row ? row[LANG === 'ar' ? 1 : 0] : k;
    if (v) Object.keys(v).forEach((n) => { s = s.split('$' + n).join(String(v[n])); });
    return s;
  };

  const chipText = (kind) => t({ check: 'ns.checkFailing', healthy: 'chip.healthy', degraded: 'chip.degraded', down: 'chip.down', unavailable: 'chip.unavailable', notset: 'chip.notset', stale: 'chip.stale', unknown: 'chip.unknown' }[kind]);
  const fmtMin = (m) => (m === null ? t('n.never') : m >= 120 ? `${Math.round(m / 60)} ${t('n.h')}` : `${m} ${t('n.min')}`);
  const hhmm = (iso) => iso.slice(11, 16);
  const fmtAt = (iso) => (iso.slice(0, 10) === NOW.slice(0, 10) ? hhmm(iso) : `${parseInt(iso.slice(8, 10), 10)} ${LANG === 'ar' ? 'نوفمبر' : 'Nov'} ${hhmm(iso)}`);

  window.KD = {
    fmtAt, LANG, RM, NOW, SOURCES, source, NODES, node, EDGES, EVIDENCE, evById, EVENTS, FIG, S, t, chipText, fmtMin, hhmm, neighbours, linkCounts, minutesSince };
})();

// The one synthetic world every screen reads (BACK-10..13). Every value is invented. Ids use DEMO, links use
// *.example.invalid. Story: the Retail Tower CI failure (#DEMO-4471) makes Retail Tower need attention, points at
// stock-sync, links RT-DEMO-112, is worked in INV-DEMO-7 and ends in proposed decision DEC-DEMO-3 for a human.
// Owner and Nontechnical text never names job names, run ids or PR ids (same rule as inv-demo-7).
import type { EvidenceReference, Observation, SourceAuthority, EntityRef, Provider } from '../contract/types';
import type {
  ActivityEvent, AgentDemo, ByPersonaL10n, Decision, InvestigationSummary, L10n, World, WorldProject,
} from '../contract/world';
import { EVIDENCE, SOURCES } from './inv-demo-7';

const l = (en: string, ar: string): L10n => ({ en, ar });
const same = (t: L10n): ByPersonaL10n => ({ owner: t, technical: t, nontechnical: t });

const src = (
  provider: Provider, connectivity: SourceAuthority['connectivity'], ageMinutes: number | null, ttlSeconds: number,
): SourceAuthority => ({
  provider, connectivity, ageMinutes, ttlSeconds, lastSuccessAt: ageMinutes === null ? null : '2026-11-16T14:03:00Z', synthetic: true,
});

const ref = (kind: EntityRef['kind'], id: string, label: string, externalId?: string): EntityRef =>
  ({ kind, id, label, ...(externalId ? { externalId } : {}) });

const obs = (
  id: string, target: EntityRef, source: SourceAuthority, observedAt: string, env: Observation['environment'], url?: string,
): Observation => ({ id, target, source, observedAt, ingestedAt: '2026-11-16T14:03:00Z', environment: env, ...(url ? { sourceUrl: url } : {}) });

// ---- Sources per product ------------------------------------------------------------------------------------
const KH_SOURCES = {
  github: src('github', 'reachable', 4, 1800),
  jira: src('jira', 'unavailable', 300, 7200),
  sentry: src('sentry', 'reachable', 3, 900),
  datadog: src('datadog', 'not_configured', null, 900),
} as const;

const SB_SOURCES = {
  github: src('github', 'not_configured', null, 1800),
  jira: src('jira', 'reachable', 20, 7200),
  confluence: src('confluence', 'reachable', 45, 86400),
} as const;

const CONFLUENCE = src('confluence', 'reachable', 30, 86400);

// ---- Evidence outside INV-DEMO-7 ------------------------------------------------------------------------------
const gateway = ref('component', 'component:api-gateway', 'api-gateway');
const payments = ref('component', 'component:payments', 'payments');
const khApi = ref('component', 'component:khepri-api', 'khepri-api');
const khWeb = ref('component', 'component:khepri-web', 'khepri-web');
const policy = ref('decision', 'decision:DEC-DEMO-1', 'Release week fixture freeze', 'KMC-DEMO-21');

const X = {
  gatewaySmoke: {
    id: 'E-11', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: obs('O-11', gateway, SOURCES.github, '2026-11-16T13:58:00Z', 'ci', 'https://github.example.invalid/run/DEMO-4468'),
  },
  paymentsErrors: {
    id: 'E-12', classification: 'observed', freshness: 'stale', visibility: 'technical',
    observation: obs('O-12', payments, SOURCES.sentry, '2026-11-16T05:03:00Z', 'staging'),
  },
  khCiGreen: {
    id: 'E-21', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: obs('O-21', khWeb, KH_SOURCES.github, '2026-11-16T14:04:00Z', 'ci', 'https://github.example.invalid/run/DEMO-5120'),
  },
  khErrorsRising: {
    id: 'E-22', classification: 'observed', freshness: 'current', visibility: 'all',
    observation: obs('O-22', khApi, KH_SOURCES.sentry, '2026-11-16T14:05:00Z', 'staging'),
  },
  khDeployLink: {
    id: 'E-23', classification: 'correlated', freshness: 'current', visibility: 'technical', rule: 'Deploy time within 15 min of first error event',
    observation: obs('O-23', khApi, KH_SOURCES.github, '2026-11-16T13:49:00Z', 'staging', 'https://github.example.invalid/deploy/DEMO-311'),
  },
  khTicket: {
    id: 'E-24', classification: 'observed', freshness: 'stale', visibility: 'all', observation: null, notReadReason: 'unavailable',
  },
  sbPipeline: {
    id: 'E-31', classification: 'observed', freshness: 'unknown', visibility: 'all', observation: null, notReadReason: 'not_configured',
  },
  policyRecord: {
    id: 'E-41', classification: 'approved', freshness: 'current', visibility: 'all',
    observation: obs('O-41', policy, CONFLUENCE, '2026-11-02T09:00:00Z', 'unknown', 'https://confluence.example.invalid/KMC/DEMO-21'),
  },
} as const satisfies Record<string, EvidenceReference>;

const E = EVIDENCE;

// ---- Projects -------------------------------------------------------------------------------------------------
const RT: WorldProject = {
  id: 'RT',
  name: 'Retail Tower OS',
  summary: l('Point of sale, stock and payments for retail branches.', 'نقاط البيع والمخزون والمدفوعات لفروع التجزئة.'),
  sources: Object.values(SOURCES),
  // A failing check is not runtime health: overall product health stays unknown until runtime evidence exists.
  health: { connectivity: 'reachable', freshness: 'stale', health: 'unknown', basis: [E.runtime, E.sentryErrors] },
  environments: ['ci', 'staging', 'production'],
  components: [
    { id: 'pos', name: 'pos-client', layer: 'client', environment: 'production', pos: { col: 0, row: 1 },
      state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [] },
      note: l('No runtime monitoring set up.', 'لا توجد مراقبة تشغيل مُعدّة.') },
    { id: 'api-gateway', name: 'api-gateway', layer: 'edge', environment: 'ci', pos: { col: 1, row: 1 },
      state: { connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [X.gatewaySmoke] } },
    { id: 'stock-sync', name: 'stock-sync', layer: 'service', environment: 'ci', pos: { col: 2, row: 0 }, checkFailing: true,
      investigationId: 'INV-DEMO-7',
      state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [E.runtime] } },
    { id: 'payments', name: 'payments', layer: 'service', environment: 'staging', pos: { col: 2, row: 2 },
      state: { connectivity: 'reachable', freshness: 'stale', health: 'degraded', basis: [X.paymentsErrors] } },
    // The last stale read said healthy; the contract renders unknown.
    { id: 'inventory', name: 'inventory', layer: 'data', environment: 'staging', pos: { col: 3, row: 1 },
      state: { connectivity: 'reachable', freshness: 'stale', health: 'healthy', basis: [E.sentryErrors] } },
    { id: 'reporting', name: 'reporting', layer: 'integration', environment: 'unknown', pos: { col: 4, row: 1 },
      state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [] } },
  ],
  edges: [
    { from: 'pos', to: 'api-gateway', kind: 'authored', basis: [E.catalogOwner] },
    { from: 'api-gateway', to: 'stock-sync', kind: 'authored', basis: [E.catalogOwner] },
    { from: 'api-gateway', to: 'payments', kind: 'authored', basis: [E.catalogOwner] },
    { from: 'stock-sync', to: 'inventory', kind: 'authored', basis: [E.catalogOwner] },
    { from: 'payments', to: 'inventory', kind: 'hypothesis', basis: [] },
    { from: 'inventory', to: 'reporting', kind: 'provisional', basis: [] },
  ],
  attention: [
    { id: 'ATT-RT-1', severity: 'high', componentId: 'stock-sync', investigationId: 'INV-DEMO-7', decisionId: 'DEC-DEMO-3',
      evidence: [E.checkFailed, E.issueLinked],
      title: {
        owner: l('Integration check failing on {main}; release {RT 2.14-rc} decision waiting.', 'فحص تكامل فاشل على {main}؛ قرار الإصدار {RT 2.14-rc} بانتظار المراجعة.'),
        technical: l('{integration-tests (stock-sync)} failing on {main} (run {#DEMO-4471}).', '{integration-tests (stock-sync)} فاشل على {main} (التنفيذ {#DEMO-4471}).'),
        nontechnical: l('An automatic check for {Retail Tower} is failing. A team is looking at it.', 'فحص تلقائي لـ {Retail Tower} يفشل. فريق يتابع الأمر.'),
      } },
    { id: 'ATT-RT-2', severity: 'medium', componentId: 'payments', evidence: [X.paymentsErrors],
      title: {
        owner: l('Payments errors last seen 9 h ago; current state unknown.', 'آخر أخطاء في المدفوعات قبل 9 ساعات؛ الحالة الحالية غير معروفة.'),
        technical: l('{payments} error rate elevated in staging ({Sentry}, stale 9 h).', 'ارتفاع معدل أخطاء {payments} في بيئة التجهيز ({Sentry}، قديمة 9 س).'),
        nontechnical: l('Some payment errors were seen earlier. We do not know if they continue.', 'ظهرت بعض أخطاء الدفع سابقًا. لا نعرف إن كانت مستمرة.'),
      } },
  ],
  delivery: [
    { id: 'DLV-RT-1', kind: 'check', status: 'failing', evidence: E.checkFailed,
      ref: ref('check', 'check:integration-tests-stock-sync', 'ci / integration-tests (stock-sync)', '#DEMO-4471') },
    { id: 'DLV-RT-2', kind: 'pr', status: 'merged', evidence: E.prMerged, ref: ref('check', 'pr:DEMO-88', 'fixture timezone update', 'PR #DEMO-88') },
    { id: 'DLV-RT-3', kind: 'workItem', status: 'in_progress', evidence: E.issueLinked,
      ref: ref('workItem', 'jira:RT-DEMO-112', 'stock-sync integration test flaky', 'RT-DEMO-112') },
    { id: 'DLV-RT-4', kind: 'release', status: 'planned', evidence: E.release, ref: ref('workItem', 'release:RT-2.14-rc', 'RT 2.14-rc', 'RT 2.14-rc') },
    { id: 'DLV-RT-5', kind: 'check', status: 'passing', evidence: X.gatewaySmoke,
      ref: ref('check', 'check:gateway-smoke', 'ci / smoke (api-gateway)', '#DEMO-4468') },
  ],
};

const KH: WorldProject = {
  id: 'KH',
  name: 'Khepri',
  summary: l('Customer ordering web app and API.', 'تطبيق ويب وواجهة برمجية لطلبات العملاء.'),
  sources: Object.values(KH_SOURCES),
  health: { connectivity: 'reachable', freshness: 'current', health: 'degraded', basis: [X.khErrorsRising] },
  environments: ['ci', 'staging'],
  components: [
    { id: 'khepri-web', name: 'khepri-web', layer: 'client', environment: 'ci', pos: { col: 0, row: 0 },
      state: { connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [X.khCiGreen] } },
    { id: 'khepri-api', name: 'khepri-api', layer: 'service', environment: 'staging', pos: { col: 1, row: 0 }, investigationId: 'INV-DEMO-9',
      state: { connectivity: 'reachable', freshness: 'current', health: 'degraded', basis: [X.khErrorsRising] } },
    { id: 'khepri-worker', name: 'khepri-worker', layer: 'service', environment: 'unknown', pos: { col: 2, row: 0 },
      state: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [] } },
  ],
  edges: [
    { from: 'khepri-web', to: 'khepri-api', kind: 'authored', basis: [X.khCiGreen] },
    { from: 'khepri-api', to: 'khepri-worker', kind: 'provisional', basis: [] },
  ],
  attention: [
    { id: 'ATT-KH-1', severity: 'medium', componentId: 'khepri-api', investigationId: 'INV-DEMO-9', decisionId: 'DEC-DEMO-5',
      evidence: [X.khCiGreen, X.khErrorsRising],
      title: {
        owner: l('Conflicting signals: checks pass, but staging errors are rising.', 'إشارات متعارضة: الفحوص ناجحة لكن أخطاء بيئة التجهيز في ازدياد.'),
        technical: l('CI green on {khepri-web}, but {khepri-api} errors rising in staging ({Sentry}).', 'التكامل المستمر ناجح على {khepri-web}، لكن أخطاء {khepri-api} في ازدياد في التجهيز ({Sentry}).'),
        nontechnical: l('Tests pass, but more errors are showing in the test environment. Being checked.', 'الاختبارات ناجحة، لكن تظهر أخطاء أكثر في بيئة الاختبار. قيد المراجعة.'),
      } },
  ],
  delivery: [
    { id: 'DLV-KH-1', kind: 'check', status: 'passing', evidence: X.khCiGreen, ref: ref('check', 'check:khepri-web-ci', 'ci / build (khepri-web)', '#DEMO-5120') },
    { id: 'DLV-KH-2', kind: 'workItem', status: 'unknown', evidence: X.khTicket, ref: ref('workItem', 'jira:KH-DEMO-40', 'staging error spike', 'KH-DEMO-40') },
  ],
};

const SB: WorldProject = {
  id: 'SB',
  name: 'Seshat-BI',
  summary: l('Reporting and analytics for branch managers.', 'التقارير والتحليلات لمديري الفروع.'),
  sources: Object.values(SB_SOURCES),
  health: { connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [X.sbPipeline] },
  environments: [],
  components: [],
  edges: [],
  attention: [],
  delivery: [],
};

// ---- Investigations, decisions, agents, activity --------------------------------------------------------------
const investigations: readonly InvestigationSummary[] = [
  {
    id: 'INV-DEMO-7', projectId: 'RT', componentId: 'stock-sync', status: 'open', startedMinutesAgo: 6, fullRoom: true, decisionId: 'DEC-DEMO-3',
    evidence: Object.values(E),
    missing: [
      l('Runtime health: {Datadog} not set up.', 'حالة التشغيل: {Datadog} غير مُعدّ.'),
      l('Service owner: {Port} catalog unavailable.', 'مالك الخدمة: كتالوج {Port} غير متاح.'),
    ],
    title: {
      owner: l('Integration check failing on {main}. Release decision waiting.', 'فحص تكامل فاشل على {main}. قرار الإصدار بانتظار المراجعة.'),
      technical: l('{stock-sync} integration check failing on {main} (run {#DEMO-4471})', 'فحص تكامل {stock-sync} فاشل على {main} (التنفيذ {#DEMO-4471})'),
      nontechnical: l('An automated test for {Retail Tower} is failing. A team is looking at it.', 'اختبار آلي لـ {Retail Tower} يفشل. فريق يتابع الأمر.'),
    },
  },
  {
    id: 'INV-DEMO-9', projectId: 'KH', componentId: 'khepri-api', status: 'open', startedMinutesAgo: 19, fullRoom: false, decisionId: 'DEC-DEMO-5',
    evidence: [X.khCiGreen, X.khErrorsRising, X.khDeployLink, X.khTicket],
    missing: [
      l('Work item {KH-DEMO-40}: {Jira} unavailable, last read 5 h ago.', 'عنصر العمل {KH-DEMO-40}: {Jira} غير متاح، آخر قراءة قبل 5 س.'),
      l('Runtime metrics: {Datadog} not set up.', 'مقاييس التشغيل: {Datadog} غير مُعدّ.'),
    ],
    title: {
      owner: l('Checks pass but staging errors rise on {Khepri}.', 'الفحوص ناجحة لكن الأخطاء ترتفع في تجهيز {Khepri}.'),
      technical: l('{khepri-api} error spike in staging after deploy {DEMO-311}; CI green.', 'ارتفاع أخطاء {khepri-api} في التجهيز بعد النشر {DEMO-311}؛ التكامل المستمر ناجح.'),
      nontechnical: l('{Khepri} shows more errors in testing even though checks pass.', '{Khepri} يُظهر أخطاء أكثر في الاختبار رغم نجاح الفحوص.'),
    },
  },
];

const decisions: readonly Decision[] = [
  {
    id: 'DEC-DEMO-3', projectId: 'RT', investigationId: 'INV-DEMO-7', priority: 'high', classification: 'proposed',
    decidedIn: 'RT-DEMO-112', ageMinutes: 5,
    title: {
      owner: l('Hold release {RT 2.14-rc} until the failing check is re-verified?', 'تعليق الإصدار {RT 2.14-rc} حتى يُعاد التحقق من الفحص الفاشل؟'),
      technical: l('Hold {RT 2.14-rc} pending {integration-tests (stock-sync)} with fixture reverted?', 'تعليق {RT 2.14-rc} بانتظار {integration-tests (stock-sync)} مع إرجاع بيانات الاختبار؟'),
      nontechnical: l('Should the planned release wait for a re-check?', 'هل ينتظر الإصدار المخطط إعادة فحص؟'),
    },
    context: l('Release {RT 2.14-rc} is planned for 18 Nov. Its integration check is failing on {main}.', 'الإصدار {RT 2.14-rc} مخطط في 18 نوفمبر. فحص التكامل الخاص به فاشل على {main}.'),
    observed: [E.checkFailed, E.prMerged, E.release],
    hypotheses: [l('A test data timezone change caused the failure. Not confirmed.', 'تغيير المنطقة الزمنية في بيانات الاختبار سبب الفشل. غير مؤكد.')],
    unknowns: [
      l('Customer or runtime impact: not evidenced.', 'الأثر على العملاء أو التشغيل: لا دليل.'),
      l('Whether the test was already flaky before the change.', 'هل كان الاختبار غير مستقر قبل التغيير.'),
    ],
    options: [
      { id: 'A', suggested: true, evidence: [E.checkFailed, E.prMerged],
        title: l('Hold the release candidate until the check is re-verified', 'تعليق المرشح للإصدار حتى يُعاد التحقق من الفحص'),
        benefit: l('No release with an unexplained failing check.', 'لا إصدار مع فحص فاشل غير مُفسَّر.'),
        risk: l('The 18 Nov date may slip.', 'قد يتأخر موعد 18 نوفمبر.'),
        unknowns: [l('How long a re-check takes.', 'المدة اللازمة لإعادة الفحص.')] },
      { id: 'B', suggested: false, evidence: [E.release, E.issueLinked],
        title: l('Keep the date and accept the test risk', 'الإبقاء على الموعد وقبول مخاطرة الاختبار'),
        benefit: l('Release date holds.', 'يبقى موعد الإصدار كما هو.'),
        risk: l('A real stock-sync defect could ship.', 'قد يُشحن خلل حقيقي في مزامنة المخزون.'),
        unknowns: [l('Runtime impact is not evidenced either way.', 'الأثر التشغيلي غير مُثبت في أي اتجاه.')] },
      { id: 'C', suggested: false, evidence: [E.prMerged],
        title: l('Revert the test data change first, then decide', 'إرجاع تغيير بيانات الاختبار أولًا ثم القرار'),
        benefit: l('Tests the hypothesis directly.', 'يختبر الفرضية مباشرة.'),
        risk: l('Masks the problem if the test was already flaky.', 'قد يُخفي المشكلة إن كان الاختبار غير مستقر أصلًا.'),
        unknowns: [] },
    ],
    nextStep: {
      owner: l('Review in {RT-DEMO-112}: choose an option with the release owner.', 'المراجعة في {RT-DEMO-112}: اختيار خيار مع مالك الإصدار.'),
      technical: l('Re-verify {integration-tests (stock-sync)} with the fixture reverted on a branch, then record the result in {RT-DEMO-112}.', 'إعادة التحقق من {integration-tests (stock-sync)} مع إرجاع بيانات الاختبار على فرع، ثم تسجيل النتيجة في {RT-DEMO-112}.'),
      nontechnical: l('The owner decides in the team’s task tracker. Nothing happens automatically.', 'المالك يقرر في متتبع مهام الفريق. لا شيء يحدث تلقائيًا.'),
    },
  },
  {
    id: 'DEC-DEMO-5', projectId: 'KH', investigationId: 'INV-DEMO-9', priority: 'medium', classification: 'proposed',
    decidedIn: 'KH-DEMO-40', ageMinutes: 17,
    title: same(l('Pause further {Khepri} staging deploys until the error rise is explained?', 'إيقاف عمليات نشر {Khepri} الإضافية في التجهيز حتى يُفسَّر ارتفاع الأخطاء؟')),
    context: l('Checks pass, but staging errors rose after a deploy. The linked work item could not be read.', 'الفحوص ناجحة، لكن الأخطاء ارتفعت بعد عملية نشر. تعذرت قراءة عنصر العمل المرتبط.'),
    observed: [X.khCiGreen, X.khErrorsRising],
    hypotheses: [l('The most recent staging deploy introduced the errors. Linked by timing only.', 'آخر نشر في بيئة التجهيز سبب الأخطاء. الربط بالتوقيت فقط.')],
    unknowns: [
      l('Work item status: {Jira} unavailable.', 'حالة عنصر العمل: {Jira} غير متاح.'),
      l('Whether production is affected: no production source.', 'هل الإنتاج متأثر: لا يوجد مصدر للإنتاج.'),
    ],
    options: [
      { id: 'A', suggested: true, evidence: [X.khErrorsRising],
        title: l('Pause staging deploys and inspect the error spike', 'إيقاف النشر في التجهيز وفحص ارتفاع الأخطاء'),
        benefit: l('Keeps the evidence stable while it is checked.', 'يحافظ على ثبات الأدلة أثناء الفحص.'),
        risk: l('Other teams wait for staging.', 'فرق أخرى تنتظر بيئة التجهيز.'),
        unknowns: [l('Which teams are blocked.', 'أي الفرق متوقفة.')] },
      { id: 'B', suggested: false, evidence: [X.khCiGreen],
        title: l('Continue deploys and watch the error rate', 'متابعة النشر ومراقبة معدل الأخطاء'),
        benefit: l('No delivery slowdown.', 'لا تباطؤ في التسليم.'),
        risk: l('Errors may grow and become harder to trace.', 'قد تزيد الأخطاء ويصعب تتبعها.'),
        unknowns: [] },
    ],
    nextStep: same(l('The {Khepri} owner reviews in {KH-DEMO-40} once {Jira} is readable again.', 'مالك {Khepri} يراجع في {KH-DEMO-40} عندما يصبح {Jira} مقروءًا مجددًا.')),
  },
  {
    id: 'DEC-DEMO-1', projectId: 'RT', priority: 'low', classification: 'approved', record: X.policyRecord,
    decidedIn: 'KMC-DEMO-21', ageMinutes: 20640,
    title: same(l('Freeze test data changes during release week (synthetic historical record)', 'تجميد تغييرات بيانات الاختبار أسبوع الإصدار (سجل تاريخي تجريبي)')),
    context: l('A past, synthetic decision recorded in {Confluence}. Shown to illustrate the Approved label only.', 'قرار سابق تجريبي مسجل في {Confluence}. يُعرض لتوضيح وسم «معتمد» فقط.'),
    observed: [X.policyRecord],
    hypotheses: [],
    unknowns: [],
    options: [],
    nextStep: same(l('No step: this is a historical record.', 'لا خطوة: هذا سجل تاريخي.')),
  },
];

const agents: readonly AgentDemo[] = [
  { id: 'AG-scout', name: 'triage-scout', state: 'watching', projectIds: ['RT', 'KH'], lastActivityMinutesAgo: 6,
    purpose: l('Groups new failing checks into investigation cases.', 'يجمع الفحوص الفاشلة الجديدة في حالات تحقيق.'),
    capabilities: [
      { id: 'read-ci', label: l('Read CI results (simulated)', 'قراءة نتائج التكامل المستمر (محاكاة)'), status: 'simulated' },
      { id: 'open-case', label: l('Open an investigation case (simulated)', 'فتح حالة تحقيق (محاكاة)'), status: 'simulated' },
    ] },
  { id: 'AG-collector', name: 'evidence-collector', state: 'idle', projectIds: ['RT', 'KH', 'SB'], lastActivityMinutesAgo: 5,
    purpose: l('Links evidence to cases by written rules.', 'يربط الأدلة بالحالات وفق قواعد مكتوبة.'),
    capabilities: [
      { id: 'correlate', label: l('Correlate by written rule (simulated)', 'الربط وفق قاعدة مكتوبة (محاكاة)'), status: 'simulated' },
    ] },
  { id: 'AG-guard', name: 'release-guard', state: 'paused', projectIds: ['RT'], lastActivityMinutesAgo: 1440,
    purpose: l('Drafts release-risk notes for a human owner.', 'يكتب مسودات ملاحظات مخاطر الإصدار لمالك بشري.'),
    capabilities: [
      { id: 'draft-note', label: l('Draft a proposal (simulated)', 'كتابة مسودة مقترح (محاكاة)'), status: 'simulated' },
    ] },
  { id: 'AG-fixer', name: 'remediation', state: 'not_enabled', projectIds: [], lastActivityMinutesAgo: null,
    purpose: l('Would change code or infrastructure. Not part of Kawalys in this version.', 'سيغيّر الكود أو البنية التحتية. ليس جزءًا من {Kawalys} في هذا الإصدار.'),
    capabilities: [
      { id: 'write', label: l('Any write to code, CI or tickets', 'أي كتابة على الكود أو التكامل المستمر أو التذاكر'), status: 'not_available' },
    ] },
];

const activity: readonly ActivityEvent[] = [
  { id: 'ACT-1', minutesAgo: 41, actor: 'source', projectId: 'RT', truth: 'observed', evidenceId: 'E-2',
    text: l('Test data change merged in {Retail Tower OS}.', 'دمج تغيير بيانات الاختبار في {Retail Tower OS}.') },
  { id: 'ACT-2', minutesAgo: 6, actor: 'source', projectId: 'RT', truth: 'observed', evidenceId: 'E-1', investigationId: 'INV-DEMO-7',
    text: l('Integration check failed on {main}.', 'فشل فحص التكامل على {main}.') },
  { id: 'ACT-3', minutesAgo: 6, actor: 'agent', agentId: 'AG-scout', projectId: 'RT', truth: 'proposed', investigationId: 'INV-DEMO-7',
    text: l('Simulated: case {INV-DEMO-7} opened for the failing check.', 'محاكاة: فُتحت الحالة {INV-DEMO-7} للفحص الفاشل.') },
  { id: 'ACT-4', minutesAgo: 5, actor: 'agent', agentId: 'AG-collector', projectId: 'RT', truth: 'correlated', evidenceId: 'E-3',
    text: l('Simulated: work item {RT-DEMO-112} linked by commit-key rule.', 'محاكاة: رُبط عنصر العمل {RT-DEMO-112} بقاعدة مفتاح الإيداع.') },
  { id: 'ACT-5', minutesAgo: 5, actor: 'agent', agentId: 'AG-collector', projectId: 'RT', truth: 'proposed', investigationId: 'INV-DEMO-7',
    text: l('Simulated: proposal {DEC-DEMO-3} drafted for human review.', 'محاكاة: صيغت مسودة المقترح {DEC-DEMO-3} لمراجعة بشرية.') },
  { id: 'ACT-6', minutesAgo: 19, actor: 'agent', agentId: 'AG-scout', projectId: 'KH', truth: 'proposed', investigationId: 'INV-DEMO-9',
    text: l('Simulated: case {INV-DEMO-9} opened for conflicting signals.', 'محاكاة: فُتحت الحالة {INV-DEMO-9} لإشارات متعارضة.') },
  { id: 'ACT-7', minutesAgo: 300, actor: 'source', projectId: 'KH', truth: 'unknown', evidenceId: 'E-24',
    text: l('{Jira} for {Khepri} became unavailable.', 'أصبح {Jira} الخاص بـ {Khepri} غير متاح.') },
  { id: 'ACT-8', minutesAgo: 1440, actor: 'human', projectId: 'RT', truth: 'observed', agentId: 'AG-guard',
    text: l('An owner paused {release-guard} (synthetic record).', 'أوقف مالك {release-guard} مؤقتًا (سجل تجريبي).') },
];

const evidenceText: Readonly<Record<string, ByPersonaL10n>> = {
  'E-11': same(l('Gateway smoke check passed on {main}', 'نجح فحص الدخان للبوابة على {main}')),
  'E-12': {
    owner: l('Payments errors in staging (restricted detail)', 'أخطاء المدفوعات في التجهيز (تفاصيل مقيدة)'),
    technical: l('{payments} error rate above baseline in staging', 'معدل أخطاء {payments} أعلى من الأساس في التجهيز'),
    nontechnical: l('Some payment errors were recorded', 'سُجلت بعض أخطاء الدفع'),
  },
  'E-21': same(l('{Khepri} web checks passed', 'نجحت فحوص ويب {Khepri}')),
  'E-22': same(l('{khepri-api} errors rising in staging', 'أخطاء {khepri-api} في ازدياد في التجهيز')),
  'E-23': same(l('Deploy {DEMO-311} shortly before the first error', 'النشر {DEMO-311} قبيل أول خطأ')),
  'E-24': same(l('Work item {KH-DEMO-40} (not read)', 'عنصر العمل {KH-DEMO-40} (لم يُقرأ)')),
  'E-31': same(l('{Seshat-BI} pipeline status (not read)', 'حالة خط {Seshat-BI} (لم تُقرأ)')),
  'E-41': same(l('Release-week freeze recorded in {Confluence}', 'تجميد أسبوع الإصدار مسجل في {Confluence}')),
};

const allEvidence: Readonly<Record<string, EvidenceReference>> = Object.fromEntries(
  [...Object.values(E), ...Object.values(X)].map((e) => [e.id, e]),
);

export const WORLD: World = {
  projects: [RT, KH, SB],
  investigations,
  decisions,
  agents,
  activity,
  evidence: allEvidence,
  evidenceText,
};

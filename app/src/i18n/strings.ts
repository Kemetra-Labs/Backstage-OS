// EN/AR copy. Case copy reuses the reviewed persona specimen from Blueprint v4 §5.
// {braces} mark left-to-right tokens (ids, times, product names, code). Digits are Latin in both languages (D-3).
import type { ConfidenceLevel, Connectivity, Environment, FactKey, Freshness, Health, Lang, Persona, Provider, TruthLabel } from '../contract/types';

type ByPersona = Readonly<Record<Persona, string>>;

export interface Copy {
  readonly skip: string;
  readonly breadcrumb: string;
  readonly demo: string;
  readonly viewAs: string;
  readonly language: string;
  readonly persona: Readonly<Record<Persona, string>>;
  readonly crumbs: readonly string[];
  readonly h1: string;
  readonly caseTitle: ByPersona;
  readonly started: string;
  readonly env: Readonly<Record<Environment, string>>;
  readonly sources: string;
  readonly sourcesNotCurrent: (n: number, total: number) => string;
  readonly provider: Readonly<Record<Provider, string>>;
  readonly connectivity: Readonly<Record<Connectivity, string>>;
  readonly freshness: Readonly<Record<Freshness, string>>;
  readonly health: Readonly<Record<Health, string>>;
  readonly label: Readonly<Record<TruthLabel | 'unknown', string>>;
  readonly plainLabel: Readonly<Record<TruthLabel | 'unknown', string>>;
  readonly stageTitle: string;
  readonly stageNote: string;
  readonly node: Readonly<Record<'pos' | 'stock-sync' | 'inventory', string>>;
  readonly checkFailing: ByPersona;
  readonly lastSeen: (age: string) => string;
  readonly ledgerTitle: string;
  readonly facts: Readonly<Record<FactKey, ByPersona>>;
  readonly factSource: Readonly<Record<FactKey, ByPersona>>;
  readonly confidence: string;
  readonly level: Readonly<Record<ConfidenceLevel, string>>;
  readonly noScore: string;
  readonly forLabel: string;
  readonly againstLabel: string;
  readonly confirmBy: string;
  readonly forText: string;
  readonly againstText: string;
  readonly confirmText: string;
  readonly evidenceTitle: string;
  readonly openEvidence: (id: string) => string;
  readonly notRead: Readonly<Record<'unavailable' | 'not_configured' | 'restricted', string>>;
  readonly restricted: string;
  readonly impactTitle: string;
  readonly customerImpact: string;
  readonly impactUnknown: ByPersona;
  readonly proposalTitle: string;
  readonly proposal: ByPersona;
  readonly decidedIn: ByPersona;
  readonly noActions: string;
  readonly copyProposal: string;
  readonly copied: string;
  readonly copyFailed: string;
  readonly drawer: {
    readonly title: (id: string) => string;
    readonly close: string;
    readonly status: string;
    readonly source: string;
    readonly observedAt: string;
    readonly ingestedAt: string;
    readonly environment: string;
    readonly freshness: string;
    readonly link: string;
    readonly inertNote: string;
    readonly rule: string;
    readonly raw: string;
    readonly id: string;
  };
  /** Evidence titles per persona: Owner gets a summary without job names or run ids, Nontechnical plain words. */
  readonly evidenceItem: Readonly<Record<string, ByPersona>>;
}

const en: Copy = {
  skip: 'Skip to content',
  breadcrumb: 'Breadcrumb',
  demo: 'Demo data · not live',
  viewAs: 'View as (demo)',
  language: 'Language',
  persona: { owner: 'Owner', technical: 'Technical', nontechnical: 'Nontechnical' },
  crumbs: ['Portfolio', '{Retail Tower OS}', '{INV-DEMO-7}'],
  h1: 'Investigation Room',
  caseTitle: {
    owner: 'Integration check failing on {main}. Release decision waiting.',
    technical: '{stock-sync} integration check failing on {main} (run {#DEMO-4471})',
    nontechnical: 'An automated test for {Retail Tower} is failing. A team is looking at it.',
  },
  started: 'Started',
  env: { ci: '{CI (main)}', lab: 'Lab', staging: 'Staging', production: 'Production', unknown: 'Unknown environment' },
  sources: 'Sources',
  sourcesNotCurrent: (n, t) => `${n} of ${t} sources not current`,
  provider: { github: 'GitHub', jira: 'Jira', confluence: 'Confluence', sentry: 'Sentry', datadog: 'Datadog', port: 'Port' },
  connectivity: { reachable: 'reachable', unavailable: 'unavailable', not_configured: 'not set up' },
  freshness: { current: 'current', stale: 'stale', unknown: 'unknown' },
  health: { healthy: 'Healthy', degraded: 'Degraded', down: 'Down', unknown: 'Health unknown' },
  label: { observed: 'Observed', correlated: 'Correlated', hypothesis: 'Hypothesis', proposed: 'Proposed', approved: 'Approved', unknown: 'Unknown' },
  plainLabel: { observed: 'Confirmed', correlated: 'Linked', hypothesis: 'Likely reason', proposed: 'Suggested step', approved: 'Decided', unknown: 'Not known' },
  stageTitle: 'Affected path',
  stageNote: 'Dashed lines are not verified. The map keeps its direction in Arabic.',
  node: { pos: 'POS client', 'stock-sync': '{stock-sync}', inventory: 'Inventory service' },
  checkFailing: { owner: 'CI check failing', technical: 'CI check failing', nontechnical: 'An automatic check is failing' },
  lastSeen: (age) => `last read ${age}, stale`,
  ledgerTitle: 'What we know',
  facts: {
    observed: {
      owner: 'The {stock-sync} integration check failed on {main}.',
      technical: '{integration-tests (stock-sync)} failed: expected {14:00Z}, got {16:00Z}.',
      nontechnical: 'An automatic check on new code failed.',
    },
    correlated: {
      owner: 'Linked to {RT-DEMO-112}, in progress, part of release {RT 2.14-rc} planned 18 Nov.',
      technical: '{RT-DEMO-112} linked by rule: key in the commit message of {PR #DEMO-88}. {fixVersion} {RT 2.14-rc}, 18 Nov.',
      nontechnical: 'There is already a task for this. It is part of the release planned for 18 Nov.',
    },
    hypothesis: {
      owner: 'Likely a test data change. Not confirmed.',
      technical: 'Fixture timezone change in {PR #DEMO-88} broke the assertion.',
      nontechnical: 'A likely reason was found. It is not confirmed yet.',
    },
    unknown: {
      owner: 'Runtime health is unknown: runtime monitoring is not set up and error monitoring data is stale.',
      technical: 'Runtime health unknown: {Datadog} not set up, {Sentry} stale 9 h, {Port} unavailable.',
      nontechnical: 'We do not know yet if the live service is affected. Some information is missing.',
    },
    proposed: {
      owner: 'Hold the release candidate until the test is re-run. Decided in {RT-DEMO-112}.',
      technical: 'Hold {RC}, re-run {integration-tests} with the fixture reverted on a branch.',
      nontechnical: 'Suggested next step: wait for a re-check before releasing. The owner decides.',
    },
  },
  factSource: {
    observed: { owner: 'GitHub', technical: 'GitHub · run {#DEMO-4471}', nontechnical: 'From GitHub' },
    correlated: { owner: 'Link: correlated · release date: observed, Jira', technical: 'Jira · rule: commit key · fixVersion observed', nontechnical: 'From Jira' },
    hypothesis: { owner: 'Not confirmed · confirm by re-running with the change reverted', technical: 'Rule-based reasoning, no calibrated score', nontechnical: 'Not confirmed' },
    unknown: { owner: 'Runtime sources', technical: 'Missing evidence', nontechnical: 'Some information is missing' },
    proposed: { owner: 'Display only · nothing runs', technical: 'Display only · nothing runs', nontechnical: 'Nothing has been done automatically' },
  },
  confidence: 'Confidence',
  level: { low: 'Low', medium: 'Medium', high: 'High' },
  noScore: 'no calibrated score',
  forLabel: 'For',
  againstLabel: 'Against',
  confirmBy: 'Confirm by',
  forText: 'The test diff shows a 2-hour offset, and {PR #DEMO-88} merged 35 min before the failure.',
  againstText: '{RT-DEMO-112} says the test was flaky before this change.',
  confirmText: 'Re-run {integration-tests} with the fixture reverted.',
  evidenceTitle: 'Evidence',
  openEvidence: (id) => `Open evidence {${id}}`,
  notRead: { unavailable: 'Not read: source unavailable', not_configured: 'Not read: source not set up', restricted: 'Restricted to Technical' },
  restricted: 'Restricted to Technical',
  impactTitle: 'Impact',
  customerImpact: 'Customer impact',
  impactUnknown: {
    owner: 'Unknown, not evidenced. A failing CI check on main does not show a runtime or customer effect.',
    technical: 'Unknown, not evidenced. A failing CI check on {main} does not show a runtime or customer effect.',
    nontechnical: 'Unknown, not evidenced. Nothing shows that customers or live stores are affected.',
  },
  proposalTitle: 'Proposed next step',
  proposal: {
    owner: 'Hold release {RT 2.14-rc} until the {stock-sync} test is re-run with the fixture reverted.',
    technical: 'Hold release {RT 2.14-rc}; re-run {integration-tests (stock-sync)} with the fixture reverted on a branch.',
    nontechnical: 'Wait for a re-check of the failing test before the release planned for 18 Nov.',
  },
  decidedIn: {
    owner: 'Decided in {RT-DEMO-112} (Jira, demo link, not followed)',
    technical: 'Decided in {RT-DEMO-112} (Jira, demo link, not followed)',
    nontechnical: 'The owner decides this in the team’s task tracker.',
  },
  noActions: 'Kawalys does not record or run decisions in this version.',
  copyProposal: 'Copy proposal text',
  copied: 'Copied',
  copyFailed: 'Could not copy. Select the text above instead.',
  drawer: {
    title: (id) => `Evidence {${id}}`,
    close: 'Close',
    status: 'Status',
    source: 'Source',
    observedAt: 'Observed at',
    ingestedAt: 'Read by Kawalys at',
    environment: 'Environment',
    freshness: 'Freshness',
    link: 'Link',
    inertNote: 'demo link, not followed',
    rule: 'Correlation rule',
    raw: 'Raw output',
    id: 'Id',
  },
  evidenceItem: {
    'E-1': {
      owner: 'The {stock-sync} integration check failed on {main}',
      technical: 'Check failed: {integration-tests (stock-sync)}',
      nontechnical: 'An automatic check on new code failed',
    },
    'E-2': {
      owner: 'A test data change was merged 35 min before the failure',
      technical: '{PR #DEMO-88} merged: fixture timezone update',
      nontechnical: 'A change to test data was added shortly before',
    },
    'E-3': {
      owner: 'Linked to work item {RT-DEMO-112}',
      technical: '{RT-DEMO-112} linked to the merged PR',
      nontechnical: 'There is already a task for this',
    },
    'E-4': {
      owner: '{RT-DEMO-112} is in release {RT 2.14-rc}, planned 18 Nov',
      technical: '{RT-DEMO-112} is in release {RT 2.14-rc}, planned 18 Nov',
      nontechnical: 'The task is part of the release planned for 18 Nov',
    },
    'E-5': {
      owner: 'Recent errors for the inventory service',
      technical: 'Recent errors for the inventory service',
      nontechnical: 'Recent errors for the inventory service',
    },
    'E-6': {
      owner: 'Runtime monitoring for {stock-sync}',
      technical: 'Runtime telemetry for {stock-sync}',
      nontechnical: 'Live monitoring of the service',
    },
    'E-7': {
      owner: 'Catalog owner for {stock-sync}',
      technical: 'Catalog owner for {stock-sync}',
      nontechnical: 'Who owns this service',
    },
  },
};

const ar: Copy = {
  skip: 'انتقل إلى المحتوى',
  breadcrumb: 'مسار التنقل',
  demo: 'بيانات تجريبية · ليست مباشرة',
  viewAs: 'العرض كـ (تجريبي)',
  language: 'اللغة',
  persona: { owner: 'المالك', technical: 'تقني', nontechnical: 'غير تقني' },
  crumbs: ['المحفظة', '{Retail Tower OS}', '{INV-DEMO-7}'],
  h1: 'غرفة التحقيق',
  caseTitle: {
    owner: 'فحص التكامل فاشل على {main}. قرار إصدار بانتظارك.',
    technical: 'فشل فحص تكامل {stock-sync} على {main} (التشغيل {#DEMO-4471})',
    nontechnical: 'اختبار آلي لـ {Retail Tower} يفشل. فريق يتابعه.',
  },
  started: 'بدأ',
  env: { ci: '{CI (main)}', lab: 'المختبر', staging: 'بيئة الاختبار', production: 'الإنتاج', unknown: 'بيئة غير معروفة' },
  sources: 'المصادر',
  sourcesNotCurrent: (n, t) => `${n} من ${t} مصادر غير حديثة`,
  provider: { github: 'GitHub', jira: 'Jira', confluence: 'Confluence', sentry: 'Sentry', datadog: 'Datadog', port: 'Port' },
  connectivity: { reachable: 'متصل', unavailable: 'غير متاح', not_configured: 'غير مُعد' },
  freshness: { current: 'حديث', stale: 'قديم', unknown: 'غير معروف' },
  health: { healthy: 'سليمة', degraded: 'متدهورة', down: 'متوقفة', unknown: 'الصحة غير معروفة' },
  label: { observed: 'مرصود', correlated: 'مرتبط', hypothesis: 'فرضية', proposed: 'مقترح', approved: 'معتمد', unknown: 'مجهول' },
  plainLabel: { observed: 'مؤكد', correlated: 'مرتبط', hypothesis: 'سبب مرجّح', proposed: 'خطوة مقترحة', approved: 'تقرر', unknown: 'غير معروف' },
  stageTitle: 'المسار المتأثر',
  stageNote: 'الخطوط المتقطعة غير مؤكدة. تحتفظ الخريطة باتجاهها في العربية.',
  node: { pos: 'عميل نقطة البيع', 'stock-sync': '{stock-sync}', inventory: 'خدمة المخزون' },
  checkFailing: { owner: 'فحص {CI} فاشل', technical: 'فحص {CI} فاشل', nontechnical: 'فحص آلي يفشل' },
  lastSeen: (age) => `آخر قراءة ${age}، قديمة`,
  ledgerTitle: 'ما نعرفه',
  facts: {
    observed: {
      owner: 'فشل فحص تكامل {stock-sync} على {main}.',
      technical: 'فشل {integration-tests (stock-sync)}: المتوقع {14:00Z} والفعلي {16:00Z}.',
      nontechnical: 'فشل فحص آلي على كود جديد.',
    },
    correlated: {
      owner: 'مرتبط بـ {RT-DEMO-112}، قيد التنفيذ، وضمن الإصدار {RT 2.14-rc} المخطط في 18 نوفمبر.',
      technical: '{RT-DEMO-112} مرتبط بقاعدة: المفتاح في رسالة {commit} لـ {PR #DEMO-88}. {fixVersion} هو {RT 2.14-rc} بتاريخ 18 نوفمبر.',
      nontechnical: 'توجد مهمة لهذا بالفعل، وهي ضمن الإصدار المخطط في 18 نوفمبر.',
    },
    hypothesis: {
      owner: 'غالبًا تغيير في بيانات الاختبار. غير مؤكد.',
      technical: 'تغيير المنطقة الزمنية في {fixture} ضمن {PR #DEMO-88} كسر التحقق.',
      nontechnical: 'وُجد سبب مرجّح، لم يتأكد بعد.',
    },
    unknown: {
      owner: 'صحة التشغيل مجهولة: مراقبة التشغيل غير مُعدة وبيانات مراقبة الأخطاء قديمة.',
      technical: 'صحة التشغيل مجهولة: {Datadog} غير مُعد، و{Sentry} قديم منذ 9 س، و{Port} غير متاح.',
      nontechnical: 'لا نعرف بعد إن كانت الخدمة المباشرة متأثرة. بعض المعلومات غير متوفرة.',
    },
    proposed: {
      owner: 'تعليق نسخة الإصدار حتى يُعاد الاختبار. القرار في {RT-DEMO-112}.',
      technical: 'تعليق {RC} وإعادة {integration-tests} بعد التراجع عن {fixture} في فرع.',
      nontechnical: 'الخطوة المقترحة: انتظار إعادة الفحص قبل الإصدار. المالك يقرر.',
    },
  },
  factSource: {
    observed: { owner: '{GitHub}', technical: '{GitHub} · التشغيل {#DEMO-4471}', nontechnical: 'من {GitHub}' },
    correlated: { owner: 'الربط: مرتبط · تاريخ الإصدار: مرصود من {Jira}', technical: '{Jira} · قاعدة: مفتاح {commit} · {fixVersion} مرصود', nontechnical: 'من {Jira}' },
    hypothesis: { owner: 'غير مؤكد · يتأكد بإعادة التشغيل بعد التراجع عن التغيير', technical: 'استدلال قائم على قواعد، دون درجة معايرة', nontechnical: 'غير مؤكد' },
    unknown: { owner: 'مصادر التشغيل', technical: 'أدلة مفقودة', nontechnical: 'بعض المعلومات غير متوفرة' },
    proposed: { owner: 'عرض فقط · لا يُنفَّذ شيء', technical: 'عرض فقط · لا يُنفَّذ شيء', nontechnical: 'لم يُنفَّذ أي شيء تلقائيًا' },
  },
  confidence: 'الثقة',
  level: { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة' },
  noScore: 'دون درجة معايرة',
  forLabel: 'مع',
  againstLabel: 'ضد',
  confirmBy: 'يتأكد بـ',
  forText: 'يظهر فرق ساعتين في نتيجة الاختبار، ودُمج {PR #DEMO-88} قبل الفشل بـ 35 دقيقة.',
  againstText: 'يذكر {RT-DEMO-112} أن الاختبار كان متذبذبًا قبل هذا التغيير.',
  confirmText: 'إعادة {integration-tests} بعد التراجع عن {fixture}.',
  evidenceTitle: 'الأدلة',
  openEvidence: (id) => `عرض الدليل {${id}}`,
  notRead: { unavailable: 'غير مقروء: المصدر غير متاح', not_configured: 'غير مقروء: المصدر غير مُعد', restricted: 'مقصور على الفريق التقني' },
  restricted: 'مقصور على الفريق التقني',
  impactTitle: 'الأثر',
  customerImpact: 'أثر العملاء',
  impactUnknown: {
    owner: 'مجهول، لا دليل عليه. فشل فحص {CI} على {main} لا يدل على أثر في التشغيل أو على العملاء.',
    technical: 'مجهول، لا دليل عليه. فشل فحص {CI} على {main} لا يدل على أثر في التشغيل أو على العملاء.',
    nontechnical: 'مجهول، لا دليل عليه. لا شيء يدل على تأثر العملاء أو المتاجر.',
  },
  proposalTitle: 'الخطوة المقترحة',
  proposal: {
    owner: 'تعليق الإصدار {RT 2.14-rc} حتى يُعاد اختبار {stock-sync} بعد التراجع عن {fixture}.',
    technical: 'تعليق الإصدار {RT 2.14-rc}؛ وإعادة {integration-tests (stock-sync)} بعد التراجع عن {fixture} في فرع.',
    nontechnical: 'انتظار إعادة فحص الاختبار الفاشل قبل الإصدار المخطط في 18 نوفمبر.',
  },
  decidedIn: {
    owner: 'القرار في {RT-DEMO-112} ({Jira}، رابط تجريبي لا يُفتح)',
    technical: 'القرار في {RT-DEMO-112} ({Jira}، رابط تجريبي لا يُفتح)',
    nontechnical: 'يقرر المالك هذا في أداة متابعة مهام الفريق.',
  },
  noActions: 'لا يسجّل النظام القرارات ولا ينفّذها في هذا الإصدار.',
  copyProposal: 'نسخ نص الاقتراح',
  copied: 'تم النسخ',
  copyFailed: 'تعذّر النسخ. حدّد النص أعلاه بدلًا من ذلك.',
  drawer: {
    title: (id) => `الدليل {${id}}`,
    close: 'إغلاق',
    status: 'الحالة',
    source: 'المصدر',
    observedAt: 'وقت الرصد',
    ingestedAt: 'وقت القراءة',
    environment: 'البيئة',
    freshness: 'الحداثة',
    link: 'الرابط',
    inertNote: 'رابط تجريبي، لا يُفتح',
    rule: 'قاعدة الربط',
    raw: 'المخرجات الخام',
    id: 'المعرّف',
  },
  evidenceItem: {
    'E-1': {
      owner: 'فشل فحص تكامل {stock-sync} على {main}',
      technical: 'فشل الفحص: {integration-tests (stock-sync)}',
      nontechnical: 'فشل فحص آلي على كود جديد',
    },
    'E-2': {
      owner: 'دُمج تغيير في بيانات الاختبار قبل الفشل بـ 35 دقيقة',
      technical: 'دُمج {PR #DEMO-88}: تحديث المنطقة الزمنية في {fixture}',
      nontechnical: 'أُضيف تغيير في بيانات الاختبار قبل قليل',
    },
    'E-3': {
      owner: 'مرتبط ببند العمل {RT-DEMO-112}',
      technical: '{RT-DEMO-112} مرتبط بالتغيير المدموج',
      nontechnical: 'توجد مهمة لهذا بالفعل',
    },
    'E-4': {
      owner: '{RT-DEMO-112} ضمن الإصدار {RT 2.14-rc} المخطط في 18 نوفمبر',
      technical: '{RT-DEMO-112} ضمن الإصدار {RT 2.14-rc} المخطط في 18 نوفمبر',
      nontechnical: 'المهمة ضمن الإصدار المخطط في 18 نوفمبر',
    },
    'E-5': {
      owner: 'الأخطاء الأخيرة لخدمة المخزون',
      technical: 'الأخطاء الأخيرة لخدمة المخزون',
      nontechnical: 'الأخطاء الأخيرة لخدمة المخزون',
    },
    'E-6': {
      owner: 'مراقبة التشغيل لـ {stock-sync}',
      technical: 'قياسات التشغيل لـ {stock-sync}',
      nontechnical: 'المراقبة المباشرة للخدمة',
    },
    'E-7': {
      owner: 'مالك {stock-sync} في الكتالوج',
      technical: 'مالك {stock-sync} في الكتالوج',
      nontechnical: 'من يملك هذه الخدمة',
    },
  },
};

export const COPY: Readonly<Record<Lang, Copy>> = { en, ar };

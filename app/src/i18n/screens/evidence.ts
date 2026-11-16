// Evidence Explorer copy (BACK-11). {braces} isolate left-to-right tokens; Latin digits in both languages.
// No link or button label here may contain an action verb (see isForbiddenControlLabel).
import type { DisplayLabel, Freshness, Lang } from '../../contract/types';

export interface EvidenceCopy {
  readonly h1: (id: string) => string;
  readonly back: (id: string) => string;
  readonly classification: { readonly title: string; readonly text: Readonly<Record<DisplayLabel, string>> };
  readonly details: string;
  readonly fields: {
    readonly source: string;
    readonly observedAt: string;
    readonly readAt: string;
    readonly freshness: string;
    readonly environment: string;
    readonly target: string;
    readonly rule: string;
    readonly id: string;
    readonly link: string;
    readonly inertNote: string;
  };
  readonly freshnessNote: Readonly<Record<Freshness, string>>;
  readonly raw: string;
  readonly restrictedBody: string;
  readonly notReadBody: string;
  readonly supporting: {
    readonly title: string;
    readonly investigations: string;
    readonly decisions: string;
    readonly context: string;
    readonly none: string;
    readonly openCase: (id: string) => string;
    readonly openProposal: (id: string) => string;
    readonly viewProject: (name: string) => string;
    readonly viewComponent: (name: string) => string;
  };
  readonly siblings: { readonly title: (invId: string) => string; readonly none: string; readonly inspect: (id: string) => string };
  readonly notFound: { readonly title: string; readonly body: (id: string) => string };
  readonly openPortfolio: string;
}

const en: EvidenceCopy = {
  h1: (id) => `Evidence {${id}}`,
  back: (id) => `Back to {${id}}`,
  classification: {
    title: 'How to read this',
    text: {
      observed: 'Observed: read directly from its source. Nothing was inferred.',
      correlated: 'Correlated: linked to something else by a written rule. A link is not a cause.',
      hypothesis: 'Hypothesis: a suspected explanation. Nothing observed confirms it yet.',
      proposed: 'Proposed: a suggestion for a person to review. Kawalys does not act on it.',
      approved: 'Approved: a decision a person recorded in the source record. This is a synthetic example.',
      unknown: 'Unknown: nothing was read, so there is no basis to say either way.',
    },
  },
  details: 'Details',
  fields: {
    source: 'Source',
    observedAt: 'Observed at',
    readAt: 'Read by Kawalys at',
    freshness: 'Freshness',
    environment: 'Environment',
    target: 'Target',
    rule: 'Correlation rule',
    id: 'Source id',
    link: 'Link',
    inertNote: 'demo link, not followed',
  },
  freshnessNote: {
    current: 'Current: within its source’s time limit.',
    stale: 'Stale: older than its source’s time limit. It is shown as stale, never as current.',
    unknown: 'Unknown: freshness cannot be established.',
  },
  raw: 'Raw output',
  restrictedBody: 'This item exists and is counted. Its detail is shown only to the Technical persona.',
  notReadBody: 'Kawalys has no observation for this item. It is not counted as zero and not treated as healthy.',
  supporting: {
    title: 'Supporting entities',
    investigations: 'Cited by',
    decisions: 'Cited in proposals',
    context: 'Where it applies',
    none: 'Nothing cites this item in the demo data.',
    openCase: (id) => `Open case {${id}}`,
    openProposal: (id) => `Open proposal {${id}}`,
    viewProject: (name) => `View {${name}}`,
    viewComponent: (name) => `View component {${name}}`,
  },
  siblings: {
    title: (invId) => `Other evidence in {${invId}}`,
    none: 'No other evidence in this case.',
    inspect: (id) => `Inspect {${id}}`,
  },
  notFound: {
    title: 'Evidence not found',
    body: (id) => `No evidence item {${id}} exists in the demo data.`,
  },
  openPortfolio: 'Open Portfolio',
};

const ar: EvidenceCopy = {
  h1: (id) => `الدليل {${id}}`,
  back: (id) => `العودة إلى {${id}}`,
  classification: {
    title: 'كيف تقرأ هذا',
    text: {
      observed: 'مرصود: مقروء مباشرة من مصدره. لم يُستنتج شيء.',
      correlated: 'مرتبط: موصول بشيء آخر بقاعدة مكتوبة. الارتباط ليس سببًا.',
      hypothesis: 'فرضية: تفسير مشتبه به. لا شيء مرصود يؤكده بعد.',
      proposed: 'مقترح: اقتراح يراجعه شخص. لا يتصرف النظام بناءً عليه.',
      approved: 'معتمد: قرار سجّله شخص في السجل المصدر. هذا مثال اصطناعي.',
      unknown: 'مجهول: لم يُقرأ شيء، فلا أساس للقول في أي اتجاه.',
    },
  },
  details: 'التفاصيل',
  fields: {
    source: 'المصدر',
    observedAt: 'وقت الرصد',
    readAt: 'وقت القراءة بواسطة النظام',
    freshness: 'الحداثة',
    environment: 'البيئة',
    target: 'الهدف',
    rule: 'قاعدة الربط',
    id: 'معرّف المصدر',
    link: 'الرابط',
    inertNote: 'رابط تجريبي، لا يُفتح',
  },
  freshnessNote: {
    current: 'حديث: ضمن المهلة المحددة لمصدره.',
    stale: 'قديم: تجاوز المهلة المحددة لمصدره. يظهر قديمًا وليس حديثًا أبدًا.',
    unknown: 'غير معروف: تعذّر تحديد الحداثة.',
  },
  raw: 'المخرجات الخام',
  restrictedBody: 'هذا العنصر موجود ومحسوب. تفاصيله تظهر لدور الفريق التقني فقط.',
  notReadBody: 'لا توجد ملاحظة لهذا العنصر لدى النظام. لا يُحسب صفرًا ولا يُعامل كسليم.',
  supporting: {
    title: 'الكيانات الداعمة',
    investigations: 'مُستشهَد به في',
    decisions: 'مُستشهَد به في اقتراحات',
    context: 'مكان انطباقه',
    none: 'لا شيء يستشهد بهذا العنصر في البيانات التجريبية.',
    openCase: (id) => `فتح الحالة {${id}}`,
    openProposal: (id) => `فتح الاقتراح {${id}}`,
    viewProject: (name) => `عرض {${name}}`,
    viewComponent: (name) => `عرض المكوّن {${name}}`,
  },
  siblings: {
    title: (invId) => `أدلة أخرى في {${invId}}`,
    none: 'لا أدلة أخرى في هذه الحالة.',
    inspect: (id) => `استعراض {${id}}`,
  },
  notFound: {
    title: 'الدليل غير موجود',
    body: (id) => `لا يوجد عنصر دليل {${id}} في البيانات التجريبية.`,
  },
  openPortfolio: 'فتح المحفظة',
};

export const EVIDENCE: Readonly<Record<Lang, EvidenceCopy>> = { en, ar };

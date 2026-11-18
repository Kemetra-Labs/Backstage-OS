// Source health copy (demo only). {braces} mark left-to-right tokens; Latin digits in both languages.
import type { Lang, Provider } from '../../contract/types';
import type { SourceBuckets } from '../../view/portfolioView';

export interface IntegrationCopy {
  /** What Kawalys would read (read-only). */
  readonly reads: string;
  /** The same in plain words for Nontechnical. */
  readonly plain: string;
}

export interface SourcesCopy {
  readonly lede: string;
  readonly dimensions: {
    readonly title: string;
    readonly connectivity: { readonly name: string; readonly body: string };
    readonly freshness: { readonly name: string; readonly body: string };
    readonly target: { readonly name: string; readonly body: string };
    readonly scope: string;
    readonly projectsLink: string;
  };
  readonly plainNote: string;
  readonly table: {
    readonly caption: (product: string) => string;
    readonly provider: string;
    readonly connectivity: string;
    readonly freshness: string;
    readonly observation: string;
    readonly ttl: string;
    readonly marker: string;
    readonly synthetic: string;
    readonly summaryRow: string;
    readonly ttlSeconds: (s: number) => string;
  };
  readonly summary: (s: SourceBuckets) => string;
  readonly stateHeading: string;
  readonly stateBlock: {
    readonly unavailable: (affected: string) => string;
    readonly not_configured: (affected: string) => string;
  };
  readonly integrations: {
    readonly title: string;
    readonly intro: string;
    readonly readOnly: string;
    readonly reads: string;
    readonly provider: Readonly<Record<Provider, IntegrationCopy>>;
  };
  readonly affectedSep: string;
}

const en: SourcesCopy = {
  lede: 'Which sources Kawalys would read for each product, and how far to trust what they returned. Synthetic data only.',
  dimensions: {
    title: 'Three separate questions',
    connectivity: { name: 'Source connectivity', body: 'Can Kawalys reach the source: reachable, unavailable or not set up.' },
    freshness: { name: 'Evidence freshness', body: 'How old the last good read is against its time limit: current, stale or unknown.' },
    target: { name: 'Target health', body: 'How the product or component is doing. It needs current Observed evidence, never an assumption.' },
    scope: 'This screen shows only the first two. Target health lives on the product pages.',
    projectsLink: 'Open Portfolio',
  },
  plainNote: 'Some information is missing or old. Where that is the case, it says so instead of showing a good result.',
  table: {
    caption: (p) => `Sources for {${p}}`,
    provider: 'Provider',
    connectivity: 'Source connectivity',
    freshness: 'Evidence freshness',
    observation: 'Last synthetic observation',
    ttl: 'TTL (minutes)',
    marker: 'Marker',
    synthetic: 'Synthetic',
    summaryRow: 'Summary',
    ttlSeconds: (s) => `${s} s`,
  },
  summary: (s) => {
    const parts = [`${s.current} of ${s.total} sources current`];
    if (s.stale > 0) parts.push(`${s.stale} stale`);
    if (s.unavailable > 0) parts.push(`${s.unavailable} unavailable`);
    if (s.notConfigured > 0) parts.push(`${s.notConfigured} not set up`);
    if (s.unknown > 0) parts.push(`${s.unknown} not read yet`);
    return parts.join(', ');
  },
  stateHeading: 'What the states mean',
  stateBlock: {
    unavailable: (a) => `The last read failed, so older data is shown as stale. Affected: ${a}.`,
    not_configured: (a) => `Nothing has been read, so freshness is unknown and health cannot be claimed. Affected: ${a}.`,
  },
  integrations: {
    title: 'What each provider would provide',
    intro: 'In this build nothing is connected and no credentials exist. Real connections need the owner-approved G2 gate ({BACK-7}).',
    readOnly: 'Read-only. Kawalys would never write to any of these.',
    reads: 'Would read',
    provider: {
      github: { reads: 'Workflow runs and jobs', plain: 'Test and build results' },
      jira: { reads: 'Issue status, links and fixVersion', plain: 'Work item status and release links' },
      confluence: { reads: 'Decision records', plain: 'Written decisions' },
      sentry: { reads: 'Error counts', plain: 'How often errors happen' },
      datadog: { reads: 'Runtime metrics', plain: 'How the running system is behaving' },
      port: { reads: 'Catalog ownership', plain: 'Who owns which part' },
    },
  },
  affectedSep: '; ',
};

const ar: SourcesCopy = {
  lede: 'المصادر التي كان {Kawalys} سيقرأها لكل منتج، ومدى الوثوق بما أعادته. بيانات اصطناعية فقط.',
  dimensions: {
    title: 'ثلاثة أسئلة منفصلة',
    connectivity: { name: 'اتصال المصدر', body: 'هل يستطيع {Kawalys} الوصول إلى المصدر: متصل أو غير متاح أو غير مُعد.' },
    freshness: { name: 'حداثة الدليل', body: 'عمر آخر قراءة ناجحة مقارنة بحدّها الزمني: حديث أو قديم أو غير معروف.' },
    target: { name: 'صحة الهدف', body: 'حال المنتج أو المكوّن. تحتاج إلى دليل مرصود حديث، وليس إلى افتراض.' },
    scope: 'هذه الصفحة تعرض الأولين فقط. صحة الهدف في صفحات المنتجات.',
    projectsLink: 'فتح المحفظة',
  },
  plainNote: 'بعض المعلومات ناقصة أو قديمة. وحيث يكون ذلك، يُذكر صراحة بدل عرض نتيجة جيدة.',
  table: {
    caption: (p) => `مصادر {${p}}`,
    provider: 'المزوّد',
    connectivity: 'اتصال المصدر',
    freshness: 'حداثة الدليل',
    observation: 'آخر رصد اصطناعي',
    ttl: '{TTL} (دقائق)',
    marker: 'الوسم',
    synthetic: 'اصطناعي',
    summaryRow: 'الخلاصة',
    ttlSeconds: (s) => `${s} ث`,
  },
  summary: (s) => {
    const parts = [`${s.current} من ${s.total} مصادر حديثة`];
    if (s.stale > 0) parts.push(`${s.stale} قديمة`);
    if (s.unavailable > 0) parts.push(`${s.unavailable} غير متاحة`);
    if (s.notConfigured > 0) parts.push(`${s.notConfigured} غير مُعدة`);
    if (s.unknown > 0) parts.push(`${s.unknown} لم تُقرأ بعد`);
    return parts.join('، ');
  },
  stateHeading: 'ماذا تعني الحالات',
  stateBlock: {
    unavailable: (a) => `فشلت آخر قراءة، لذا تُعرض البيانات الأقدم على أنها قديمة. المتأثر: ${a}.`,
    not_configured: (a) => `لم تُقرأ أي بيانات، لذا الحداثة غير معروفة ولا يمكن ادعاء الصحة. المتأثر: ${a}.`,
  },
  integrations: {
    title: 'ما الذي سيقدمه كل مزوّد',
    intro: 'في هذا الإصدار لا شيء متصل ولا توجد بيانات اعتماد. الاتصالات الحقيقية تحتاج إلى بوابة {G2} التي يعتمدها المالك ({BACK-7}).',
    readOnly: 'للقراءة فقط. لن يكتب {Kawalys} على أي منها أبدًا.',
    reads: 'سيقرأ',
    provider: {
      github: { reads: 'عمليات سير العمل ومهامها', plain: 'نتائج الاختبار والبناء' },
      jira: { reads: 'حالة البلاغات وروابطها و{fixVersion}', plain: 'حالة عناصر العمل وروابط الإصدار' },
      confluence: { reads: 'سجلات القرارات', plain: 'القرارات المكتوبة' },
      sentry: { reads: 'أعداد الأخطاء', plain: 'عدد مرات حدوث الأخطاء' },
      datadog: { reads: 'مقاييس التشغيل', plain: 'سلوك النظام أثناء التشغيل' },
      port: { reads: 'ملكية الكتالوج', plain: 'من يملك أي جزء' },
    },
  },
  affectedSep: '؛ ',
};

export const SOURCES_COPY: Readonly<Record<Lang, SourcesCopy>> = { en, ar };

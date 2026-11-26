// Shell and shared-component copy (BACK-10). Screen copy lives in i18n/screens/<screen>.ts.
// Same rules as strings.ts: {braces} isolate left-to-right tokens; Latin digits in both languages.
import type { Lang } from '../contract/types';
import type { EdgeKind, Severity } from '../contract/world';

export type StateKind = 'loading' | 'empty' | 'error' | 'restricted' | 'unavailable' | 'not_configured' | 'unknown';
/** The live states a panel can show instead of data (BACK-51 P1); live/reads.ts LiveFailure plus loading. */
export type LiveStateKey = 'loading' | 'not_found' | 'notChosen' | 'unavailable' | 'invalid' | 'rate_limited' | 'error';
export type NavKey = 'home' | 'portfolio' | 'map' | 'project' | 'investigation' | 'decisions' | 'agents' | 'sources';

export interface ShellCopy {
  readonly nav: Readonly<Record<NavKey, string>>;
  readonly navLabel: string;
  readonly projectsLabel: string;
  readonly menu: string;
  readonly search: {
    readonly label: string;
    readonly placeholder: string;
    readonly results: (n: number) => string;
    readonly none: string;
    readonly kind: Readonly<Record<'project' | 'component' | 'investigation' | 'evidence' | 'decision' | 'workItem', string>>;
  };
  readonly states: Readonly<Record<StateKind, { readonly title: string; readonly body: string }>>;
  readonly triad: { readonly connectivity: string; readonly freshness: string; readonly health: string };
  readonly edge: Readonly<Record<EdgeKind, string>>;
  readonly edgeNote: Readonly<Record<EdgeKind, string>>;
  readonly severity: Readonly<Record<Severity, string>>;
  readonly map: {
    readonly legend: string;
    readonly tableCaption: string;
    readonly from: string;
    readonly to: string;
    readonly kind: string;
    readonly basis: string;
    readonly noBasis: string;
    /** Note shown on the map when N links have an endpoint that is not a node (not drawn). */
    readonly undrawn: (n: number) => string;
    readonly direction: string;
    readonly selected: string;
  };
  readonly timeline: string;
  readonly back: string;
  readonly notFound: { readonly title: string; readonly body: string; readonly home: string };
  /**
   * Live mode (BACK-51 P1, VITE_KAWALYS_LIVE=1): where the data came from, and every state a live panel shows instead of data.
   * Never the default `states` copy, which speaks of demo data. not_found covers 401 too: the server makes them identical.
   */
  readonly live: {
    readonly source: string;
    /** The footer of a live build: says which panels read the server, never that nothing is live. */
    readonly footer: string;
    readonly states: Readonly<Record<LiveStateKey, { readonly title: string; readonly body: string }>>;
  };
  readonly footer: string;
  /** Label for the top-bar source strip, which shows one product's sources (the S1 investigation's), not the whole workspace. */
  readonly sourcesFor: (product: string) => string;
}

const en: ShellCopy = {
  nav: {
    home: 'Command Home',
    portfolio: 'Portfolio',
    map: 'Mission Map',
    project: 'Project Intelligence',
    investigation: 'Investigation Room',
    decisions: 'Decision Inbox',
    agents: 'Agent activity (demo)',
    sources: 'Source health (demo)',
  },
  navLabel: 'Main',
  projectsLabel: 'Projects',
  menu: 'Menu',
  search: {
    label: 'Search demo data',
    placeholder: 'Id, product or component',
    results: (n) => (n === 1 ? '1 result' : `${n} results`),
    none: 'No match in the demo data.',
    kind: { project: 'Product', component: 'Component', investigation: 'Investigation', evidence: 'Evidence', decision: 'Decision', workItem: 'Work item' },
  },
  states: {
    loading: { title: 'Loading demo data', body: 'Reading the synthetic fixture.' },
    empty: { title: 'Nothing here yet', body: 'No items exist for this view in the demo data.' },
    error: { title: 'Could not show this view', body: 'Something in the demo data is missing or malformed.' },
    restricted: { title: 'Restricted to Technical', body: 'This persona does not see the detail. It exists, and it is not counted as zero.' },
    unavailable: { title: 'Source unavailable', body: 'The last read failed. Older data is shown as stale, never as current.' },
    not_configured: { title: 'Source not set up', body: 'Nothing has been read, so health is unknown, not healthy.' },
    unknown: { title: 'Unknown', body: 'There is no evidence either way.' },
  },
  triad: { connectivity: 'Source', freshness: 'Freshness', health: 'Health' },
  edge: { authored: 'Declared', provisional: 'Provisional', hypothesis: 'Suspected' },
  edgeNote: {
    authored: 'declared in a catalog',
    provisional: 'mapped by a rule, not confirmed',
    hypothesis: 'suspected only, no evidence',
  },
  severity: { high: 'High', medium: 'Medium', low: 'Low' },
  map: {
    legend: 'Map legend',
    tableCaption: 'Dependencies as a table',
    from: 'From',
    to: 'To',
    kind: 'Link',
    basis: 'Basis',
    noBasis: 'no evidence',
    undrawn: (n) => `${n === 1 ? '1 link' : `${n} links`} not drawn on the map — see the table`,
    direction: 'Data flows left to right in both languages.',
    selected: 'selected',
  },
  timeline: 'Timeline',
  back: 'Back',
  notFound: { title: 'Page not found', body: 'This address is not part of the demo.', home: 'Open Command Home' },
  live: {
    source: 'Live: read from the {Kawalys} server',
    footer: 'Kawalys review build, live mode. The GitHub reads and server records panels read the {Kawalys} server; everything else is synthetic, and no action is taken.',
    states: {
      loading: { title: 'Reading the {Kawalys} server', body: 'Asking the server for the latest stored reads.' },
      not_found: { title: 'Not found, or not signed in', body: 'The server did not return this. It may not exist, or this session may not see it.' },
      notChosen: { title: 'No investigation chosen', body: 'Open this page with {?investigation=} and an investigation id ({npm run local:up} prints one).' },
      unavailable: { title: 'The server could not be reached', body: 'Nothing was read. This is unknown, not healthy.' },
      invalid: { title: 'The server refused the request', body: 'The request was not accepted. Nothing is shown.' },
      rate_limited: { title: 'Too many requests', body: 'The server asked us to slow down. Try again in a minute.' },
      error: { title: 'The server answered with an error', body: 'Nothing is shown. This is unknown, not healthy.' },
    },
  },
  footer: 'Kawalys review build. Synthetic data only: nothing here is live, and no action is taken.',
  sourcesFor: (product) => `Sources for {${product}}`,
};

const ar: ShellCopy = {
  nav: {
    home: 'مركز القيادة',
    portfolio: 'المحفظة',
    map: 'خريطة المهام',
    project: 'ذكاء المشروع',
    investigation: 'غرفة التحقيق',
    decisions: 'صندوق القرارات',
    agents: 'نشاط الوكلاء (تجريبي)',
    sources: 'صحة المصادر (تجريبي)',
  },
  navLabel: 'الرئيسية',
  projectsLabel: 'المشاريع',
  menu: 'القائمة',
  search: {
    label: 'بحث في البيانات التجريبية',
    placeholder: 'معرّف أو منتج أو مكوّن',
    results: (n) => `${n} نتيجة`,
    none: 'لا تطابق في البيانات التجريبية.',
    kind: { project: 'منتج', component: 'مكوّن', investigation: 'تحقيق', evidence: 'دليل', decision: 'قرار', workItem: 'عنصر عمل' },
  },
  states: {
    loading: { title: 'جارٍ تحميل البيانات التجريبية', body: 'قراءة البيانات الاصطناعية.' },
    empty: { title: 'لا شيء هنا بعد', body: 'لا توجد عناصر لهذا العرض في البيانات التجريبية.' },
    error: { title: 'تعذّر عرض هذه الصفحة', body: 'جزء من البيانات التجريبية مفقود أو غير صالح.' },
    restricted: { title: 'مقيّد للفريق التقني', body: 'هذا الدور لا يرى التفاصيل. العنصر موجود ولا يُحسب صفرًا.' },
    unavailable: { title: 'المصدر غير متاح', body: 'فشلت آخر قراءة. البيانات الأقدم تظهر قديمة، لا حديثة.' },
    not_configured: { title: 'المصدر غير مُعدّ', body: 'لم يُقرأ شيء، لذا الحالة غير معروفة وليست سليمة.' },
    unknown: { title: 'غير معروف', body: 'لا يوجد دليل في أي اتجاه.' },
  },
  triad: { connectivity: 'المصدر', freshness: 'الحداثة', health: 'الحالة' },
  edge: { authored: 'مُعلن', provisional: 'مبدئي', hypothesis: 'مشتبه' },
  edgeNote: {
    authored: 'مُعلن في كتالوج',
    provisional: 'مربوط بقاعدة، غير مؤكد',
    hypothesis: 'اشتباه فقط، بلا دليل',
  },
  severity: { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
  map: {
    legend: 'مفتاح الخريطة',
    tableCaption: 'الاعتماديات في جدول',
    from: 'من',
    to: 'إلى',
    kind: 'الرابط',
    basis: 'الأساس',
    noBasis: 'لا دليل',
    undrawn: (n) =>
      n === 1 ? 'رابط واحد غير مرسوم على الخريطة — راجع الجدول'
      : n === 2 ? 'رابطان غير مرسومين على الخريطة — راجع الجدول'
      : n <= 10 ? `${n} روابط غير مرسومة على الخريطة — راجع الجدول`
      : `${n} رابطًا غير مرسوم على الخريطة — راجع الجدول`,
    direction: 'تتدفق البيانات من اليسار إلى اليمين في اللغتين.',
    selected: 'محدد',
  },
  timeline: 'الخط الزمني',
  back: 'رجوع',
  notFound: { title: 'الصفحة غير موجودة', body: 'هذا العنوان ليس جزءًا من العرض التجريبي.', home: 'فتح مركز القيادة' },
  live: {
    source: 'مباشر: مقروء من خادم {Kawalys}',
    footer: 'نسخة مراجعة {Kawalys}، الوضع المباشر. لوحتا قراءات {GitHub} وسجلات الخادم تقرآن من خادم {Kawalys}؛ وكل ما عداهما مصطنع، ولا يُتخذ أي إجراء.',
    states: {
      loading: { title: 'جارٍ القراءة من خادم {Kawalys}', body: 'نطلب من الخادم آخر القراءات المحفوظة.' },
      not_found: { title: 'غير موجود، أو لم يتم تسجيل الدخول', body: 'لم يُرجع الخادم هذا. قد لا يكون موجودًا، أو قد لا تراه هذه الجلسة.' },
      notChosen: { title: 'لم يتم اختيار تحقيق', body: 'افتح هذه الصفحة مع {?investigation=} ومعرّف تحقيق (يطبعه {npm run local:up}).' },
      unavailable: { title: 'تعذّر الوصول إلى الخادم', body: 'لم يُقرأ شيء. الحالة غير معروفة وليست سليمة.' },
      invalid: { title: 'رفض الخادم الطلب', body: 'لم يُقبل الطلب. لا يُعرض شيء.' },
      rate_limited: { title: 'طلبات كثيرة جدًا', body: 'طلب الخادم الإبطاء. حاول بعد دقيقة.' },
      error: { title: 'أجاب الخادم بخطأ', body: 'لا يُعرض شيء. الحالة غير معروفة وليست سليمة.' },
    },
  },
  footer: 'نسخة مراجعة من {Kawalys}. بيانات اصطناعية فقط: لا شيء هنا حي، ولا يُتخذ أي إجراء.',
  sourcesFor: (product) => `مصادر {${product}}`,
};

export const SHELL: Readonly<Record<Lang, ShellCopy>> = { en, ar };

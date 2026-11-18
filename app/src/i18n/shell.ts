// Shell and shared-component copy (BACK-10). Screen copy lives in i18n/screens/<screen>.ts.
// Same rules as strings.ts: {braces} isolate left-to-right tokens; Latin digits in both languages.
import type { Lang } from '../contract/types';
import type { EdgeKind, Severity } from '../contract/world';

export type StateKind = 'loading' | 'empty' | 'error' | 'restricted' | 'unavailable' | 'not_configured' | 'unknown';
export type NavKey = 'home' | 'portfolio' | 'project' | 'investigation' | 'decisions' | 'agents' | 'sources';

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
    readonly direction: string;
    readonly selected: string;
  };
  readonly timeline: string;
  readonly back: string;
  readonly notFound: { readonly title: string; readonly body: string; readonly home: string };
  readonly footer: string;
}

const en: ShellCopy = {
  nav: {
    home: 'Command Home',
    portfolio: 'Portfolio',
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
    direction: 'Data flows left to right in both languages.',
    selected: 'selected',
  },
  timeline: 'Timeline',
  back: 'Back',
  notFound: { title: 'Page not found', body: 'This address is not part of the demo.', home: 'Open Command Home' },
  footer: 'Kawalys review build. Synthetic data only: nothing here is live, and no action is taken.',
};

const ar: ShellCopy = {
  nav: {
    home: 'مركز القيادة',
    portfolio: 'المحفظة',
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
    direction: 'تتدفق البيانات من اليسار إلى اليمين في اللغتين.',
    selected: 'محدد',
  },
  timeline: 'الخط الزمني',
  back: 'رجوع',
  notFound: { title: 'الصفحة غير موجودة', body: 'هذا العنوان ليس جزءًا من العرض التجريبي.', home: 'فتح مركز القيادة' },
  footer: 'نسخة مراجعة من {Kawalys}. بيانات اصطناعية فقط: لا شيء هنا حي، ولا يُتخذ أي إجراء.',
};

export const SHELL: Readonly<Record<Lang, ShellCopy>> = { en, ar };

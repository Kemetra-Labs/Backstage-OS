// Command Home copy. {braces} isolate left-to-right tokens; Latin digits in both languages.
// No link or button label here may contain an action verb (see isForbiddenControlLabel).
import type { Lang, Persona } from '../../contract/types';

export interface HomeCopy {
  readonly lede: Readonly<Record<Persona, string>>;
  readonly signalsLabel: string;
  readonly signal: Readonly<Record<'products' | 'attention' | 'investigations' | 'proposals' | 'sources', string>>;
  readonly ofTotal: (total: number) => string;
  readonly attention: { readonly title: string; readonly none: string; readonly project: string };
  readonly openCase: (id: string) => string;
  readonly openProposal: (id: string) => string;
  readonly viewProduct: (name: string) => string;
  readonly investigations: {
    readonly title: string;
    readonly started: (age: string) => string;
    readonly evidenceCount: (n: number) => string;
  };
  readonly proposals: {
    readonly title: string;
    readonly note: string;
    readonly drafted: (age: string) => string;
    readonly priority: string;
  };
  readonly sourceHealth: {
    readonly title: string;
    readonly open: string;
    readonly caption: string;
    readonly total: (n: number) => string;
    readonly current: (n: number) => string;
    readonly stale: (n: number) => string;
    readonly unavailable: (n: number) => string;
    readonly notSetUp: (n: number) => string;
    readonly unknown: (n: number) => string;
  };
  readonly activity: {
    readonly title: string;
    readonly note: string;
    readonly actor: Readonly<Record<'agent' | 'source' | 'human', string>>;
  };
}

const en: HomeCopy = {
  lede: {
    owner: 'Where your products need attention, what is known, what is not, and what a person still has to decide.',
    technical: 'Failing checks, open investigations and source freshness across all products. Each item links to its evidence.',
    nontechnical: 'A plain summary of what needs a look, what is still unknown, and what is waiting for a person to decide.',
  },
  signalsLabel: 'Signals across all products',
  signal: {
    products: 'Products',
    attention: 'Products needing attention',
    investigations: 'Open investigations',
    proposals: 'Proposals waiting',
    sources: 'Sources not current',
  },
  ofTotal: (t) => `of ${t}`,
  attention: {
    title: 'Needs attention',
    none: 'Nothing is flagged in the demo data. That is not the same as healthy: unread sources stay unknown.',
    project: 'Product',
  },
  openCase: (id) => `Open case {${id}}`,
  openProposal: (id) => `Open proposal {${id}}`,
  viewProduct: (name) => `View {${name}}`,
  investigations: {
    title: 'Open investigations',
    started: (age) => `Started ${age}`,
    evidenceCount: (n) => `${n} evidence items`,
  },
  proposals: {
    title: 'Proposals waiting for a person',
    note: 'Proposed only. A person decides in the linked record; Kawalys takes no action.',
    drafted: (age) => `Drafted ${age}`,
    priority: 'Priority',
  },
  sourceHealth: {
    title: 'Source health by product',
    open: 'Open source health',
    caption: 'Source connections per product, counted by state',
    total: (n) => `${n} sources`,
    current: (n) => `${n} current`,
    stale: (n) => `${n} stale`,
    unavailable: (n) => `${n} unavailable`,
    notSetUp: (n) => `${n} not set up`,
    unknown: (n) => `${n} never read`,
  },
  activity: {
    title: 'Recent activity',
    note: 'Agent entries are simulated demo events, not real agents.',
    actor: { agent: 'Simulated agent', source: 'Source event', human: 'Human action (synthetic record)' },
  },
};

const ar: HomeCopy = {
  lede: {
    owner: 'أين تحتاج منتجاتك إلى انتباه، وما المعروف وما غير المعروف، وما الذي ما زال بانتظار قرار شخص.',
    technical: 'فحوص فاشلة وتحقيقات مفتوحة وحداثة المصادر في كل المنتجات. كل عنصر يرتبط بأدلته.',
    nontechnical: 'ملخص مبسّط لما يحتاج إلى نظرة، وما لا يزال مجهولًا، وما ينتظر قرار شخص.',
  },
  signalsLabel: 'مؤشرات كل المنتجات',
  signal: {
    products: 'المنتجات',
    attention: 'منتجات تحتاج إلى انتباه',
    investigations: 'تحقيقات مفتوحة',
    proposals: 'مقترحات بالانتظار',
    sources: 'مصادر غير حديثة',
  },
  ofTotal: (t) => `من ${t}`,
  attention: {
    title: 'يحتاج إلى انتباه',
    none: 'لا شيء مُعلَّم في البيانات التجريبية. هذا لا يعني أن الحالة سليمة: المصادر غير المقروءة تبقى غير معروفة.',
    project: 'المنتج',
  },
  openCase: (id) => `فتح الحالة {${id}}`,
  openProposal: (id) => `فتح المقترح {${id}}`,
  viewProduct: (name) => `عرض {${name}}`,
  investigations: {
    title: 'تحقيقات مفتوحة',
    started: (age) => `بدأ ${age}`,
    evidenceCount: (n) => `${n} عناصر أدلة`,
  },
  proposals: {
    title: 'مقترحات بانتظار شخص',
    note: 'مقترحة فقط. يقرر شخص في السجل المرتبط، و{Kawalys} لا ينفذ شيئًا.',
    drafted: (age) => `صيغ ${age}`,
    priority: 'الأولوية',
  },
  sourceHealth: {
    title: 'صحة المصادر حسب المنتج',
    open: 'فتح صحة المصادر',
    caption: 'اتصالات المصادر لكل منتج، مرتبة حسب الحالة',
    total: (n) => `${n} مصادر`,
    current: (n) => `${n} حديثة`,
    stale: (n) => `${n} قديمة`,
    unavailable: (n) => `${n} غير متاحة`,
    notSetUp: (n) => `${n} غير مُعدّة`,
    unknown: (n) => `${n} لم تُقرأ قط`,
  },
  activity: {
    title: 'النشاط الأخير',
    note: 'إدخالات الوكلاء أحداث تجريبية محاكاة، وليست لوكلاء حقيقيين.',
    actor: { agent: 'وكيل محاكى', source: 'حدث من مصدر', human: 'إجراء بشري (سجل تجريبي)' },
  },
};

export const HOME_COPY: Readonly<Record<Lang, HomeCopy>> = { en, ar };

// Portfolio copy. {braces} isolate left-to-right tokens; Latin digits in both languages.
// No link or button label here may contain an action verb (see isForbiddenControlLabel).
import type { Lang, Persona } from '../../contract/types';
import type { Environment } from '../../contract/types';

export interface PortfolioCopy {
  readonly lede: Readonly<Record<Persona, string>>;
  readonly filter: { readonly label: string; readonly all: string };
  readonly productsTitle: string;
  readonly viewProduct: (name: string) => string;
  readonly openCase: (id: string) => string;
  readonly openProposal: (id: string) => string;
  readonly inspect: (id: string) => string;
  readonly status: Readonly<Record<'attention' | 'notSetUp' | 'noneFlagged', Readonly<Record<Persona, string>>>>;
  readonly notSetUpBody: string;
  readonly fields: {
    readonly sources: string;
    readonly attention: string;
    readonly investigations: string;
    readonly proposals: string;
    readonly components: string;
    readonly environments: string;
    readonly notRead: string;
  };
  readonly sourceWords: {
    readonly current: (n: number) => string;
    readonly stale: (n: number) => string;
    readonly unavailable: (n: number) => string;
    readonly notSetUp: (n: number) => string;
    readonly unknown: (n: number) => string;
  };
  readonly github: {
    readonly title: string;
    readonly lede: string;
    readonly demo: string;
    readonly incomplete: string;
    readonly status: Readonly<Record<'current' | 'stale' | 'notReadYet' | 'unknown' | 'unavailable', string>>;
    readonly failure: Readonly<Record<'timeout' | 'network' | 'denied' | 'not_visible' | 'rate_limited' | 'unavailable' | 'malformed' | 'other', string>>;
    readonly age: (minutes: number) => string;
    readonly pullRequests: string;
    readonly issues: string;
    readonly atLeast: (n: number) => string;
  };
  readonly env: Readonly<Record<Environment, string>>;
  readonly attentionList: {
    readonly title: string;
    readonly evidence: string;
    readonly empty: string;
    readonly notSetUp: string;
    readonly component: string;
  };
  readonly provenance: { readonly from: string; readonly noProvider: string };
}

const en: PortfolioCopy = {
  lede: {
    owner: 'Each product with its health, sources and open work. Health stays unknown until current evidence says otherwise.',
    technical: 'Per-product health triad, source states and an evidence-linked attention list with provider and age for every item.',
    nontechnical: 'Each product in plain words: what needs a look, what is not set up yet, and what we cannot tell.',
  },
  filter: { label: 'Product', all: 'All products' },
  productsTitle: 'Products',
  viewProduct: (name) => `View {${name}}`,
  openCase: (id) => `Open case {${id}}`,
  openProposal: (id) => `Open proposal {${id}}`,
  inspect: (id) => `Inspect evidence {${id}}`,
  status: {
    attention: {
      owner: 'Needs attention: open items below.',
      technical: 'Attention items open: see the evidence-linked list.',
      nontechnical: 'Needs a look. A team is checking.',
    },
    notSetUp: {
      owner: 'Not set up: no source reads this product yet.',
      technical: 'Not set up: no source configured, no components mapped.',
      nontechnical: 'Not set up yet. We cannot say how it is doing.',
    },
    noneFlagged: {
      owner: 'Nothing flagged. This is not a health claim.',
      technical: 'No attention items. Not a health claim.',
      nontechnical: 'Nothing flagged. That does not mean it is fine.',
    },
  },
  notSetUpBody: 'No source is set up, so nothing has been read. Health is unknown, not healthy, and counts below are not read, not zero.',
  fields: {
    sources: 'Sources',
    attention: 'Attention items',
    investigations: 'Open investigations',
    proposals: 'Proposals waiting',
    components: 'Components',
    environments: 'Environments',
    notRead: 'Not read',
  },
  sourceWords: {
    current: (n) => `${n} current`,
    stale: (n) => `${n} stale`,
    unavailable: (n) => `${n} unavailable`,
    notSetUp: (n) => `${n} not set up`,
    unknown: (n) => `${n} not read yet`,
  },
  github: {
    title: 'GitHub reads',
    lede: 'The latest read of each connected repository. These are read states, not a health claim.',
    demo: 'Demo data: synthetic reads, not live',
    incomplete: 'Part of this answer could not be read and is left out, so this list is incomplete.',
    status: { current: 'Current', stale: 'Stale', notReadYet: 'Not read yet', unknown: 'Unknown', unavailable: 'Unavailable' },
    failure: {
      timeout: 'The read timed out.',
      network: 'GitHub did not answer.',
      denied: 'Access was denied.',
      not_visible: 'Not visible to this connection.',
      rate_limited: 'GitHub limited the reads; try later.',
      unavailable: 'GitHub was unavailable.',
      malformed: 'The answer could not be read.',
      other: 'The read failed.',
    },
    age: (m) => `Read {${m}} min ago`,
    pullRequests: 'Open pull requests',
    issues: 'Open issues',
    atLeast: (n) => `At least {${n}}`,
  },
  env: { ci: '{CI}', lab: 'Lab', staging: 'Staging', production: 'Production', unknown: 'Unknown' },
  attentionList: {
    title: 'Attention, with its evidence',
    evidence: 'Evidence',
    empty: 'No attention items for this selection. That is not the same as healthy.',
    notSetUp: 'Nothing to list: this product is not set up, so nothing has been read. It is unknown, not clear.',
    component: 'Component',
  },
  provenance: { from: 'from', noProvider: 'no provider read' },
};

const ar: PortfolioCopy = {
  lede: {
    owner: 'كل منتج مع حالته ومصادره وعمله المفتوح. تبقى الحالة غير معروفة حتى يقول دليل حديث غير ذلك.',
    technical: 'ثلاثية الحالة لكل منتج، وحالات المصادر، وقائمة انتباه مرتبطة بالأدلة مع المزوّد والعمر لكل عنصر.',
    nontechnical: 'كل منتج بكلمات بسيطة: ما يحتاج إلى نظرة، وما لم يُعدّ بعد، وما لا نستطيع الجزم به.',
  },
  filter: { label: 'المنتج', all: 'كل المنتجات' },
  productsTitle: 'المنتجات',
  viewProduct: (name) => `عرض {${name}}`,
  openCase: (id) => `فتح الحالة {${id}}`,
  openProposal: (id) => `فتح المقترح {${id}}`,
  inspect: (id) => `فحص الدليل {${id}}`,
  status: {
    attention: {
      owner: 'يحتاج إلى انتباه: عناصر مفتوحة أدناه.',
      technical: 'عناصر انتباه مفتوحة: انظر القائمة المرتبطة بالأدلة.',
      nontechnical: 'يحتاج إلى نظرة. فريق يتابعه.',
    },
    notSetUp: {
      owner: 'غير مُعدّ: لا مصدر يقرأ هذا المنتج بعد.',
      technical: 'غير مُعدّ: لا مصدر مهيّأ ولا مكوّنات مربوطة.',
      nontechnical: 'لم يُعدّ بعد. لا نستطيع القول كيف حاله.',
    },
    noneFlagged: {
      owner: 'لا شيء مُعلَّم. هذا ليس ادعاءً بسلامة الحالة.',
      technical: 'لا عناصر انتباه. ليس ادعاءً بسلامة الحالة.',
      nontechnical: 'لا شيء مُعلَّم. هذا لا يعني أن كل شيء بخير.',
    },
  },
  notSetUpBody: 'لا مصدر مُعدّ، لذا لم يُقرأ شيء. الحالة غير معروفة وليست سليمة، والأعداد أدناه غير مقروءة وليست صفرًا.',
  fields: {
    sources: 'المصادر',
    attention: 'عناصر الانتباه',
    investigations: 'تحقيقات مفتوحة',
    proposals: 'مقترحات بالانتظار',
    components: 'المكوّنات',
    environments: 'البيئات',
    notRead: 'غير مقروء',
  },
  sourceWords: {
    current: (n) => `${n} حديثة`,
    stale: (n) => `${n} قديمة`,
    unavailable: (n) => `${n} غير متاحة`,
    notSetUp: (n) => `${n} غير مُعدّة`,
    unknown: (n) => `${n} لم تُقرأ بعد`,
  },
  github: {
    title: 'قراءات {GitHub}',
    lede: 'آخر قراءة لكل مستودع متصل. هذه حالات قراءة، وليست حكمًا على السلامة.',
    demo: 'بيانات تجريبية: قراءات مصطنعة، ليست مباشرة',
    incomplete: 'تعذّرت قراءة جزء من هذه الإجابة فاستُبعد، لذا القائمة غير مكتملة.',
    status: { current: 'حديثة', stale: 'قديمة', notReadYet: 'لم تُقرأ بعد', unknown: 'غير معروفة', unavailable: 'غير متاحة' },
    failure: {
      timeout: 'انتهت مهلة القراءة.',
      network: 'لم يردّ {GitHub}.',
      denied: 'رُفض الوصول.',
      not_visible: 'غير مرئي لهذا الاتصال.',
      rate_limited: 'حدّ {GitHub} من القراءات؛ حاول لاحقًا.',
      unavailable: 'كان {GitHub} غير متاح.',
      malformed: 'تعذّرت قراءة الإجابة.',
      other: 'فشلت القراءة.',
    },
    age: (m) => `قُرئت قبل {${m}} دقيقة`,
    pullRequests: 'طلبات الدمج المفتوحة',
    issues: 'المشكلات المفتوحة',
    atLeast: (n) => `{${n}} على الأقل`,
  },
  env: { ci: '{CI}', lab: 'مختبر', staging: 'تجهيز', production: 'إنتاج', unknown: 'غير معروفة' },
  attentionList: {
    title: 'الانتباه مع أدلته',
    evidence: 'الأدلة',
    empty: 'لا عناصر انتباه لهذا الاختيار. هذا لا يعني أن الحالة سليمة.',
    notSetUp: 'لا شيء للعرض: هذا المنتج غير مُعدّ ولم يُقرأ منه شيء. الحالة غير معروفة وليست سليمة.',
    component: 'المكوّن',
  },
  provenance: { from: 'من', noProvider: 'لا قراءة من مزوّد' },
};

export const PORTFOLIO_COPY: Readonly<Record<Lang, PortfolioCopy>> = { en, ar };

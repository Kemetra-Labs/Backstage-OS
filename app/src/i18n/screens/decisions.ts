// Decision Inbox and detail copy (BACK-13). {braces} isolate left-to-right tokens; Latin digits in both languages.
// Controls and links never use action verbs: only text may say that a human approves elsewhere.
import type { Lang } from '../../contract/types';

export interface DecisionsCopy {
  readonly lede: string;
  /** Persistent explanation: Kawalys displays proposals only. Text, never a control. */
  readonly notice: { readonly title: string; readonly body: string };
  readonly filterLabel: string;
  readonly filterAll: string;
  readonly pendingTitle: string;
  readonly pendingCount: (n: number) => string;
  readonly historicalTitle: string;
  readonly historicalNote: string;
  readonly historicalNone: string;
  readonly priority: string;
  readonly project: string;
  readonly age: string;
  readonly evidenceSummary: (read: number, notRead: number, worst: string) => string;
  readonly unknownsLine: (n: number) => string;
  readonly openProposal: (id: string) => string;
  readonly openRecord: (id: string) => string;
  // Detail
  readonly detailTitle: string;
  readonly contextTitle: string;
  readonly observedTitle: string;
  readonly observedNote: string;
  readonly hypothesesTitle: string;
  readonly hypothesesNone: string;
  readonly unknownsTitle: string;
  readonly unknownsNone: string;
  readonly optionsTitle: string;
  readonly optionsNote: string;
  readonly optionsNone: string;
  readonly benefit: string;
  readonly risk: string;
  readonly optionUnknowns: string;
  readonly optionEvidence: string;
  readonly noneRecorded: string;
  readonly suggestedOption: string;
  readonly suggestedOptionPlain: string;
  readonly nextTitle: string;
  readonly nextTitlePlain: string;
  readonly decidedIn: (id: string) => string;
  readonly historicalBadge: string;
  readonly linksTitle: string;
  readonly inspectEvidence: (id: string) => string;
  readonly openCase: (id: string) => string;
  readonly viewProject: (name: string) => string;
  readonly future: {
    readonly title: string;
    readonly lead: string;
    readonly needs: readonly string[];
    readonly closing: string;
  };
  readonly error: { readonly title: string; readonly body: string; readonly open: string };
}

const en: DecisionsCopy = {
  lede: 'Proposals waiting for a human. Each shows what was read, what was not, and what is still unknown.',
  notice: {
    title: 'Display only',
    body: 'Kawalys does not record, approve or execute decisions in this version. A human decides in the named external record, such as a work item. Nothing on this page is a control.',
  },
  filterLabel: 'Project',
  filterAll: 'All',
  pendingTitle: 'Pending proposals',
  pendingCount: (n) => (n === 1 ? '1 proposal' : `${n} proposals`),
  historicalTitle: 'Historical record (synthetic)',
  historicalNote: 'A past decision recorded in another system, shown only to illustrate how a source-linked record looks.',
  historicalNone: 'No historical record for this project in the demo data.',
  priority: 'Priority',
  project: 'Project',
  age: 'Opened',
  evidenceSummary: (read, notRead, worst) =>
    `Evidence: ${read} read, ${notRead} not read. Worst freshness: ${worst}.`,
  unknownsLine: (n) => (n === 0 ? 'Unknowns: none recorded' : `Unknowns: ${n}`),
  openProposal: (id) => `Open proposal {${id}}`,
  openRecord: (id) => `Open record {${id}}`,
  detailTitle: 'Decision detail',
  contextTitle: 'Context',
  observedTitle: 'Observed facts',
  observedNote: 'Evidence behind this proposal. Items not read stay listed.',
  hypothesesTitle: 'Hypotheses',
  hypothesesNone: 'No hypothesis recorded.',
  unknownsTitle: 'Unknowns',
  unknownsNone: 'No unknown recorded.',
  optionsTitle: 'Options',
  optionsNote: 'Alternatives for a human to weigh. None can be chosen here.',
  optionsNone: 'No options recorded: this is a historical record.',
  benefit: 'Benefit',
  risk: 'Risk',
  optionUnknowns: 'Unknowns',
  optionEvidence: 'Evidence',
  noneRecorded: 'none recorded',
  suggestedOption: 'Suggested option',
  suggestedOptionPlain: 'Option put forward',
  nextTitle: 'Proposed next step',
  nextTitlePlain: 'Suggested step',
  decidedIn: (id) => `Decided in {${id}} (demo link, not followed). A human records the decision there.`,
  historicalBadge: 'Historical record (synthetic)',
  linksTitle: 'Related',
  inspectEvidence: (id) => `Inspect evidence {${id}}`,
  openCase: (id) => `Open case {${id}}`,
  viewProject: (name) => `View {${name}}`,
  future: {
    title: 'Future approval interface (not built)',
    lead: 'A real approval flow would need all of the following. None of it exists in this review build.',
    needs: [
      'An authenticated approver identity.',
      'Server-side authorisation per project.',
      'An audit record in the source system.',
      'An explicit separation of proposal and decision.',
    ],
    closing: 'Nothing on this page is a control. It only displays what is proposed.',
  },
  error: {
    title: 'Decision not found',
    body: 'This id is not part of the demo data.',
    open: 'Open the Decision Inbox',
  },
};

const ar: DecisionsCopy = {
  lede: 'مقترحات بانتظار قرار بشري. يعرض كل مقترح ما قُرئ وما لم يُقرأ وما لا يزال مجهولًا.',
  notice: {
    title: 'عرض فقط',
    body: 'لا يسجّل {Kawalys} القرارات ولا يعتمدها ولا ينفذها في هذا الإصدار. يقرر إنسان في السجل الخارجي المذكور، مثل عنصر عمل. لا شيء في هذه الصفحة أداة تحكم.',
  },
  filterLabel: 'المشروع',
  filterAll: 'الكل',
  pendingTitle: 'مقترحات معلّقة',
  pendingCount: (n) => `${n} مقترح`,
  historicalTitle: 'سجل تاريخي (تجريبي)',
  historicalNote: 'قرار سابق مسجل في نظام آخر، يُعرض فقط لتوضيح شكل السجل المرتبط بمصدر.',
  historicalNone: 'لا سجل تاريخي لهذا المشروع في البيانات التجريبية.',
  priority: 'الأولوية',
  project: 'المشروع',
  age: 'فُتح',
  evidenceSummary: (read, notRead, worst) =>
    `الأدلة: ${read} مقروء، ${notRead} غير مقروء. أسوأ حداثة: ${worst}.`,
  unknownsLine: (n) => (n === 0 ? 'المجهولات: لا شيء مسجل' : `المجهولات: ${n}`),
  openProposal: (id) => `فتح المقترح {${id}}`,
  openRecord: (id) => `فتح السجل {${id}}`,
  detailTitle: 'تفاصيل القرار',
  contextTitle: 'السياق',
  observedTitle: 'وقائع مرصودة',
  observedNote: 'الأدلة وراء هذا المقترح. العناصر غير المقروءة تبقى مذكورة.',
  hypothesesTitle: 'فرضيات',
  hypothesesNone: 'لا فرضية مسجلة.',
  unknownsTitle: 'مجهولات',
  unknownsNone: 'لا مجهول مسجل.',
  optionsTitle: 'الخيارات',
  optionsNote: 'بدائل ليوازن بينها إنسان. لا يمكن اختيار أي منها هنا.',
  optionsNone: 'لا خيارات مسجلة: هذا سجل تاريخي.',
  benefit: 'الفائدة',
  risk: 'المخاطرة',
  optionUnknowns: 'مجهولات',
  optionEvidence: 'الأدلة',
  noneRecorded: 'لا شيء مسجل',
  suggestedOption: 'خيار مقترح',
  suggestedOptionPlain: 'خيار مطروح',
  nextTitle: 'الخطوة التالية المقترحة',
  nextTitlePlain: 'خطوة مقترحة',
  decidedIn: (id) => `يُقرَّر في {${id}} (رابط تجريبي، لا يُتبع). يسجّل إنسان القرار هناك.`,
  historicalBadge: 'سجل تاريخي (تجريبي)',
  linksTitle: 'ذو صلة',
  inspectEvidence: (id) => `فحص الدليل {${id}}`,
  openCase: (id) => `فتح الحالة {${id}}`,
  viewProject: (name) => `عرض {${name}}`,
  future: {
    title: 'واجهة الاعتماد المستقبلية (غير مبنية)',
    lead: 'يحتاج مسار اعتماد حقيقي إلى كل ما يلي. لا شيء منه موجود في نسخة المراجعة هذه.',
    needs: [
      'هوية معتمِد موثّقة بالمصادقة.',
      'تفويض على مستوى الخادم لكل مشروع.',
      'سجل تدقيق في النظام المصدر.',
      'فصل صريح بين المقترح والقرار.',
    ],
    closing: 'لا شيء في هذه الصفحة أداة تحكم. هي تعرض المقترح فقط.',
  },
  error: {
    title: 'القرار غير موجود',
    body: 'هذا المعرّف ليس جزءًا من البيانات التجريبية.',
    open: 'فتح صندوق القرارات',
  },
};

export const DECISIONS_COPY: Readonly<Record<Lang, DecisionsCopy>> = { en, ar };

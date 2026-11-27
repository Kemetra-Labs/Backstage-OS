// COG-07 shadow view copy (BACK-110). {braces} isolate left-to-right tokens; Latin digits in both languages.
// The view is read-only: no control here has an action label.
import type { Lang } from '../../contract/types';
import type { HitStatus, ReasoningKind, SearchOutcome, TaskState } from '../../view/shadowView';

export interface ShadowCopy {
  readonly title: string;
  readonly lede: string;
  readonly marker: string;
  readonly versions: (memory: string, retrieval: string, reasoning: string) => string;
  readonly search: {
    readonly title: string;
    readonly caption: string;
    readonly query: string;
    readonly outcome: string;
    readonly result: string;
    readonly status: string;
    readonly matchedBy: string;
    readonly none: string;
  };
  readonly outcomes: Readonly<Record<SearchOutcome, string>>;
  readonly statuses: Readonly<Record<HitStatus, string>>;
  readonly reasoning: {
    readonly title: string;
    readonly caption: string;
    readonly task: string;
    readonly item: string;
    readonly state: string;
    readonly reasons: string;
    readonly notVisible: string;
    readonly approvalNote: string;
  };
  readonly kinds: Readonly<Record<ReasoningKind, string>>;
  readonly states: Readonly<Record<TaskState, string>>;
  readonly invalid: { readonly title: string; readonly body: string };
}

const en: ShadowCopy = {
  title: 'Cognitive core (shadow)',
  lede: 'What the search and reasoning engine returns for a synthetic set of items. It is shown for review only and changes nothing.',
  marker: 'Shadow output: synthetic, not live telemetry. Read from a committed file; nothing is requested.',
  versions: (memory, retrieval, reasoning) => `Policies: {${memory}}, {${retrieval}}, {${reasoning}}`,
  search: {
    title: 'Search',
    caption: 'Search results for sample queries',
    query: 'Query',
    outcome: 'Outcome',
    result: 'Result',
    status: 'Evidence',
    matchedBy: 'Matched by',
    none: 'Nothing matched.',
  },
  outcomes: { match: 'One match', ambiguous: 'Several matches', 'no-match': 'No match', 'invalid-query': 'Query refused' },
  statuses: {
    verified: 'Verified',
    stale: 'Stale',
    unknown: 'Unknown',
    conflict: 'Conflicting',
    'insufficient-history': 'Not enough history',
    'no-value': 'No value',
  },
  reasoning: {
    title: 'Next task',
    caption: 'Task readiness for a sample plan',
    task: 'Task',
    item: 'Item',
    state: 'State',
    reasons: 'Why',
    notVisible: 'Not visible',
    approvalNote: 'An approval is never treated as given here, so a task that needs one is never ready.',
  },
  kinds: {
    recommended: 'A task is recommended.',
    'no-ready-task': 'No task is ready.',
    'insufficient-evidence': 'Not enough verified evidence to recommend a task.',
    'invalid-input': 'The plan was refused as invalid.',
  },
  states: { done: 'Done', ready: 'Ready', blocked: 'Blocked', unknown: 'Unknown' },
  invalid: {
    title: 'Shadow output unavailable',
    body: 'The shadow output could not be read or was not confirmed by the independent check, so nothing is shown.',
  },
};

const ar: ShadowCopy = {
  title: 'النواة المعرفية (عرض ظلّي)',
  lede: 'ما يعيده محرك البحث والاستدلال لمجموعة اصطناعية من العناصر. يُعرض للمراجعة فقط ولا يغيّر شيئًا.',
  marker: 'مخرجات ظلّية: اصطناعية، وليست قياسًا حيًا. تُقرأ من ملف محفوظ في المستودع، ولا يُرسل أي طلب.',
  versions: (memory, retrieval, reasoning) => `السياسات: {${memory}}، {${retrieval}}، {${reasoning}}`,
  search: {
    title: 'البحث',
    caption: 'نتائج البحث لاستعلامات نموذجية',
    query: 'الاستعلام',
    outcome: 'النتيجة',
    result: 'العنصر',
    status: 'الدليل',
    matchedBy: 'طريقة المطابقة',
    none: 'لم يطابق أي عنصر.',
  },
  outcomes: { match: 'تطابق واحد', ambiguous: 'عدة تطابقات', 'no-match': 'لا تطابق', 'invalid-query': 'استعلام مرفوض' },
  statuses: {
    verified: 'متحقق منه',
    stale: 'قديم',
    unknown: 'غير معروف',
    conflict: 'متعارض',
    'insufficient-history': 'سجل غير كافٍ',
    'no-value': 'بلا قيمة',
  },
  reasoning: {
    title: 'المهمة التالية',
    caption: 'جاهزية المهام لخطة نموذجية',
    task: 'المهمة',
    item: 'العنصر',
    state: 'الحالة',
    reasons: 'السبب',
    notVisible: 'غير مرئي',
    approvalNote: 'لا تُعدّ أي موافقة ممنوحة هنا، لذا لا تكون المهمة التي تحتاج موافقة جاهزة أبدًا.',
  },
  kinds: {
    recommended: 'هناك مهمة موصى بها.',
    'no-ready-task': 'لا توجد مهمة جاهزة.',
    'insufficient-evidence': 'لا توجد أدلة متحقق منها كافية للتوصية بمهمة.',
    'invalid-input': 'رُفضت الخطة لأنها غير صالحة.',
  },
  states: { done: 'منجزة', ready: 'جاهزة', blocked: 'متوقفة', unknown: 'غير معروفة' },
  invalid: {
    title: 'المخرجات الظلّية غير متاحة',
    body: 'تعذرت قراءة المخرجات الظلّية أو لم يؤكدها الفحص المستقل، لذا لا يُعرض شيء.',
  },
};

export const SHADOW_COPY: Readonly<Record<Lang, ShadowCopy>> = { en, ar };

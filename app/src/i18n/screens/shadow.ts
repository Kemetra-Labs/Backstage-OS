// COG-07 shadow view copy (BACK-110). {braces} isolate left-to-right tokens; Latin digits in both languages.
// The view is read-only: no control here has an action label. Each string is one [English, Arabic] pair, so the
// two languages cannot drift apart in shape; SHADOW_COPY picks one side per language.
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

type Pair = readonly [en: string, ar: string];
type Pairs<T> = { readonly [K in keyof T]: T[K] extends string ? Pair : Pairs<T[K]> };

const PAIRS: Pairs<Omit<ShadowCopy, 'versions'>> = {
  title: ['Cognitive core (shadow)', 'النواة المعرفية (عرض ظلّي)'],
  lede: [
    'What the search and reasoning engine returns for a synthetic set of items. It is shown for review only and changes nothing.',
    'ما يعيده محرك البحث والاستدلال لمجموعة اصطناعية من العناصر. يُعرض للمراجعة فقط ولا يغيّر شيئًا.',
  ],
  marker: [
    'Shadow output: synthetic, not live telemetry. Read from a committed file; nothing is requested.',
    'مخرجات ظلّية: اصطناعية، وليست قياسًا حيًا. تُقرأ من ملف محفوظ في المستودع، ولا يُرسل أي طلب.',
  ],
  search: {
    title: ['Search', 'البحث'],
    caption: ['Search results for sample queries', 'نتائج البحث لاستعلامات نموذجية'],
    query: ['Query', 'الاستعلام'],
    outcome: ['Outcome', 'النتيجة'],
    result: ['Result', 'العنصر'],
    status: ['Evidence', 'الدليل'],
    matchedBy: ['Matched by', 'طريقة المطابقة'],
    none: ['Nothing matched.', 'لم يطابق أي عنصر.'],
  },
  outcomes: {
    match: ['One match', 'تطابق واحد'],
    ambiguous: ['Several matches', 'عدة تطابقات'],
    'no-match': ['No match', 'لا تطابق'],
    'invalid-query': ['Query refused', 'استعلام مرفوض'],
  },
  statuses: {
    verified: ['Verified', 'متحقق منه'],
    stale: ['Stale', 'قديم'],
    unknown: ['Unknown', 'غير معروف'],
    conflict: ['Conflicting', 'متعارض'],
    'insufficient-history': ['Not enough history', 'سجل غير كافٍ'],
    'no-value': ['No value', 'بلا قيمة'],
  },
  reasoning: {
    title: ['Next task', 'المهمة التالية'],
    caption: ['Task readiness for a sample plan', 'جاهزية المهام لخطة نموذجية'],
    task: ['Task', 'المهمة'],
    item: ['Item', 'العنصر'],
    state: ['State', 'الحالة'],
    reasons: ['Why', 'السبب'],
    notVisible: ['Not visible', 'غير مرئي'],
    approvalNote: [
      'An approval is never treated as given here, so a task that needs one is never ready.',
      'لا تُعدّ أي موافقة ممنوحة هنا، لذا لا تكون المهمة التي تحتاج موافقة جاهزة أبدًا.',
    ],
  },
  kinds: {
    recommended: ['A task is recommended.', 'هناك مهمة موصى بها.'],
    'no-ready-task': ['No task is ready.', 'لا توجد مهمة جاهزة.'],
    'insufficient-evidence': ['Not enough verified evidence to recommend a task.', 'لا توجد أدلة متحقق منها كافية للتوصية بمهمة.'],
    'invalid-input': ['The plan was refused as invalid.', 'رُفضت الخطة لأنها غير صالحة.'],
  },
  states: {
    done: ['Done', 'منجزة'],
    ready: ['Ready', 'جاهزة'],
    blocked: ['Blocked', 'متوقفة'],
    unknown: ['Unknown', 'غير معروفة'],
  },
  invalid: {
    title: ['Shadow output unavailable', 'المخرجات الظلّية غير متاحة'],
    body: [
      'The shadow output could not be read or was not confirmed by the independent check, so nothing is shown.',
      'تعذرت قراءة المخرجات الظلّية أو لم يؤكدها الفحص المستقل، لذا لا يُعرض شيء.',
    ],
  },
};

/** One side of a pair tree: index 0 is English, 1 is Arabic. */
function side<T>(node: Pairs<T>, i: 0 | 1): T {
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, Array.isArray(v) ? (v as unknown as Pair)[i] : side(v as Pairs<unknown>, i)]),
  ) as T;
}

const VERSIONS: Readonly<Record<Lang, ShadowCopy['versions']>> = {
  en: (m, r, q) => `Policies: {${m}}, {${r}}, {${q}}`,
  ar: (m, r, q) => `السياسات: {${m}}، {${r}}، {${q}}`,
};

/** One language, with `versions` kept in its place in the interface order. */
const copyIn = (i: 0 | 1, lang: Lang): ShadowCopy => {
  const { title, lede, marker, ...rest } = side(PAIRS, i);
  return { title, lede, marker, versions: VERSIONS[lang], ...rest };
};

export const SHADOW_COPY: Readonly<Record<Lang, ShadowCopy>> = { en: copyIn(0, 'en'), ar: copyIn(1, 'ar') };

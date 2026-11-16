// Agent activity copy (demo only). {braces} mark left-to-right tokens; Latin digits in both languages.
import type { Lang } from '../../contract/types';
import type { AgentState } from '../../contract/world';

export interface AgentsCopy {
  readonly lede: string;
  readonly oversight: { readonly title: string; readonly intro: string; readonly points: readonly string[] };
  readonly roster: {
    readonly title: string;
    readonly summary: (counts: Readonly<Record<AgentState, number>>) => string;
    readonly state: Readonly<Record<AgentState, string>>;
    readonly stateNote: Readonly<Record<AgentState, string>>;
    readonly purpose: string;
    readonly projects: string;
    readonly capabilities: string;
    readonly lastActivity: string;
    readonly none: string;
    readonly never: string;
    readonly capStatus: Readonly<Record<'simulated' | 'not_available', string>>;
  };
  readonly history: {
    readonly title: string;
    readonly intro: string;
    readonly filterLabel: string;
    readonly filterAll: string;
    readonly by: (agent: string) => string;
    readonly human: string;
    readonly openCase: (id: string) => string;
    readonly inspectEvidence: (id: string) => string;
    readonly empty: { readonly title: string; readonly body: string };
    readonly listLabel: string;
  };
}

const en: AgentsCopy = {
  lede: 'A simulated view of what Kawalys agents would do. Nothing on this page is live.',
  oversight: {
    title: 'Human oversight',
    intro: 'Every agent shown here is simulated. People decide, in the source system.',
    points: [
      'Nothing executes: no agent calls a model, runs in the background, or writes to code, CI, tickets or cloud.',
      'Every agent output is at most Proposed. A human decides in the source system.',
      'The remediation agent is not part of this version.',
      'The activity below is a fixed synthetic record, not a log of anything that happened.',
    ],
  },
  roster: {
    title: 'Agent roster (simulated)',
    summary: (c) => `${c.watching} watching (simulated), ${c.idle} idle, ${c.paused} paused by a human, ${c.not_enabled} not enabled`,
    state: { watching: 'Watching (simulated)', idle: 'Idle', paused: 'Paused by a human', not_enabled: 'Not enabled' },
    stateNote: {
      watching: 'Simulated only: nothing is being watched.',
      idle: 'No simulated work waiting.',
      paused: 'A person paused it. It does not resume itself.',
      not_enabled: 'Does not exist in this version.',
    },
    purpose: 'Purpose',
    projects: 'Projects covered',
    capabilities: 'Capabilities',
    lastActivity: 'Last activity',
    none: 'none',
    never: 'never',
    capStatus: { simulated: 'simulated', not_available: 'not available' },
  },
  history: {
    title: 'Simulated activity',
    intro: 'Newest first. Each entry carries its truth label, and none is Approved.',
    filterLabel: 'Project',
    filterAll: 'All projects',
    by: (a) => `Agent {${a}}`,
    human: 'A person (synthetic record)',
    openCase: (id) => `Open case {${id}}`,
    inspectEvidence: (id) => `Inspect evidence {${id}}`,
    empty: { title: 'No simulated activity', body: 'No agent events exist for this project in the demo data.' },
    listLabel: 'Simulated activity timeline',
  },
};

const ar: AgentsCopy = {
  lede: 'عرض محاكى لما كان وكلاء {Kawalys} سيفعلونه. لا شيء في هذه الصفحة مباشر.',
  oversight: {
    title: 'الإشراف البشري',
    intro: 'كل وكيل هنا محاكى. القرار للناس، في نظام المصدر.',
    points: [
      'لا شيء يُنفَّذ: لا وكيل يستدعي نموذجًا أو يعمل في الخلفية أو يكتب على الكود أو التكامل المستمر أو التذاكر أو السحابة.',
      'أقصى ما يصدر عن أي وكيل هو «مقترح»، ويقرر إنسان في نظام المصدر.',
      'وكيل المعالجة ليس جزءًا من هذا الإصدار.',
      'النشاط أدناه سجل اصطناعي ثابت، وليس سجلًا لشيء حدث فعلًا.',
    ],
  },
  roster: {
    title: 'قائمة الوكلاء (محاكاة)',
    summary: (c) => `${c.watching} يراقب (محاكاة)، ${c.idle} خامل، ${c.paused} موقوف بقرار بشري، ${c.not_enabled} غير مفعّل`,
    state: { watching: 'يراقب (محاكاة)', idle: 'خامل', paused: 'موقوف بقرار بشري', not_enabled: 'غير مفعّل' },
    stateNote: {
      watching: 'محاكاة فقط: لا شيء يُراقَب فعلًا.',
      idle: 'لا عمل محاكى بانتظاره.',
      paused: 'أوقفه شخص. لا يستأنف من تلقاء نفسه.',
      not_enabled: 'غير موجود في هذا الإصدار.',
    },
    purpose: 'الغرض',
    projects: 'المشاريع المشمولة',
    capabilities: 'القدرات',
    lastActivity: 'آخر نشاط',
    none: 'لا شيء',
    never: 'لم يحدث قط',
    capStatus: { simulated: 'محاكاة', not_available: 'غير متاحة' },
  },
  history: {
    title: 'النشاط المحاكى',
    intro: 'الأحدث أولًا. كل إدخال يحمل وسم الحقيقة الخاص به، ولا شيء منها «معتمد».',
    filterLabel: 'المشروع',
    filterAll: 'كل المشاريع',
    by: (a) => `الوكيل {${a}}`,
    human: 'شخص (سجل اصطناعي)',
    openCase: (id) => `فتح الحالة {${id}}`,
    inspectEvidence: (id) => `فحص الدليل {${id}}`,
    empty: { title: 'لا نشاط محاكى', body: 'لا توجد أحداث وكلاء لهذا المشروع في البيانات التجريبية.' },
    listLabel: 'الجدول الزمني للنشاط المحاكى',
  },
};

export const AGENTS_COPY: Readonly<Record<Lang, AgentsCopy>> = { en, ar };

// Investigation Room additions and the INV-DEMO-9 summary room (BACK-11). {braces} isolate left-to-right tokens.
// No link or button label here may contain an action verb (see isForbiddenControlLabel).
import type { Lang, Persona } from '../../contract/types';

type ByPersona = Readonly<Record<Persona, string>>;

export interface InvestigationCopy {
  readonly openExplorer: string;
  readonly inspect: (id: string) => string;
  readonly timeline: {
    readonly title: string;
    readonly note: string;
    readonly untimedTitle: string;
    readonly untimedNote: string;
  };
  readonly missing: { readonly title: string; readonly note: string; readonly none: string };
  readonly decision: {
    readonly title: string;
    readonly note: string;
    readonly decidedIn: (id: string) => string;
    readonly open: (id: string) => string;
    readonly none: string;
  };
  readonly context: {
    readonly title: string;
    readonly viewProject: (name: string) => string;
    readonly viewComponent: (name: string) => string;
  };
  readonly summary: {
    readonly fullRoomNote: string;
    readonly openFullRoom: (id: string) => string;
    readonly conflict: {
      readonly title: string;
      readonly passing: string;
      readonly opposing: string;
      readonly explain: string;
      readonly healthOf: (name: string) => string;
      readonly healthOfService: string;
    };
    readonly evidenceTitle: string;
    readonly hypothesis: { readonly title: string; readonly text: ByPersona; readonly note: string };
    readonly impact: { readonly title: string; readonly label: string; readonly text: ByPersona };
  };
  readonly notFound: { readonly title: string; readonly body: string };
  /**
   * BACK-57 (owner decision 2026-11-26): records shaped like the server's answer, from committed synthetic files. Read states
   * only, never health; always demo data. The empty state reuses the BACK-62 evidence copy (COPY.noEvidence).
   */
  readonly serverRecords: {
    readonly title: string;
    readonly lede: string;
    /** Live mode (BACK-51 P1): the same panel read from the server, so no demo or committed-file wording. */
    readonly liveTitle: string;
    readonly liveLede: string;
    readonly demo: string;
    readonly recordsTitle: string;
    readonly decisionsTitle: string;
    readonly read: Readonly<Record<'current' | 'stale' | 'unknown' | 'notRead', string>>;
    readonly reason: Readonly<Record<'error' | 'denied' | 'unknown' | 'noSource', string>>;
    readonly age: (minutes: number) => string;
    readonly recordedAge: (minutes: number) => string;
    readonly source: string;
    readonly creator: Readonly<Record<'recorded' | 'notRecorded', string>>;
    readonly proposedNote: string;
    readonly decisionText: string;
    readonly noRecords: string;
    readonly noDecisions: string;
    readonly incomplete: string;
    readonly unreadable: { readonly title: string; readonly body: string };
  };
}

const en: InvestigationCopy = {
  openExplorer: 'Open in Evidence Explorer',
  inspect: (id) => `Inspect evidence {${id}}`,
  timeline: {
    title: 'Evidence timeline',
    note: 'Ordered by when each item was observed, newest first. Ages are relative to the demo snapshot.',
    untimedTitle: 'Not on the timeline',
    untimedNote: 'These items have no observation time to place: they were not read, or the detail is restricted.',
  },
  missing: {
    title: 'Missing evidence',
    note: 'These sources could not be read. Missing is not the same as fine.',
    none: 'Nothing is listed as missing for this case.',
  },
  decision: {
    title: 'Proposed decision',
    note: 'Kawalys only shows the proposal. A person decides in the linked record.',
    decidedIn: (id) => `Decided in {${id}}`,
    open: (id) => `Open proposal {${id}}`,
    none: 'No decision is proposed for this case yet.',
  },
  context: {
    title: 'Where this sits',
    viewProject: (name) => `View {${name}}`,
    viewComponent: (name) => `View component {${name}}`,
  },
  summary: {
    fullRoomNote:
      'In this demo the full Investigation Room, with the affected-path map and evidence drawer, is built only for {INV-DEMO-7}. This case shows a summary from the same synthetic data.',
    openFullRoom: (id) => `Open case {${id}}`,
    conflict: {
      title: 'Conflicting signals',
      passing: 'Checks observed passing',
      opposing: 'Errors observed rising',
      explain:
        'Both signals were read directly. Neither cancels the other: a passing check is not runtime health, and rising errors do not prove the checks wrong. Health is shown as degraded, never healthy, until the difference is explained.',
      healthOf: (name) => `Health of {${name}}`,
      healthOfService: 'Health of the affected service',
    },
    evidenceTitle: 'Evidence',
    hypothesis: {
      title: 'Hypothesis',
      text: {
        owner: 'Staging errors rose. The cause is not established yet.',
        technical: 'Deploy {DEMO-311} may have introduced the errors. The only link is timing, by the rule on {E-23}. Not confirmed.',
        nontechnical: 'Staging errors rose. The cause is not established yet.',
      },
      note: 'A hypothesis, not an observation. No calibrated score.',
    },
    impact: {
      title: 'Impact',
      label: 'Customer impact',
      text: {
        owner: 'Unknown, not evidenced. There is no production source, so no customer effect is shown or ruled out.',
        technical: 'Unknown, not evidenced. No production source is read, so no customer effect is shown or ruled out.',
        nontechnical: 'Unknown, not evidenced. Nothing shows that customers are affected, and nothing rules it out.',
      },
    },
  },
  notFound: { title: 'Case not found', body: 'No investigation with this id exists in the demo data.' },
  serverRecords: {
    title: 'Server-shaped demo records',
    lede: 'Records of a separate synthetic case, shaped like the Kawalys server\'s answer and read from a committed file. Nothing is requested. These are read states, not a health claim.',
    liveTitle: 'Server records',
    liveLede: 'The records and decisions of one investigation, read from the {Kawalys} server. These are read states, not a health claim.',
    demo: 'Demo data: synthetic records, not live',
    recordsTitle: 'Evidence records',
    decisionsTitle: 'Decisions',
    read: { current: 'Current', stale: 'Stale', unknown: 'Read, time unknown', notRead: 'Not read' },
    reason: {
      error: 'The source read failed.',
      denied: 'Access was denied.',
      unknown: 'The read state is unknown.',
      noSource: 'No source read is linked to this record.',
    },
    age: (m) => `Observed {${m}} min ago`,
    recordedAge: (m) => `Recorded {${m}} min ago`,
    source: 'Source',
    creator: { recorded: 'Creator recorded', notRecorded: 'Creator not recorded' },
    proposedNote: 'Not approved: there is no link to the record that owns this decision.',
    decisionText: 'Decision',
    noRecords: 'No evidence record is listed. That is not the same as nothing being wrong.',
    noDecisions: 'No decision is recorded for this case.',
    incomplete: 'Part of this answer could not be read and is left out, so this list is incomplete.',
    unreadable: {
      title: 'These records could not be read',
      body: 'The answer was not in a form we can read, so nothing is shown. It is unknown, not healthy.',
    },
  },
};

const ar: InvestigationCopy = {
  openExplorer: 'فتح في مستكشف الأدلة',
  inspect: (id) => `استعراض الدليل {${id}}`,
  timeline: {
    title: 'الخط الزمني للأدلة',
    note: 'مرتبة حسب وقت رصد كل عنصر، الأحدث أولًا. الأعمار نسبية إلى لقطة العرض التجريبي.',
    untimedTitle: 'خارج الخط الزمني',
    untimedNote: 'لا يوجد وقت رصد لهذه العناصر: لم تُقرأ، أو أن تفاصيلها مقيّدة.',
  },
  missing: {
    title: 'أدلة مفقودة',
    note: 'تعذّرت قراءة هذه المصادر. المفقود لا يعني السلامة.',
    none: 'لا شيء مدرج كمفقود في هذه الحالة.',
  },
  decision: {
    title: 'قرار مقترح',
    note: 'يعرض النظام الاقتراح فقط. يقرر شخص في السجل المرتبط.',
    decidedIn: (id) => `القرار في {${id}}`,
    open: (id) => `فتح الاقتراح {${id}}`,
    none: 'لا قرار مقترح لهذه الحالة بعد.',
  },
  context: {
    title: 'موقع الحالة',
    viewProject: (name) => `عرض {${name}}`,
    viewComponent: (name) => `عرض المكوّن {${name}}`,
  },
  summary: {
    fullRoomNote:
      'في هذا العرض التجريبي، غرفة التحقيق الكاملة بخريطة المسار المتأثر ودرج الأدلة مبنية للحالة {INV-DEMO-7} فقط. تعرض هذه الحالة ملخصًا من البيانات الاصطناعية نفسها.',
    openFullRoom: (id) => `فتح الحالة {${id}}`,
    conflict: {
      title: 'إشارات متعارضة',
      passing: 'فحوص مرصودة ناجحة',
      opposing: 'أخطاء مرصودة في ازدياد',
      explain:
        'قُرئت الإشارتان مباشرة. لا تلغي إحداهما الأخرى: الفحص الناجح ليس صحة تشغيل، وازدياد الأخطاء لا يثبت خطأ الفحوص. تظهر الحالة متدهورة، وليست سليمة أبدًا، حتى يُفسَّر الفرق.',
      healthOf: (name) => `حالة {${name}}`,
      healthOfService: 'حالة الخدمة المتأثرة',
    },
    evidenceTitle: 'الأدلة',
    hypothesis: {
      title: 'فرضية',
      text: {
        owner: 'ارتفعت الأخطاء في بيئة التجهيز. لم يُحدَّد السبب بعد.',
        technical: 'ربما سببت عملية النشر {DEMO-311} هذه الأخطاء. الصلة الوحيدة هي التوقيت، بقاعدة الدليل {E-23}. غير مؤكد.',
        nontechnical: 'ارتفعت الأخطاء في بيئة التجهيز. لم يُحدَّد السبب بعد.',
      },
      note: 'فرضية وليست رصدًا. دون درجة معايرة.',
    },
    impact: {
      title: 'الأثر',
      label: 'أثر العملاء',
      text: {
        owner: 'مجهول، لا دليل عليه. لا يوجد مصدر للإنتاج، فلا يظهر أثر على العملاء ولا يُستبعد.',
        technical: 'مجهول، لا دليل عليه. لا يُقرأ مصدر للإنتاج، فلا يظهر أثر على العملاء ولا يُستبعد.',
        nontechnical: 'مجهول، لا دليل عليه. لا شيء يدل على تأثر العملاء، ولا شيء ينفي ذلك.',
      },
    },
  },
  notFound: { title: 'الحالة غير موجودة', body: 'لا يوجد تحقيق بهذا المعرّف في البيانات التجريبية.' },
  serverRecords: {
    title: 'سجلات تجريبية بصيغة الخادم',
    lede: 'سجلات حالة اصطناعية منفصلة، بصيغة إجابة خادم {Kawalys}، مقروءة من ملف محفوظ. لا يُرسل أي طلب. هذه حالات قراءة، وليست حكمًا على السلامة.',
    liveTitle: 'سجلات الخادم',
    liveLede: 'سجلات وقرارات تحقيق واحد، مقروءة من خادم {Kawalys}. هذه حالات قراءة، وليست حكمًا على السلامة.',
    demo: 'بيانات تجريبية: سجلات مصطنعة، ليست مباشرة',
    recordsTitle: 'سجلات الأدلة',
    decisionsTitle: 'القرارات',
    read: { current: 'حديثة', stale: 'قديمة', unknown: 'مقروءة، والوقت غير معروف', notRead: 'غير مقروءة' },
    reason: {
      error: 'فشلت قراءة المصدر.',
      denied: 'رُفض الوصول.',
      unknown: 'حالة القراءة غير معروفة.',
      noSource: 'لا توجد قراءة مصدر مرتبطة بهذا السجل.',
    },
    age: (m) => `رُصدت قبل {${m}} دقيقة`,
    recordedAge: (m) => `سُجّل قبل {${m}} دقيقة`,
    source: 'المصدر',
    creator: { recorded: 'المُنشئ مسجّل', notRecorded: 'المُنشئ غير مسجّل' },
    proposedNote: 'غير معتمد: لا يوجد رابط إلى السجل الذي يملك هذا القرار.',
    decisionText: 'القرار',
    noRecords: 'لا يوجد سجل دليل مدرج. وهذا لا يعني أن كل شيء على ما يرام.',
    noDecisions: 'لا يوجد قرار مسجّل لهذه الحالة.',
    incomplete: 'تعذّرت قراءة جزء من هذه الإجابة فاستُبعد، لذا القائمة غير مكتملة.',
    unreadable: {
      title: 'تعذّرت قراءة هذه السجلات',
      body: 'لم تكن الإجابة بصيغة نستطيع قراءتها، لذا لا يُعرض شيء. الحالة غير معروفة، وليست سليمة.',
    },
  },
};

export const INVESTIGATION: Readonly<Record<Lang, InvestigationCopy>> = { en, ar };

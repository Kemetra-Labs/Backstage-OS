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
    /**
     * BACK-148 (decision L): the case project's Observations that are not part of this case, read with
     * GET /evidence?projectId=&type=Observation. Citing one in a decision is the association; it is never proof of cause.
     */
    readonly projectObs: {
      readonly title: string;
      readonly lede: string;
      readonly count: (n: number) => string;
      /** The server lists at most `n` (its LIST_LIMIT): a full list is a lower bound, never the total. */
      readonly countAtLeast: (n: number) => string;
      readonly none: string;
      readonly unreadable: string;
      readonly notPart: string;
    };
    /** What each decision cites. A cited record that could not be read is unknown, never fine. */
    readonly cites: {
      readonly title: string;
      readonly where: Readonly<Record<'case' | 'outside' | 'unresolved', string>>;
    };
  };
  /**
   * Record a decision (BACK-51 P3, live mode only, owner decision D4). A decision records what a person decided: it runs nothing
   * and never reads as approved. A failed or unconfirmed send keeps the draft and says so; a hidden case reveals nothing.
   */
  readonly recordDecision: {
    readonly title: string;
    readonly lede: string;
    readonly decisionLabel: string;
    readonly rationaleLabel: string;
    /** `{n / max}`: code units, like the server. */
    readonly counter: (n: number, max: number) => string;
    readonly evidenceLegend: string;
    readonly evidenceHint: string;
    readonly evidenceNone: string;
    /** BACK-148: the project observations, a separate group of the same picker. */
    readonly projectLegend: string;
    readonly projectHint: string;
    readonly record: (i: number) => string;
    readonly problems: Readonly<Record<'decisionBlank' | 'decisionTooLong' | 'rationaleBlank' | 'rationaleTooLong' | 'tooManyEvidence' | 'unstorable', string>>;
    readonly submit: string;
    readonly submitting: string;
    /** BACK-127: the form while the session is locked (nothing of the draft is shown), and while the case is read again before the draft returns. */
    readonly locked: { readonly title: string; readonly body: string };
    readonly rereading: string;
    /** Why submit is off while the session is not signed in; the draft is kept. */
    readonly needSession: Readonly<Record<'checking' | 'signedOut' | 'ended' | 'unavailable' | 'error', string>>;
    readonly result: Readonly<Record<'recorded' | 'invalid' | 'not_found' | 'rate_limited' | 'unavailable' | 'error' | 'citationsChanged' | 'idempotency_conflict', { readonly title: string; readonly body: string }>>;
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
    projectObs: {
      title: 'Project observations, not part of this case',
      lede: 'Observations of this case\'s project that were not recorded in this case. Citing one in a decision links it to the decision; a citation is a reference, not proof of cause.',
      count: (n) => `{${n}} listed`,
      countAtLeast: (n) => `At least {${n}}: only the newest {${n}} are listed, so older ones may be missing.`,
      none: 'No other observation of this project is listed. That is not the same as nothing being wrong.',
      unreadable: 'The project observations could not be read. That is not the same as there being none.',
      notPart: 'Not part of this case',
    },
    cites: {
      title: 'Cites',
      where: { case: 'In this case', outside: 'Not part of this case', unresolved: 'Could not be read: unknown' },
    },
  },
  recordDecision: {
    title: 'Record a decision',
    lede: 'Write down what was decided and why, and cite the records it rests on. Recording keeps a note of the decision. It runs nothing and approves nothing.',
    decisionLabel: 'Decision',
    rationaleLabel: 'Rationale',
    counter: (n, max) => `{${n} / ${max}}`,
    evidenceLegend: 'Cited records (optional)',
    evidenceHint: 'Pick the records this decision rests on. Up to 50.',
    evidenceNone: 'No record is listed to cite. You can still record the decision without citing one.',
    projectLegend: 'Project observations, not part of this case',
    projectHint: 'Citing one links it to this decision. It does not move it into the case.',
    record: (i) => `Record {${i}}`,
    problems: {
      decisionBlank: 'Write the decision.',
      decisionTooLong: 'The decision is too long. The limit is 2000 characters.',
      rationaleBlank: 'Write the rationale.',
      rationaleTooLong: 'The rationale is too long. The limit is 4000 characters.',
      tooManyEvidence: 'Too many records are cited. The limit is 50.',
      unstorable: 'The text holds a character that cannot be stored. Remove it and try again.',
    },
    submit: 'Record decision',
    submitting: 'Recording…',
    locked: { title: 'Locked', body: 'Your session is not confirmed, so this form and any draft are hidden until it is.' },
    rereading: 'Reading this case again before your draft comes back.',
    needSession: {
      checking: 'Checking your session. You can record once it is confirmed.',
      signedOut: 'You are not signed in, so nothing can be recorded. Your draft is kept; sign in, then choose Check again.',
      ended: 'Your session ended, so nothing can be recorded. Your draft is kept; sign in again, then choose Check again.',
      unavailable: 'The server could not be reached, so we cannot tell whether you are signed in. Your draft is kept.',
      error: 'The sign-in status is unknown. Your draft is kept.',
    },
    result: {
      recorded: { title: 'Decision recorded', body: 'The decision is saved, with who recorded it. It is recorded only: nothing is run and nothing is approved.' },
      invalid: { title: 'The server did not accept this decision', body: 'Check the decision, the rationale and the cited records, then try again. Your draft is kept.' },
      not_found: { title: 'This case or a cited record is not visible', body: 'The server did not return it. It may not exist, or this session may not see it. Nothing was recorded. Your draft is kept.' },
      rate_limited: { title: 'Too many requests', body: 'Nothing was recorded. Try again in a minute. Your draft is kept.' },
      unavailable: { title: 'Not confirmed', body: 'We could not confirm that the decision was recorded. Check the decision list before trying again. Your draft is kept.' },
      error: { title: 'The server answered with an error', body: 'Do not assume the decision was recorded: check the decision list before trying again. Your draft is kept.' },
      idempotency_conflict: { title: 'This retry does not match the first attempt', body: 'Nothing was recorded by this request. The draft changed since the first attempt, so the first attempt cannot be repeated. Check the decision list, then record again. Your draft is kept.' },
      citationsChanged: { title: 'A cited record is no longer listed', body: 'It was removed from your selection. Check the cited records, then record again. Nothing was sent. Your draft is kept.' },
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
    projectObs: {
      title: 'ملاحظات المشروع، ليست جزءًا من هذه الحالة',
      lede: 'ملاحظات من مشروع هذه الحالة لم تُسجَّل فيها. الاستشهاد بإحداها في قرار يربطها بالقرار؛ والاستشهاد إشارة، وليس دليلًا على السبب.',
      count: (n) => `مُدرج {${n}}`,
      countAtLeast: (n) => `{${n}} على الأقل: تُدرج أحدث {${n}} فقط، لذا قد تنقص ملاحظات أقدم.`,
      none: 'لا توجد ملاحظة أخرى مُدرجة لهذا المشروع. وهذا لا يعني أن كل شيء على ما يرام.',
      unreadable: 'تعذّرت قراءة ملاحظات المشروع. وهذا لا يعني أنه لا توجد ملاحظات.',
      notPart: 'ليست جزءًا من هذه الحالة',
    },
    cites: {
      title: 'يستشهد بـ',
      where: { case: 'في هذه الحالة', outside: 'ليس جزءًا من هذه الحالة', unresolved: 'تعذّرت قراءته: غير معروف' },
    },
  },
  recordDecision: {
    title: 'تسجيل قرار',
    lede: 'اكتب ما تقرّر ولماذا، واذكر السجلات التي يستند إليها. التسجيل يحفظ ملاحظة بالقرار فقط؛ لا ينفّذ شيئًا ولا يعتمد شيئًا.',
    decisionLabel: 'القرار',
    rationaleLabel: 'المبرّر',
    counter: (n, max) => `{${n} / ${max}}`,
    evidenceLegend: 'السجلات المُستشهد بها (اختياري)',
    evidenceHint: 'اختر السجلات التي يستند إليها هذا القرار. حتى 50 سجلًا.',
    evidenceNone: 'لا يوجد سجل مُدرج للاستشهاد به. يمكنك تسجيل القرار دون الاستشهاد بسجل.',
    projectLegend: 'ملاحظات المشروع، ليست جزءًا من هذه الحالة',
    projectHint: 'الاستشهاد بإحداها يربطها بهذا القرار، ولا ينقلها إلى الحالة.',
    record: (i) => `السجل {${i}}`,
    problems: {
      decisionBlank: 'اكتب القرار.',
      decisionTooLong: 'القرار طويل جدًا. الحد الأقصى 2000 حرف.',
      rationaleBlank: 'اكتب المبرّر.',
      rationaleTooLong: 'المبرّر طويل جدًا. الحد الأقصى 4000 حرف.',
      tooManyEvidence: 'عدد السجلات المُستشهد بها كبير جدًا. الحد الأقصى 50.',
      unstorable: 'يحتوي النص على رمز لا يمكن حفظه. أزله وحاول مرة أخرى.',
    },
    submit: 'تسجيل القرار',
    submitting: 'جارٍ التسجيل…',
    locked: { title: 'مقفل', body: 'جلستك غير مؤكَّدة، لذا هذا النموذج وأي مسودة مخفيان حتى تُؤكَّد.' },
    rereading: 'نقرأ هذه الحالة مرة أخرى قبل أن تعود مسودتك.',
    needSession: {
      checking: 'نتحقق من جلستك. يمكنك التسجيل بعد التأكد منها.',
      signedOut: 'لم تسجّل الدخول، لذا لا يمكن تسجيل شيء. مسودتك محفوظة؛ سجّل الدخول ثم اختر «تحقّق مرة أخرى».',
      ended: 'انتهت جلستك، لذا لا يمكن تسجيل شيء. مسودتك محفوظة؛ سجّل الدخول مرة أخرى ثم اختر «تحقّق مرة أخرى».',
      unavailable: 'تعذّر الوصول إلى الخادم، لذا لا نعرف إن كنت مسجّل الدخول. مسودتك محفوظة.',
      error: 'حالة تسجيل الدخول غير معروفة. مسودتك محفوظة.',
    },
    result: {
      recorded: { title: 'سُجّل القرار', body: 'حُفظ القرار مع اسم من سجّله. هو مسجَّل فقط: لا يُنفَّذ شيء ولا يُعتمد شيء.' },
      invalid: { title: 'لم يقبل الخادم هذا القرار', body: 'راجع القرار والمبرّر والسجلات المُستشهد بها ثم حاول مرة أخرى. مسودتك محفوظة.' },
      not_found: { title: 'هذه الحالة أو أحد السجلات المُستشهد بها غير مرئي', body: 'لم يُرجعها الخادم. قد لا تكون موجودة، أو قد لا تراها هذه الجلسة. لم يُسجَّل شيء. مسودتك محفوظة.' },
      rate_limited: { title: 'طلبات كثيرة جدًا', body: 'لم يُسجَّل شيء. حاول بعد دقيقة. مسودتك محفوظة.' },
      unavailable: { title: 'لم يتأكد التسجيل', body: 'لم نتمكن من التأكد من تسجيل القرار. راجع قائمة القرارات قبل المحاولة مرة أخرى. مسودتك محفوظة.' },
      error: { title: 'أجاب الخادم بخطأ', body: 'لا تفترض أن القرار سُجّل: راجع قائمة القرارات قبل المحاولة مرة أخرى. مسودتك محفوظة.' },
      idempotency_conflict: { title: 'هذه المحاولة لا تطابق المحاولة الأولى', body: 'لم يُسجَّل شيء بهذا الطلب. تغيّرت المسودة منذ المحاولة الأولى فلا يمكن تكرارها. راجع قائمة القرارات ثم سجّل مرة أخرى. مسودتك محفوظة.' },
      citationsChanged: { title: 'لم يعد أحد السجلات المُستشهد بها مُدرجًا', body: 'أُزيل من اختيارك. راجع السجلات المُستشهد بها ثم سجّل مرة أخرى. لم يُرسل شيء. مسودتك محفوظة.' },
    },
  },
};

export const INVESTIGATION: Readonly<Record<Lang, InvestigationCopy>> = { en, ar };

// Mission Map lens copy (BACK-87): only the host-owned strings around the B+C map. The map's own copy is the V2 table
// (i18n/lenses), reached through the host adapter. {braces} mark left-to-right tokens; Latin digits in both languages.
import type { Lang } from '../../contract/types';

export interface MapLensCopy {
  readonly loading: string;
  readonly failed: string;
  readonly region: string;
  readonly openProject: string;
  readonly openProjectNote: string;
  readonly noProject: string;
}

export interface SourcesViewCopy {
  readonly label: string;
  readonly tables: string;
  readonly observatory: string;
  readonly loading: string;
  readonly failed: string;
  readonly region: string;
}

/** BACK-88: the view switch on the Sources screen and the Observatory lens's own states. */
export const SOURCES_VIEW_COPY: Readonly<Record<Lang, SourcesViewCopy>> = {
  en: { label: 'Source views', tables: 'Tables', observatory: 'Observatory', loading: 'Loading the Source Observatory…', failed: 'The Source Observatory could not load. The tables above still work.', region: 'Source Observatory' },
  ar: { label: 'عروض المصادر', tables: 'الجداول', observatory: 'المرصد', loading: 'جارٍ تحميل مرصد المصادر…', failed: 'تعذّر تحميل مرصد المصادر. تعمل الجداول كالمعتاد.', region: 'مرصد المصادر' },
};

export interface AgentsViewCopy {
  readonly label: string;
  readonly roster: string;
  readonly deck: string;
  readonly loading: string;
  readonly failed: string;
  readonly region: string;
}

/** BACK-90: the view switch on the Agents screen and the Flight Deck lens's own states. */
export const AGENTS_VIEW_COPY: Readonly<Record<Lang, AgentsViewCopy>> = {
  en: { label: 'Agent views', roster: 'Roster', deck: 'Flight Deck', loading: 'Loading the Flight Deck…', failed: 'The Flight Deck could not load. The roster still works.', region: 'Agent Flight Deck' },
  ar: { label: 'عروض الوكلاء', roster: 'القائمة', deck: 'لوحة القيادة', loading: 'جارٍ تحميل لوحة القيادة…', failed: 'تعذّر تحميل لوحة القيادة. تعمل القائمة كالمعتاد.', region: 'لوحة قيادة الوكلاء' },
};

export interface ReplayViewCopy {
  readonly label: string;
  readonly room: string;
  readonly replay: string;
  readonly loading: string;
  readonly failed: string;
  readonly region: string;
  readonly basis: {
    readonly title: string;
    readonly intro: string;
    readonly caption: string;
    readonly step: string;
    readonly event: string;
    readonly processed: string;
    readonly observed: string;
    readonly order: string;
    readonly notEvidenced: string;
    readonly consistent: string;
    readonly uncertain: string;
    readonly unknown: string;
    readonly occurred: string;
  };
}

/** BACK-89: the view switch on the Investigation Room, the Replay lens's own states, and the time basis (three times, never mixed). */
export const REPLAY_VIEW_COPY: Readonly<Record<Lang, ReplayViewCopy>> = {
  en: {
    label: 'Investigation views', room: 'Room', replay: 'Replay',
    loading: 'Loading the replay…', failed: 'The replay could not load. The Investigation Room still works.', region: 'Mission Replay',
    basis: {
      title: 'What the times mean',
      intro: 'The replay order is the order Kawalys processed the signals. It is not the order things happened. Where an event rests on evidence, the time its source read it is shown; an event with no evidence has no time, and its place in the order is only the processing order.',
      caption: 'Processing time and source read time for each replay event',
      step: 'Step', event: 'Event', processed: 'Processed by Kawalys', observed: 'Read by its source', order: 'Order',
      notEvidenced: 'No evidence, no time', consistent: 'Matches the processing order', uncertain: 'Order uncertain', unknown: 'Not known',
      occurred: 'When each thing actually happened is not recorded in the demo data, so it is not shown.',
    },
  },
  ar: {
    label: 'عروض التحقيق', room: 'الغرفة', replay: 'إعادة المهمة',
    loading: 'جارٍ تحميل إعادة المهمة…', failed: 'تعذّر تحميل إعادة المهمة. تعمل غرفة التحقيق كالمعتاد.', region: 'إعادة المهمة',
    basis: {
      title: 'ماذا تعني الأوقات',
      intro: 'ترتيب إعادة المهمة هو ترتيب معالجة {Kawalys} للإشارات، وليس ترتيب حدوث الأمور. حيث يستند الحدث إلى دليل يظهر وقت قراءة مصدره له؛ والحدث بلا دليل لا وقت له، ومكانه في الترتيب هو ترتيب المعالجة فقط.',
      caption: 'وقت المعالجة ووقت قراءة المصدر لكل حدث في إعادة المهمة',
      step: 'الخطوة', event: 'الحدث', processed: 'عالجه {Kawalys}', observed: 'قرأه مصدره', order: 'الترتيب',
      notEvidenced: 'لا دليل، لا وقت', consistent: 'يطابق ترتيب المعالجة', uncertain: 'الترتيب غير مؤكد', unknown: 'غير معروف',
      occurred: 'وقت حدوث كل أمر فعليًا غير مسجّل في البيانات التجريبية، لذلك لا يُعرض.',
    },
  },
};

export const MAP_LENS_COPY: Readonly<Record<Lang, MapLensCopy>> = {
  en: {
    loading: 'Loading the Mission Map…',
    failed: 'The Mission Map could not load. Every other screen still works.',
    region: 'Mission Map',
    openProject: 'Open this system in Project Intelligence',
    openProjectNote: 'The same system, with its components, checks and recent delivery.',
    noProject: 'No Project Intelligence page is linked to this item: the match between the map and the project list is not verified.',
  },
  ar: {
    loading: 'جارٍ تحميل خريطة المهام…',
    failed: 'تعذّر تحميل خريطة المهام. تعمل كل الشاشات الأخرى.',
    region: 'خريطة المهام',
    openProject: 'فتح هذا النظام في ذكاء المشروع',
    openProjectNote: 'النظام نفسه، مع مكوناته وفحوصاته وآخر ما تم تسليمه.',
    noProject: 'لا توجد صفحة ذكاء مشروع مرتبطة بهذا العنصر: المطابقة بين الخريطة وقائمة المشاريع غير موثّقة.',
  },
};

// Mission Map lens copy (BACK-87): only the host-owned strings around the B+C map. The map's own copy is the V2 table
// (design-lab/v2/i18n), reached through the host adapter. {braces} mark left-to-right tokens; Latin digits in both languages.
import type { Lang } from '../../contract/types';

export interface MapLensCopy {
  readonly loading: string;
  readonly failed: string;
  readonly region: string;
  readonly openProject: string;
  readonly openProjectNote: string;
  readonly noProject: string;
}

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

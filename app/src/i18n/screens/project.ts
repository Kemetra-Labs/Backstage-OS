// Project Intelligence copy (BACK-12). {braces} isolate left-to-right tokens; Latin digits in both languages.
// Links and buttons never use action verbs. Persona-specific wording is limited to layer and field names.
import type { Lang, Persona } from '../../contract/types';
import type { ComponentLayer, DeliveryItem } from '../../contract/world';

type ByPersona = Readonly<Record<Persona, string>>;

export interface ProjectCopy {
  /** Plain text for the h1. Arabic omits the Latin product name: ScreenHeader takes a plain string. */
  readonly h1: (name: string) => string;
  readonly notFound: {
    readonly projectTitle: string;
    readonly projectBody: (id: string) => string;
    readonly componentTitle: string;
    readonly componentBody: (id: string) => string;
    readonly openPortfolio: string;
    readonly viewProject: (name: string) => string;
  };
  readonly componentsCount: (n: number) => string;
  readonly noComponents: string;
  readonly status: {
    readonly title: string;
    readonly sources: string;
    readonly notConfiguredTitle: string;
    readonly notConfiguredBody: string;
    readonly neverRead: string;
  };
  readonly map: {
    readonly title: string;
    readonly label: string;
    readonly filters: string;
    readonly environment: string;
    readonly layer: string;
    readonly all: string;
    readonly view: string;
    readonly viewMap: string;
    readonly viewTable: string;
    readonly narrowNote: string;
    readonly componentsList: string;
    readonly selectedMark: string;
    readonly emptyBody: string;
    readonly noMatchTitle: string;
    readonly noMatchBody: string;
    readonly clearFilters: string;
    readonly caseOn: (id: string) => string;
  };
  readonly layer: Readonly<Record<'standard' | 'plain', Readonly<Record<ComponentLayer, string>>>>;
  readonly selected: {
    readonly title: string;
    readonly hint: string;
    readonly environment: ByPersona;
    readonly layer: ByPersona;
    readonly componentId: string;
    readonly note: string;
    readonly target: string;
    readonly evidenceTitle: string;
    readonly noEvidence: string;
    readonly attentionTitle: string;
    readonly noAttention: string;
    readonly openCase: (id: string) => string;
    readonly inspect: (id: string) => string;
    readonly source: string;
    readonly closeSelection: string;
  };
  readonly delivery: {
    readonly title: string;
    readonly intro: string;
    readonly empty: string;
    readonly status: Readonly<Record<DeliveryItem['status'], string>>;
    readonly statusLabel: string;
  };
  readonly risks: {
    readonly title: string;
    readonly intro: string;
    readonly unknownTitle: string;
    readonly unknownNone: string;
    readonly nothingMapped: string;
    readonly reason: Readonly<Record<'not_set_up' | 'stale' | 'no_evidence', string>>;
    readonly edgesTitle: string;
    readonly edgesNone: string;
    readonly sourcesTitle: string;
    readonly sourcesNone: string;
  };
}

const en: ProjectCopy = {
  h1: (name) => `Project Intelligence: ${name}`,
  notFound: {
    projectTitle: 'Project not found',
    projectBody: (id) => `There is no product {${id}} in the demo data.`,
    componentTitle: 'Component not found',
    componentBody: (id) => `There is no component {${id}} in this product in the demo data.`,
    openPortfolio: 'Open Portfolio',
    viewProject: (name) => `View {${name}}`,
  },
  componentsCount: (n) => (n === 1 ? '1 component' : `${n} components`),
  noComponents: 'No components mapped',
  status: {
    title: 'Status and sources',
    sources: 'Sources',
    notConfiguredTitle: 'Product not set up',
    notConfiguredBody: 'No pipeline or code source is set up for this product, so nothing has been read. Its health is unknown, not healthy.',
    neverRead: 'never read',
  },
  map: {
    title: 'Dependency map',
    label: 'Dependency map of the product',
    filters: 'Filters',
    environment: 'Environment',
    layer: 'Layer',
    all: 'All',
    view: 'View',
    viewMap: 'Map',
    viewTable: 'Table',
    narrowNote: 'On narrow screens the table is shown instead of the map.',
    componentsList: 'Components',
    selectedMark: 'selected',
    emptyBody: 'No components are mapped for this product yet, so there is no map to draw.',
    noMatchTitle: 'No component matches',
    noMatchBody: 'The current filters hide every component. Components that are hidden are not healthy or unhealthy, only not shown.',
    clearFilters: 'Clear filters',
    caseOn: (id) => `Case {${id}}`,
  },
  layer: {
    standard: { client: 'Client app', edge: 'Edge', service: 'Service', data: 'Data', integration: 'Integration' },
    plain: { client: 'App on devices', edge: 'Entry point', service: 'Back-end service', data: 'Stored data', integration: 'Link to another system' },
  },
  selected: {
    title: 'Selected component',
    hint: 'Pick a component on the map or in the table to see its evidence and related items.',
    environment: { owner: 'Environment', technical: 'Environment', nontechnical: 'Where it runs' },
    layer: { owner: 'Layer', technical: 'Layer', nontechnical: 'Kind' },
    componentId: 'Component id',
    note: 'Note',
    target: 'Target',
    evidenceTitle: 'Linked evidence',
    noEvidence: 'No evidence is linked to this component yet. Its health stays unknown.',
    attentionTitle: 'Related attention',
    noAttention: 'No attention items mention this component.',
    openCase: (id) => `Open case {${id}}`,
    inspect: (id) => `Inspect evidence {${id}}`,
    source: 'Source',
    closeSelection: 'Clear selection',
  },
  delivery: {
    title: 'CI and delivery evidence',
    intro: 'Status as the source reports it. The label beside it says how far to trust it.',
    empty: 'No delivery items are mapped for this product.',
    status: {
      failing: 'Failing', passing: 'Passing', merged: 'Merged', planned: 'Planned', in_progress: 'In progress', unknown: 'Status unknown',
    },
    statusLabel: 'Status',
  },
  risks: {
    title: 'Risks and unknowns',
    intro: 'Nothing here is shown as healthy. These are the places where we do not know, or only suspect.',
    unknownTitle: 'Health unknown',
    unknownNone: 'Every mapped component has a resolved health.',
    nothingMapped: 'No components are mapped, so no component health can be assessed.',
    reason: {
      not_set_up: 'Not set up: nothing has been read.',
      stale: 'Last read is stale, so health is not assumed.',
      no_evidence: 'No evidence has been read.',
    },
    edgesTitle: 'Links not confirmed',
    edgesNone: 'Every link is declared in a catalog.',
    sourcesTitle: 'Sources not current',
    sourcesNone: 'Every source is current.',
  },
};

const ar: ProjectCopy = {
  h1: () => 'ذكاء المشروع',
  notFound: {
    projectTitle: 'المشروع غير موجود',
    projectBody: (id) => `لا يوجد منتج {${id}} في البيانات التجريبية.`,
    componentTitle: 'المكوّن غير موجود',
    componentBody: (id) => `لا يوجد مكوّن {${id}} في هذا المنتج ضمن البيانات التجريبية.`,
    openPortfolio: 'فتح المحفظة',
    viewProject: (name) => `عرض {${name}}`,
  },
  componentsCount: (n) => (n === 1 ? 'مكوّن واحد' : `${n} مكونات`),
  noComponents: 'لا مكونات مرسومة',
  status: {
    title: 'الحالة والمصادر',
    sources: 'المصادر',
    notConfiguredTitle: 'المنتج غير مُعدّ',
    notConfiguredBody: 'لا يوجد مصدر خطوط أو كود مُعدّ لهذا المنتج، لذا لم يُقرأ شيء. حالته غير معروفة وليست سليمة.',
    neverRead: 'لم يُقرأ قط',
  },
  map: {
    title: 'خريطة الاعتماديات',
    label: 'خريطة اعتماديات المنتج',
    filters: 'عوامل التصفية',
    environment: 'البيئة',
    layer: 'الطبقة',
    all: 'الكل',
    view: 'العرض',
    viewMap: 'خريطة',
    viewTable: 'جدول',
    narrowNote: 'على الشاشات الضيقة يظهر الجدول بدل الخريطة.',
    componentsList: 'المكونات',
    selectedMark: 'محدد',
    emptyBody: 'لا توجد مكونات مرسومة لهذا المنتج بعد، لذا لا توجد خريطة.',
    noMatchTitle: 'لا مكوّن مطابق',
    noMatchBody: 'عوامل التصفية الحالية تخفي كل المكونات. المكونات المخفية ليست سليمة ولا معطلة، فقط غير معروضة.',
    clearFilters: 'مسح عوامل التصفية',
    caseOn: (id) => `الحالة {${id}}`,
  },
  layer: {
    standard: { client: 'تطبيق العميل', edge: 'الحافة', service: 'خدمة', data: 'بيانات', integration: 'تكامل' },
    plain: { client: 'تطبيق على الأجهزة', edge: 'نقطة الدخول', service: 'خدمة خلفية', data: 'بيانات مخزنة', integration: 'ربط مع نظام آخر' },
  },
  selected: {
    title: 'المكوّن المحدد',
    hint: 'اختر مكوّنًا من الخريطة أو الجدول لرؤية أدلته والعناصر المرتبطة به.',
    environment: { owner: 'البيئة', technical: 'البيئة', nontechnical: 'أين يعمل' },
    layer: { owner: 'الطبقة', technical: 'الطبقة', nontechnical: 'النوع' },
    componentId: 'معرّف المكوّن',
    note: 'ملاحظة',
    target: 'الهدف',
    evidenceTitle: 'الأدلة المرتبطة',
    noEvidence: 'لا أدلة مرتبطة بهذا المكوّن بعد. تبقى حالته غير معروفة.',
    attentionTitle: 'عناصر انتباه مرتبطة',
    noAttention: 'لا عناصر انتباه تذكر هذا المكوّن.',
    openCase: (id) => `فتح الحالة {${id}}`,
    inspect: (id) => `فحص الدليل {${id}}`,
    source: 'المصدر',
    closeSelection: 'إلغاء التحديد',
  },
  delivery: {
    title: 'أدلة التكامل والتسليم',
    intro: 'الحالة كما يبلغ عنها المصدر. الوسم المجاور يوضح مدى الوثوق بها.',
    empty: 'لا عناصر تسليم مرسومة لهذا المنتج.',
    status: {
      failing: 'فاشل', passing: 'ناجح', merged: 'مدموج', planned: 'مخطط', in_progress: 'قيد العمل', unknown: 'الحالة غير معروفة',
    },
    statusLabel: 'الحالة',
  },
  risks: {
    title: 'المخاطر والمجهولات',
    intro: 'لا شيء هنا يُعرض على أنه سليم. هذه أماكن لا نعرف فيها، أو نشتبه فقط.',
    unknownTitle: 'الحالة غير معروفة',
    unknownNone: 'لكل مكوّن مرسوم حالة محسومة.',
    nothingMapped: 'لا مكونات مرسومة، لذا لا يمكن تقييم حالة أي مكوّن.',
    reason: {
      not_set_up: 'غير مُعدّ: لم يُقرأ شيء.',
      stale: 'آخر قراءة قديمة، لذا لا تُفترض السلامة.',
      no_evidence: 'لم تُقرأ أي أدلة.',
    },
    edgesTitle: 'روابط غير مؤكدة',
    edgesNone: 'كل الروابط مُعلنة في كتالوج.',
    sourcesTitle: 'مصادر غير حديثة',
    sourcesNone: 'كل المصادر حديثة.',
  },
};

export const PROJECT_COPY: Readonly<Record<Lang, ProjectCopy>> = { en, ar };

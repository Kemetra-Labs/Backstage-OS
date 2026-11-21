export type Lang = 'en' | 'ar';

export interface Copy {
  title: string;
  demo: string;
  renderer: string;
  data: string;
  language: string;
  graphView: string;
  tableView: string;
  inspector: string;
  noSelection: string;
  clear: string;
  legend: string;
  observed: string;
  observedNote: string;
  unknown: string;
  unknownNote: string;
  unresolved: string;
  unresolvedNote: string;
  nodes: string;
  edges: string;
  nodesTable: string;
  edgesTable: string;
  colId: string;
  colKind: string;
  colLang: string;
  colLoc: string;
  colFrom: string;
  colTo: string;
  colType: string;
  colBasis: string;
  colEvidence: string;
  outgoing: string;
  incoming: string;
  none: string;
  noLine: string;
  hint: string;
  graphLabel: string;
  canvasDirection: string;
  placeholderNote: string;
  skip: string;
  counts: (n: number, e: number, u: number) => string;
}

export const COPY: Record<Lang, Copy> = {
  en: {
    title: 'Hybrid Mission Map renderer test',
    demo: 'Demo data only: fixture or synthetic graph, not live telemetry.',
    renderer: 'Renderer',
    data: 'Graph',
    language: 'Language',
    graphView: 'Graph',
    tableView: 'Tables',
    inspector: 'Inspector',
    noSelection: 'Select a node to see its evidence.',
    clear: 'Clear selection',
    legend: 'Link legend',
    observed: 'Observed',
    observedNote: 'solid line, filled arrow: statically evident in source',
    unknown: 'Unknown',
    unknownNote: 'dotted line, open circle: may exist, not resolvable; never shown as observed',
    unresolved: 'Unresolved target',
    unresolvedNote: 'dashed stub box: the link has no resolved target',
    nodes: 'Nodes',
    edges: 'Edges',
    nodesTable: 'Nodes (accessible table equivalent of the graph)',
    edgesTable: 'Edges (accessible table equivalent of the graph)',
    colId: 'Id',
    colKind: 'Kind',
    colLang: 'Language',
    colLoc: 'File:line',
    colFrom: 'From',
    colTo: 'To',
    colType: 'Type',
    colBasis: 'How we know',
    colEvidence: 'Evidence',
    outgoing: 'Outgoing links',
    incoming: 'Incoming links',
    none: 'none',
    noLine: 'no line',
    hint: 'Hint',
    graphLabel: 'Dependency graph, left to right',
    canvasDirection: 'The graph is always drawn left to right.',
    placeholderNote: 'Unresolved: the target is not known.',
    skip: 'Skip to inspector',
    counts: (n, e, u) => `${n} nodes, ${e} edges, ${u} unresolved`,
  },
  ar: {
    title: 'اختبار عارضات خريطة المهمة الهجينة',
    demo: 'بيانات تجريبية فقط: رسم نموذجي أو اصطناعي، وليست قياسات حية.',
    renderer: 'العارض',
    data: 'الرسم',
    language: 'اللغة',
    graphView: 'الرسم',
    tableView: 'الجداول',
    inspector: 'المفتش',
    noSelection: 'اختر عقدة لعرض الأدلة.',
    clear: 'إلغاء التحديد',
    legend: 'مفتاح الروابط',
    observed: 'مرصود',
    observedNote: 'خط متصل وسهم ممتلئ: واضح في الشيفرة بشكل ثابت',
    unknown: 'غير معروف',
    unknownNote: 'خط منقط ودائرة مفتوحة: قد يوجد ولا يمكن حله، ولا يظهر أبدا كمرصود',
    unresolved: 'هدف غير محلول',
    unresolvedNote: 'مربع متقطع: الرابط بلا هدف محلول',
    nodes: 'العقد',
    edges: 'الروابط',
    nodesTable: 'العقد (جدول بديل يمكن الوصول إليه)',
    edgesTable: 'الروابط (جدول بديل يمكن الوصول إليه)',
    colId: 'المعرف',
    colKind: 'النوع',
    colLang: 'اللغة',
    colLoc: 'الملف:السطر',
    colFrom: 'من',
    colTo: 'إلى',
    colType: 'الصنف',
    colBasis: 'كيف نعرف',
    colEvidence: 'الدليل',
    outgoing: 'الروابط الصادرة',
    incoming: 'الروابط الواردة',
    none: 'لا يوجد',
    noLine: 'بلا سطر',
    hint: 'تلميح',
    graphLabel: 'رسم الاعتماديات من اليسار إلى اليمين',
    canvasDirection: 'يُرسم الرسم دائما من اليسار إلى اليمين.',
    placeholderNote: 'غير محلول: الهدف غير معروف.',
    skip: 'انتقل إلى المفتش',
    counts: (n, e, u) => `${n} عقدة، ${e} رابط، ${u} غير محلول`,
  },
};

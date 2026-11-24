// Copy for the Hybrid Mission Map pilot (B+C). Existing V2 keys are reused wherever the wording already exists; only
// what is new lives here. Every Arabic string below is NEW and has NOT had a native-speaker review (SPEC section 9, item 5).
// BACK-31: an AI-assisted pass (24 Nov 2026) revised seven strings; it does not replace the native review, so this stays unreviewed.
import type { Table } from '../translate';

export const BC = {
  'bc.concept': ['{B + C} pilot', 'النسخة التجريبية {B + C}'],
  'bc.hint': ['Arrow keys move between nodes. Enter selects.', 'مفاتيح الأسهم تنتقل بين العقد. مفتاح {Enter} يحدّد.'],
  'bc.list.empty': ['No systems match this filter.', 'لا توجد أنظمة تطابق هذا المرشح.'],
  'bc.links.empty': ['No links match this filter.', 'لا توجد روابط تطابق هذا المرشح.'],

  // Legend and orbit key
  'bc.legend.stale': ['Observed (stale)', 'مرصود (قديم)'],
  'bc.legend.group': ['Part of', 'جزء من'],
  'bc.legend.ring': ['Ring: read age vs target', 'حلقة: عمر القراءة مقابل الهدف'],
  'bc.orbit.sub': ['Orbit = kind of system, not importance', 'المدار = نوع النظام، لا الأهمية'],
  'bc.orbit.inner': ['Inner orbit', 'المدار الداخلي'],
  'bc.orbit.middle': ['Middle orbit', 'المدار الأوسط'],
  'bc.orbit.outer': ['Outer orbit', 'المدار الخارجي'],

  // List view (C's ledger and matrix)
  'bc.ledger': ['Systems ledger', 'سجل الأنظمة'],
  'bc.ledger.sub': ['Every system, its status and its evidence count', 'كل نظام وحالته وعدد أدلته'],
  'bc.matrix': ['Source readings', 'قراءات المصادر'],
  'bc.matrix.sub': ['Connectivity, freshness and health, each on its own', 'الاتصال والحداثة والصحة، كلٌّ على حدة'],
  'bc.th.system': ['System', 'النظام'],

  // Readings
  'bc.of': ['of $of $unit', 'من $of $unit'],
  'bc.readings.label': ['Three readings of $n sources', 'ثلاث قراءات لمصادر عددها $n'],
  'bc.target': ['target $m min', 'الهدف $m د'],
  'bc.over': ['$x× target', '$x× الهدف'],
  // Joins two parts of one accessible name (Arabic uses its own comma).
  'bc.sep': [', ', '، '],
  'bc.never': ['never read', 'لم تُقرأ قط'],
  'bc.f.current': ['Current', 'حديث'],

  // Status words in sentence case (the V1 words are lower case because V2's chips were upper-cased by CSS)
  'bc.chip.unavailable': ['Unavailable', 'غير متاح'],
  'bc.chip.notset': ['Not set up', 'غير مُعد'],

  'bc.tl.sub': ['Ordered, not to time scale', 'بالترتيب فقط، دون مقياس زمني'],
} as const satisfies Table;

// One persona allowlist for evidence on every screen (Blueprint v4 §5, D-5). Owner and Nontechnical never receive raw
// output, job names, run ids, PR ids or links; Technical-only items arrive as "restricted" with no detail at all.
import { effectiveFreshness, isInertLink, resolveLabel } from '../contract/rules';
import type { EvidenceReference, Lang, Persona } from '../contract/types';
import type { DeliveryItem, World } from '../contract/world';
import { COPY } from '../i18n/strings';
import type { EvidenceView } from './viewFor';

/** The view of one evidence item a persona may receive. rawOutput is attached for Technical only. */
export function evidenceViewFor(persona: Persona, ref: EvidenceReference, rawOutput?: string): EvidenceView {
  const o = ref.observation;
  const src = o?.source;
  const inert = isInertLink(o?.sourceUrl, src?.synthetic ?? true);

  // Restricted evidence: only that it exists, with no title, source, target, age or label.
  if (ref.visibility === 'technical' && persona !== 'technical') {
    return { id: ref.id, label: 'unknown', freshness: 'unknown', ageMinutes: null, inert: true, restricted: true };
  }

  const base: EvidenceView = {
    id: ref.id,
    label: resolveLabel(ref),
    freshness: effectiveFreshness(ref),
    ageMinutes: src?.ageMinutes ?? null,
    inert,
    ...(src ? { provider: src.provider } : {}),
    ...(ref.notReadReason ? { notReadReason: ref.notReadReason } : {}),
  };
  if (persona === 'nontechnical') return base;

  const ownerView: EvidenceView = { ...base, ...(o ? { observedAt: o.observedAt, environment: o.environment } : {}) };
  if (persona === 'owner') return ownerView;

  return {
    ...ownerView,
    ...(o ? { targetLabel: o.target.label, ingestedAt: o.ingestedAt } : {}),
    ...(o?.target.externalId ? { externalId: o.target.externalId } : {}),
    ...(o?.sourceUrl ? { url: o.sourceUrl } : {}),
    ...(ref.rule ? { rule: ref.rule } : {}),
    ...(rawOutput !== undefined ? { rawOutput } : {}),
  };
}

/**
 * Persona title for any evidence id, as copy with {braces}: INV-DEMO-7 items from strings.ts, the rest from the world.
 * Restricted items get the restriction text, never their title. Unknown ids fall back to the id itself.
 */
export function evidenceTitleFor(w: World, id: string, persona: Persona, lang: Lang): string {
  const ref = w.evidence[id];
  const copy = COPY[lang];
  if (ref && ref.visibility === 'technical' && persona !== 'technical') return copy.restricted;
  return copy.evidenceItem[id]?.[persona] ?? w.evidenceText[id]?.[persona][lang] ?? `{${id}}`;
}

const DELIVERY_KIND: Readonly<Record<Lang, Readonly<Record<DeliveryItem['kind'], string>>>> = {
  en: { check: 'Automated check', pr: 'Code change', release: 'Release', workItem: 'Work item' },
  ar: { check: 'فحص آلي', pr: 'تغيير في الكود', release: 'إصدار', workItem: 'عنصر عمل' },
};

/**
 * Label for a CI / delivery item. Technical sees the job name and id; Owner sees work items and releases by id but
 * checks and PRs only by kind; Nontechnical sees the kind only.
 */
export function deliveryLabelFor(item: DeliveryItem, persona: Persona, lang: Lang): string {
  const kind = DELIVERY_KIND[lang][item.kind];
  if (persona === 'technical') return item.ref.externalId ? `{${item.ref.label}} · {${item.ref.externalId}}` : `{${item.ref.label}}`;
  if (persona === 'owner' && (item.kind === 'workItem' || item.kind === 'release') && item.ref.externalId) {
    return `${kind} {${item.ref.externalId}}`;
  }
  return kind;
}

// One persona allowlist for evidence on every screen (Blueprint v4 §5, D-5). Owner and Nontechnical never receive raw
// output, job names, run ids, PR ids or links. Technical-only items never reach them at all: App.tsx scopes the world through
// authorizedWorld (BACK-73), and these projections fail closed if an unscoped Technical-only record is ever passed (BACK-92 R7).
import { effectiveFreshness, isInertLink, resolveLabel } from '../contract/rules';
import type { EvidenceReference, Lang, Persona } from '../contract/types';
import type { DeliveryItem, World } from '../contract/world';
import type { EvidenceView } from './viewFor';
import { hostCopy } from '../i18n/host';

/**
 * Fails closed when a Technical-only record reaches a lay persona's projection. The record was withheld by authorizedWorld /
 * authorizedInvestigation before any screen reads it, so this never runs in the app; there is no placeholder to render instead,
 * because a placeholder would itself disclose that the record exists (M05-D05-B).
 */
function assertAuthorized(ref: EvidenceReference, persona: Persona): void {
  if (ref.visibility === 'technical' && persona !== 'technical') {
    throw new Error(`unscoped evidence: a Technical-only record reached the ${persona} view; scope the world with authorizedWorld first`);
  }
}

/** The view of one evidence item a persona may receive. rawOutput is attached for Technical only. */
export function evidenceViewFor(persona: Persona, ref: EvidenceReference, rawOutput?: string): EvidenceView {
  assertAuthorized(ref, persona);
  const o = ref.observation;
  const src = o?.source;
  const inert = isInertLink(o?.sourceUrl, src?.synthetic ?? true);

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
 * Persona title for an evidence id of this world, as copy with {braces}: INV-DEMO-7 items from strings.ts, the rest from the world.
 * An id the world does not hold (unknown, or withheld from this persona) gets the id itself, never a title from the static copy.
 */
export function evidenceTitleFor(w: World, id: string, persona: Persona, lang: Lang): string {
  const ref = w.evidence[id];
  if (!ref) return `{${id}}`;
  assertAuthorized(ref, persona);
  return hostCopy('COPY', lang).evidenceItem[id]?.[persona] ?? w.evidenceText[id]?.[persona][lang] ?? `{${id}}`;
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

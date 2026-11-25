// Global demo search: an in-memory index over the synthetic world only. No network, no live lookup.
import type { Lang, Persona } from '../contract/types';
import type { World } from '../contract/world';
import { plain as strip } from '../i18n/format';
import { catalogueEvidence } from '../view/world';
import { hrefFor } from './routes';

export type SearchKind = 'project' | 'component' | 'investigation' | 'evidence' | 'decision' | 'workItem';

export interface SearchItem {
  readonly kind: SearchKind;
  readonly id: string;
  /** Left-to-right label (ids and names). */
  readonly label: string;
  /** Extra match text: plain-language titles per language. */
  readonly text: Readonly<Record<Lang, string>>;
  readonly href: string;
  /** Run ids, job names and PR ids are Technical-only (same redaction as the Investigation Room). */
  readonly technicalOnly: boolean;
}

export function buildIndex(w: World): readonly SearchItem[] {
  const items: SearchItem[] = [];
  for (const p of w.projects) {
    items.push({ kind: 'project', id: p.id, label: p.name, text: { en: strip(p.summary.en), ar: strip(p.summary.ar) },
      href: hrefFor({ name: 'project', projectId: p.id }), technicalOnly: false });
    for (const c of p.components) {
      items.push({ kind: 'component', id: `${p.id}/${c.id}`, label: c.name, text: { en: p.name, ar: p.name },
        href: hrefFor({ name: 'project', projectId: p.id, componentId: c.id }), technicalOnly: false });
    }
    for (const d of p.delivery) {
      if (d.kind !== 'workItem' || !d.ref.externalId) continue;
      items.push({ kind: 'workItem', id: d.ref.externalId, label: d.ref.externalId, text: { en: d.ref.label, ar: d.ref.label },
        href: hrefFor({ name: 'project', projectId: p.id }), technicalOnly: false });
    }
  }
  for (const i of w.investigations) {
    items.push({ kind: 'investigation', id: i.id, label: i.id,
      text: { en: strip(i.title.owner.en), ar: strip(i.title.owner.ar) },
      href: hrefFor({ name: 'investigation', id: i.id }), technicalOnly: false });
  }
  for (const e of catalogueEvidence(w)) {
    const from = w.investigations.find((i) => i.evidence.some((x) => x.id === e.id))?.id;
    items.push({ kind: 'evidence', id: e.id, label: e.id, text: { en: '', ar: '' },
      href: hrefFor(from ? { name: 'evidence', id: e.id, from } : { name: 'evidence', id: e.id }),
      technicalOnly: e.visibility === 'technical' });
  }
  for (const d of w.decisions) {
    items.push({ kind: 'decision', id: d.id, label: d.id, text: { en: strip(d.title.owner.en), ar: strip(d.title.owner.ar) },
      href: hrefFor({ name: 'decision', id: d.id }), technicalOnly: false });
  }
  return items;
}

/** Case-insensitive match on id, label or title. Fewer than 2 characters returns nothing. */
export function search(index: readonly SearchItem[], query: string, persona: Persona, lang: Lang, limit = 8): readonly SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return index
    .filter((i) => persona === 'technical' || !i.technicalOnly)
    .filter((i) => i.id.toLowerCase().includes(q) || i.label.toLowerCase().includes(q) || i.text[lang].toLowerCase().includes(q))
    .slice(0, limit);
}

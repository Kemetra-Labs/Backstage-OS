import type { Lang, Persona } from '../contract/types';
import { formatAge } from '../i18n/segments';
import type { Copy } from '../i18n/strings';
import type { EvidenceView } from '../view/viewFor';
import { Text } from './Text';
import { TruthChip } from './TruthChip';

interface Props {
  readonly items: readonly EvidenceView[];
  readonly persona: Persona;
  readonly labelStyle: 'standard' | 'plain';
  readonly copy: Copy;
  readonly lang: Lang;
  readonly onOpen: (id: string, opener: HTMLButtonElement) => void;
}

/** Status line from the view only. Restricted items show nothing but the restriction. */
export const statusLine = (e: EvidenceView, copy: Copy, lang: Lang): string => {
  if (e.restricted) return copy.restricted;
  if (e.notReadReason) return copy.notRead[e.notReadReason];
  const provider = e.provider ? `{${copy.provider[e.provider]}} · ` : '';
  return `${provider}${formatAge(e.ageMinutes, lang)} · ${copy.freshness[e.freshness]}`;
};

/** Persona-specific title: Owner gets a summary, Nontechnical plain words, Technical the job and ids. */
export const evidenceTitle = (copy: Copy, e: EvidenceView, persona: Persona): string =>
  e.restricted ? copy.restricted : (copy.evidenceItem[e.id]?.[persona] ?? e.id);

/** Evidence items, read and not read. Not-read items stay visible with their reason; restricted items are counted. */
export function EvidenceList({ items, persona, labelStyle, copy, lang, onOpen }: Props) {
  return (
    <section className="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title">{copy.evidenceTitle}</h2>
      <ul className="evidence-list">
        {items.map((e) => (
          <li key={e.id} className={`evidence-item${e.notReadReason || e.restricted ? ' not-read' : ''}`} data-evidence={e.id}>
            <TruthChip label={e.label} style={labelStyle} copy={copy} />
            <span className="evidence-text"><Text s={evidenceTitle(copy, e, persona)} /></span>
            <span className="evidence-status"><Text s={statusLine(e, copy, lang)} /></span>
            <button type="button" className="btn btn-quiet" onClick={(ev) => onOpen(e.id, ev.currentTarget)}>
              <Text s={copy.openEvidence(e.id)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { Lang, Persona } from '../contract/types';
import { formatAge } from '../i18n/format';
import type { Copy } from '../i18n/strings';
import type { EvidenceView } from '../view/viewFor';
import { StateBlock } from './StateBlock';
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

/** Status line from the view only. */
export const statusLine = (e: EvidenceView, copy: Copy, lang: Lang): string => {
  if (e.notReadReason) return copy.notRead[e.notReadReason];
  const provider = e.provider ? `{${copy.provider[e.provider]}} · ` : '';
  return `${provider}${formatAge(e.ageMinutes, lang)} · ${copy.freshness[e.freshness]}`;
};

/** Persona-specific title: Owner gets a summary, Nontechnical plain words, Technical the job and ids. */
export const evidenceTitle = (copy: Copy, e: EvidenceView, persona: Persona): string =>
  copy.evidenceItem[e.id]?.[persona] ?? e.id;

/**
 * Row classes for one evidence item (BACK-62). Not-read and stale/unknown freshness each get their own
 * class, so a stale or unread item never looks like a current one.
 */
export const evidenceRowClass = (e: Pick<EvidenceView, 'notReadReason' | 'freshness'>): string =>
  ['evidence-item', e.notReadReason ? 'not-read' : '', `fresh-${e.freshness}`].filter(Boolean).join(' ');

/** Evidence items, read and not read. Not-read items stay visible with their reason. */
export function EvidenceList({ items, persona, labelStyle, copy, lang, onOpen }: Props) {
  return (
    <section className="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title">{copy.evidenceTitle}</h2>
      {items.length === 0 ? (
        <StateBlock kind="empty" title={copy.noEvidence.title} body={copy.noEvidence.body} />
      ) : (
      <ul className="evidence-list">
        {items.map((e) => (
          <li key={e.id} className={evidenceRowClass(e)} data-evidence={e.id} data-freshness={e.freshness}>
            <TruthChip label={e.label} style={labelStyle} copy={copy} />
            <span className="evidence-text"><Text s={evidenceTitle(copy, e, persona)} /></span>
            <span className="evidence-status"><Text s={statusLine(e, copy, lang)} /></span>
            <button type="button" className="btn btn-quiet" onClick={(ev) => onOpen(e.id, ev.currentTarget)}>
              <Text s={copy.openEvidence(e.id)} />
            </button>
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}

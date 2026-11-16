import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { TruthChip } from '../../components/TruthChip';
import type { EvidenceReference } from '../../contract/types';
import { WORLD } from '../../fixture/world';
import { INVESTIGATION } from '../../i18n/screens/investigation';
import { hrefFor } from '../../nav/routes';
import { evidenceTitleFor } from '../../view/evidence';
import { evidenceStatusText, evidenceTimeline, type TimelineRow } from '../../view/investigationView';

interface Props {
  readonly investigationId: string;
  readonly evidence: readonly EvidenceReference[];
}

/**
 * Evidence ordered by observation time. The title is plain text and the link is separate, because fixture titles can
 * contain words that a control label must never contain. Unread and restricted items have no time, so they are listed
 * apart with their status in words instead of being given a made-up age.
 */
export function TimelinePanel({ investigationId, evidence }: Props) {
  const { persona, lang, copy } = useApp();
  const c = INVESTIGATION[lang];
  const { timed, untimed } = evidenceTimeline(evidence, persona);
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const link = (id: string) => (
    <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id, from: investigationId })}>
      <Text s={c.inspect(id)} />
    </a>
  );
  const items: readonly TimelineItem[] = timed.map((r: TimelineRow) => ({
    id: r.id,
    minutesAgo: r.minutesAgo,
    truth: r.view.label,
    title: <Text s={evidenceTitleFor(WORLD, r.id, persona, lang)} />,
    meta: (
      <>
        <span className="tl-status"><Text s={evidenceStatusText(r.view, copy, lang)} /></span>
        {link(r.id)}
      </>
    ),
  }));
  return (
    <Panel id="inv-timeline-title" title={c.timeline.title} testId="evidence-timeline">
      <p className="note"><Text s={c.timeline.note} /></p>
      <Timeline items={items} label={c.timeline.title} />
      {untimed.length > 0 && (
        <div className="untimed">
          <h3 className="untimed-title">{c.timeline.untimedTitle}</h3>
          <p className="note">{c.timeline.untimedNote}</p>
          <ul className="rows">
            {untimed.map((r) => (
              <li key={r.id} className="row-item untimed-item" data-untimed={r.id}>
                <TruthChip label={r.view.label} style={style} copy={copy} />
                <span><Text s={evidenceTitleFor(WORLD, r.id, persona, lang)} /></span>
                <span className="note"><Text s={evidenceStatusText(r.view, copy, lang)} /></span>
                {link(r.id)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

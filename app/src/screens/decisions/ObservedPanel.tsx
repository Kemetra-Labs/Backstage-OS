import { hrefFor } from '../../nav/routes';
import type { EvidenceRow } from '../../view/decisionView';
import { statusLine } from '../../components/EvidenceList';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import type { EvidenceView } from '../../view/viewFor';
import { useDecisionsUi } from './useDecisionsUi';

const asView = (r: EvidenceRow): EvidenceView => ({
  id: r.id, label: r.label, freshness: r.freshness, ageMinutes: r.ageMinutes, inert: true,
  ...(r.restricted ? { restricted: true as const } : {}),
  ...(r.provider ? { provider: r.provider } : {}),
  ...(r.notReadReason ? { notReadReason: r.notReadReason } : {}),
});

/** Observed facts only: what was read, with provenance. Not-read and restricted items stay listed. */
export function ObservedPanel({ rows, from }: { readonly rows: readonly EvidenceRow[]; readonly from?: string }) {
  const { lang, copy, c, style } = useDecisionsUi();
  return (
    <Panel id="dec-observed" title={c.observedTitle} testId="dec-observed">
      <p className="note">{c.observedNote}</p>
      <ul className="evidence-list">
        {rows.map((r) => (
          <li key={r.id} className={`evidence-item${r.notReadReason || r.restricted ? ' not-read' : ''}`} data-evidence={r.id}>
            <TruthChip label={r.label} style={style} copy={copy} />
            <span className="evidence-text"><Text s={r.title} /></span>
            <span className="evidence-status"><Text s={statusLine(asView(r), copy, lang)} /></span>
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id: r.id, ...(from ? { from } : {}) })}>
              <Text s={c.inspectEvidence(r.id)} />
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { hrefFor } from '../../nav/routes';
import { evidenceTitleFor } from '../../view/evidence';
import { evidenceStatusText } from '../../view/investigationView';
import type { EvidenceView } from '../../view/viewFor';
import { hostCopy } from '../../i18n/host';

interface Props {
  readonly items: readonly EvidenceView[];
  readonly investigationId: string;
}

/** Evidence for a summary case. Each item opens in the Evidence Explorer; there is no drawer here. */
export function EvidenceLinks({ items, investigationId }: Props) {
  const { persona, lang, copy, world } = useApp();
  const c = hostCopy('INVESTIGATION', lang);
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  return (
    <Panel id="sum-evidence-title" title={c.summary.evidenceTitle} testId="summary-evidence">
      <ul className="evidence-list">
        {items.map((e) => (
          <li key={e.id} className={`evidence-item${e.notReadReason ? ' not-read' : ''}`} data-evidence-row={e.id}>
            <TruthChip label={e.label} style={style} copy={copy} />
            <span className="evidence-text"><Text s={evidenceTitleFor(world, e.id, persona, lang)} /></span>
            <span className="evidence-status"><Text s={evidenceStatusText(e, copy, lang)} /></span>
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id: e.id, from: investigationId })}>
              <Text s={c.inspect(e.id)} />
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

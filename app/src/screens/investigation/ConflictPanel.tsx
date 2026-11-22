import { useApp } from '../../app/AppContext';
import { HealthTriad } from '../../components/HealthTriad';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { INVESTIGATION } from '../../i18n/screens/investigation';
import { hrefFor } from '../../nav/routes';
import { evidenceTitleFor } from '../../view/evidence';
import { evidenceStatusText, type ConflictView } from '../../view/investigationView';
import type { EvidenceView } from '../../view/viewFor';

interface Props {
  readonly conflict: ConflictView;
  /** Component name; omitted for Nontechnical, who gets "the affected service". */
  readonly componentName?: string;
}

function Signal({ title, items, investigationId }: { readonly title: string; readonly items: readonly EvidenceView[]; readonly investigationId?: string }) {
  const { persona, lang, copy, world } = useApp();
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const c = INVESTIGATION[lang];
  return (
    <div className="signal">
      <h3 className="signal-title">{title}</h3>
      <ul className="rows">
        {items.map((e) => (
          <li key={e.id} className="row-item" data-signal={e.id}>
            <TruthChip label={e.label} style={style} copy={copy} />
            <span><Text s={evidenceTitleFor(world, e.id, persona, lang)} /></span>
            <span className="note"><Text s={evidenceStatusText(e, copy, lang)} /></span>
            <a className="btn btn-quiet btn-link" href={hrefFor(investigationId ? { name: 'evidence', id: e.id, from: investigationId } : { name: 'evidence', id: e.id })}>
              <Text s={c.inspect(e.id)} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Two observed signals that point different ways. Neither cancels the other; the health shown is the contract's
 * resolved value for the component, which stays degraded and is never healthy while the errors are read.
 */
export function ConflictPanel({ conflict, componentName }: Props) {
  const { lang } = useApp();
  const c = INVESTIGATION[lang].summary.conflict;
  const inv = conflict.component?.investigationId;
  return (
    <Panel id="sum-conflict-title" title={c.title} tone="raised" testId="conflicting-signals">
      <div className="signal-pair">
        <Signal title={c.passing} items={conflict.passing} {...(inv ? { investigationId: inv } : {})} />
        <Signal title={c.opposing} items={conflict.opposing} {...(inv ? { investigationId: inv } : {})} />
      </div>
      <p className="conflict-explain">{c.explain}</p>
      {conflict.triad && (
        <div className="conflict-health">
          <p className="note">{componentName ? <Text s={c.healthOf(componentName)} /> : c.healthOfService}</p>
          <HealthTriad triad={conflict.triad} />
        </div>
      )}
    </Panel>
  );
}

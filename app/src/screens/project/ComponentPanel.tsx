import { useApp } from '../../app/AppContext';
import { HealthTriad } from '../../components/HealthTriad';
import { L, LP } from '../../components/L';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import type { WorldComponent, WorldProject } from '../../contract/world';
import { PROJECT_COPY } from '../../i18n/screens/project';
import { formatAge } from '../../i18n/segments';
import { hrefFor } from '../../nav/routes';
import { attentionFor, linkedEvidence, type LinkedEvidence } from '../../view/projectView';
import { triadOf } from '../../view/world';

function EvidenceRow({ item, caseId }: { readonly item: LinkedEvidence; readonly caseId: string | undefined }) {
  const { copy, lang, persona } = useApp();
  const t = PROJECT_COPY[lang].selected;
  const v = item.view;
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const age = v.freshness === 'stale' && v.ageMinutes !== null ? ` · ${formatAge(v.ageMinutes, lang)}` : '';
  return (
    <li className="row-item" data-evidence={item.id}>
      <p><Text s={item.title} /></p>
      {v.restricted ? (
        <p className="note">{copy.restricted}</p>
      ) : (
        <p className="proj-chips">
          <TruthChip label={v.label} style={style} copy={copy} />
          <span className="note">
            {v.notReadReason ? (
              copy.notRead[v.notReadReason]
            ) : (
              <>
                {v.provider && <><bdi dir="ltr">{copy.provider[v.provider]}</bdi> · </>}
                {copy.freshness[v.freshness]}{age}
              </>
            )}
          </span>
        </p>
      )}
      {v.targetLabel && <p className="note">{t.target}: <bdi dir="ltr" className="ltr">{v.targetLabel}</bdi></p>}
      {!v.restricted && (
        <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id: item.id, ...(caseId ? { from: caseId } : {}) })}>
          <Text s={t.inspect(item.id)} />
        </a>
      )}
    </li>
  );
}

interface Props {
  readonly project: WorldProject;
  readonly component: WorldComponent | undefined;
}

/** The component picked in the URL: its triad, facts, linked evidence and related attention. */
export function ComponentPanel({ project, component }: Props) {
  const { copy, lang, persona, shell, world } = useApp();
  const t = PROJECT_COPY[lang].selected;
  const layerWords = PROJECT_COPY[lang].layer[persona === 'nontechnical' ? 'plain' : 'standard'];

  if (!component) {
    return (
      <Panel id="proj-selected" title={t.title} testId="selected-panel">
        <p className="note" data-testid="selected-hint">{t.hint}</p>
      </Panel>
    );
  }

  const evidence = linkedEvidence(world, project, component, persona, lang);
  const attention = attentionFor(project, component);
  return (
    <Panel id="proj-selected" title={t.title} testId="selected-panel">
      <p className="proj-comp-name" data-selected={component.id}><bdi dir="ltr" className="ltr">{component.name}</bdi></p>
      <HealthTriad triad={triadOf(component.state)} />
      {component.checkFailing && <p className="proj-check" data-testid="ci-failing"><Text s={copy.checkFailing[persona]} /></p>}
      <dl className="kv">
        <dt>{t.environment[persona]}</dt>
        <dd><Text s={copy.env[component.environment]} /></dd>
        <dt>{t.layer[persona]}</dt>
        <dd>{layerWords[component.layer]}</dd>
        {persona === 'technical' && (
          <>
            <dt>{t.componentId}</dt>
            <dd><bdi dir="ltr" className="ltr">{component.id}</bdi></dd>
          </>
        )}
        {component.note && (
          <>
            <dt>{t.note}</dt>
            <dd><L t={component.note} /></dd>
          </>
        )}
      </dl>
      {component.investigationId && (
        <a className="btn btn-link" href={hrefFor({ name: 'investigation', id: component.investigationId })}>
          <Text s={t.openCase(component.investigationId)} />
        </a>
      )}

      <h3 className="proj-sub">{t.evidenceTitle}</h3>
      {evidence.length === 0 ? (
        <StateBlock kind="unknown" body={t.noEvidence} />
      ) : (
        <ul className="rows">
          {evidence.map((e) => <EvidenceRow key={e.id} item={e} caseId={component.investigationId} />)}
        </ul>
      )}

      <h3 className="proj-sub">{t.attentionTitle}</h3>
      {attention.length === 0 ? (
        <p className="note">{t.noAttention}</p>
      ) : (
        <ul className="rows">
          {attention.map((a) => (
            <li key={a.id} className="row-item" data-attention={a.id}>
              <p><span className={`sev sev-${a.severity}`}>{shell.severity[a.severity]}</span></p>
              <p><LP t={a.title} /></p>
            </li>
          ))}
        </ul>
      )}

      <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId: project.id })}>{t.closeSelection}</a>
    </Panel>
  );
}

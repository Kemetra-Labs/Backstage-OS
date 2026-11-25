import { useApp } from '../../app/AppContext';
import { L, LP } from '../../components/L';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import type { Decision, L10n, WorldComponent, WorldProject } from '../../contract/world';
import { hrefFor } from '../../nav/routes';
import { decisionLabel } from '../../view/investigationView';
import { hostCopy } from '../../i18n/host';

/** Sources that could not be read. Missing is shown as a list in words, never as a quiet gap. */
export function MissingPanel({ missing }: { readonly missing: readonly L10n[] }) {
  const { lang } = useApp();
  const c = hostCopy('INVESTIGATION', lang).missing;
  return (
    <Panel id="inv-missing-title" title={c.title} testId="missing-evidence">
      <p className="note"><Text s={c.note} /></p>
      {missing.length === 0 ? (
        <p>{c.none}</p>
      ) : (
        <ul className="rows">
          {missing.map((m, i) => (
            <li key={i} className="row-item"><span><L t={m} /></span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The proposal as a neutral link. Nothing here decides, approves or runs anything. */
export function DecisionPanel({ decision }: { readonly decision: Decision | undefined }) {
  const { lang, persona, copy } = useApp();
  const c = hostCopy('INVESTIGATION', lang).decision;
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  return (
    <Panel id="inv-decision-title" title={c.title} testId="proposed-decision">
      {decision ? (
        <>
          <TruthChip label={decisionLabel(decision)} style={style} copy={copy} />
          <p className="decision-title"><LP t={decision.title} /></p>
          <p className="note"><Text s={c.decidedIn(decision.decidedIn)} /></p>
          <p className="note"><Text s={c.note} /></p>
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'decision', id: decision.id })}>
            <Text s={c.open(decision.id)} />
          </a>
        </>
      ) : (
        <StateBlock kind="empty" body={c.none} />
      )}
    </Panel>
  );
}

interface ContextProps {
  readonly project: WorldProject | undefined;
  readonly component: WorldComponent | undefined;
}

/** Links to the product and component this case belongs to. Nontechnical gets the product only, as in the room header. */
export function ContextPanel({ project, component }: ContextProps) {
  const { lang, persona } = useApp();
  const c = hostCopy('INVESTIGATION', lang).context;
  if (!project) return null;
  return (
    <Panel id="inv-context-title" title={c.title} testId="case-context">
      <p><L t={project.summary} /></p>
      <div className="link-row">
        <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId: project.id })}>
          <Text s={c.viewProject(project.name)} />
        </a>
        {component && persona !== 'nontechnical' && (
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId: project.id, componentId: component.id })}>
            <Text s={c.viewComponent(component.name)} />
          </a>
        )}
      </div>
    </Panel>
  );
}

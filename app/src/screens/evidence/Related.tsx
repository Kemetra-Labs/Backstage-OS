import { useApp } from '../../app/AppContext';
import { LP } from '../../components/L';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import type { InvestigationSummary } from '../../contract/world';
import { EVIDENCE } from '../../i18n/screens/evidence';
import { hrefFor } from '../../nav/routes';
import type { ExplorerView } from '../../view/explorerView';
import { evidenceTitleFor } from '../../view/evidence';
import { evidenceStatusText } from '../../view/investigationView';

const link = (href: string, label: string) => (
  <a className="btn btn-quiet btn-link" href={href}><Text s={label} /></a>
);

/**
 * What cites the item: cases, proposals and the product or component. Titles are plain text and the links carry ids
 * only, so no fixture title ever sits inside a control. Nontechnical gets the product but not the component name.
 */
export function Supporting({ ex }: { readonly ex: ExplorerView }) {
  const { lang, persona } = useApp();
  const c = EVIDENCE[lang].supporting;
  const { citedBy, decisions, project, component } = ex;
  const empty = citedBy.length === 0 && decisions.length === 0 && !project;
  return (
    <Panel id="ex-supporting-title" title={c.title} testId="supporting-entities">
      {empty && <p className="note">{c.none}</p>}
      {citedBy.length > 0 && (
        <div className="support-group">
          <h3 className="support-title">{c.investigations}</h3>
          <ul className="rows">
            {citedBy.map((i) => (
              <li key={i.id} className="row-item">
                <span><LP t={i.title} /></span>
                {link(hrefFor({ name: 'investigation', id: i.id }), c.openCase(i.id))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {decisions.length > 0 && (
        <div className="support-group">
          <h3 className="support-title">{c.decisions}</h3>
          <ul className="rows">
            {decisions.map((d) => (
              <li key={d.id} className="row-item">
                <span><LP t={d.title} /></span>
                {link(hrefFor({ name: 'decision', id: d.id }), c.openProposal(d.id))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {project && (
        <div className="support-group">
          <h3 className="support-title">{c.context}</h3>
          <div className="link-row">
            {link(hrefFor({ name: 'project', projectId: project.id }), c.viewProject(project.name))}
            {component && persona !== 'nontechnical' && !ex.view.restricted &&
              link(hrefFor({ name: 'project', projectId: project.id, componentId: component.id }), c.viewComponent(component.name))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** The other evidence in the same case, as neutral inspect links. Restricted and unread items stay listed. */
export function Siblings({ ex, investigation }: { readonly ex: ExplorerView; readonly investigation: InvestigationSummary }) {
  const { lang, persona, copy, world } = useApp();
  const c = EVIDENCE[lang].siblings;
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  return (
    <Panel id="ex-siblings-title" title={<Text s={c.title(investigation.id)} />} testId="sibling-evidence">
      {ex.siblings.length === 0 ? (
        <p className="note">{c.none}</p>
      ) : (
        <ul className="rows">
          {ex.siblings.map((s) => (
            <li key={s.id} className="row-item" data-sibling={s.id}>
              <TruthChip label={s.label} style={style} copy={copy} />
              <span><Text s={evidenceTitleFor(world, s.id, persona, lang)} /></span>
              <span className="note"><Text s={evidenceStatusText(s, copy, lang)} /></span>
              {link(hrefFor({ name: 'evidence', id: s.id, from: investigation.id }), c.inspect(s.id))}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

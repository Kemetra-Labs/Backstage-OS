import { useApp } from '../app/AppContext';
import { formatAge } from '../i18n/format';
import { hrefFor } from '../nav/routes';
import { decisionDetailView } from '../view/decisionView';
import { Panel } from '../components/Panel';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateBlock } from '../components/StateBlock';
import { Text } from '../components/Text';
import { TruthChip } from '../components/TruthChip';
import { FuturePanel } from './decisions/FuturePanel';
import { Notice } from './decisions/Notice';
import { ObservedPanel } from './decisions/ObservedPanel';
import { OptionsPanel } from './decisions/OptionsPanel';
import { useDecisionsUi } from './decisions/useDecisionsUi';
import '../styles/screens/decisions.css';

/** Decision detail (BACK-13). Everything is display: no option is selectable and nothing here decides. */
export function DecisionDetail({ id }: { readonly id: string }) {
  const { persona, lang, copy, shell, c, style } = useDecisionsUi();
  const { world } = useApp();
  const v = decisionDetailView(world, id, persona, lang);
  const inbox = { label: shell.nav.decisions, href: hrefFor({ name: 'decisions' }) };

  if (!v) {
    return (
      <div className="dec-screen" data-screen="decision-detail">
        <ScreenHeader title={c.detailTitle} crumbs={[inbox, { label: `{${id}}` }]} />
        <StateBlock kind="error" title={c.error.title} body={c.error.body}>
          <a className="btn btn-quiet btn-link" href={inbox.href}>{c.error.open}</a>
        </StateBlock>
      </div>
    );
  }

  return (
    <div className="dec-screen" data-screen="decision-detail">
      <ScreenHeader
        title={c.detailTitle}
        crumbs={[inbox, { label: `{${v.id}}` }]}
        lede={(
          <>
            <span className="dec-headline"><Text s={v.title} /></span>
            <span className="dec-chips">
              <TruthChip label={v.label} style={style} copy={copy} />
              <span className={`sev sev-${v.priority}`}>{c.priority}: {shell.severity[v.priority]}</span>
            </span>
          </>
        )}
        meta={
          <>
            <li><bdi dir="ltr">{v.id}</bdi></li>
            <li>{c.project}: <Text s={`{${v.projectName}}`} /></li>
            <li>{c.age} {formatAge(v.ageMinutes, lang)}</li>
            {!v.proposed && <li>{c.historicalBadge}</li>}
          </>
        }
      />
      <Notice />

      <Panel id="dec-context" title={c.contextTitle} testId="dec-context">
        <p><Text s={v.context} /></p>
      </Panel>

      <ObservedPanel rows={v.observed} {...(v.investigationId ? { from: v.investigationId } : {})} />

      <div className="grid-2">
        <Panel id="dec-hypotheses" title={c.hypothesesTitle} testId="dec-hypotheses">
          {v.hypotheses.length === 0 ? <p>{c.hypothesesNone}</p> : (
            <ul className="dec-statements">
              {v.hypotheses.map((h, i) => (
                <li key={i}><TruthChip label="hypothesis" style={style} copy={copy} /><span><Text s={h} /></span></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel id="dec-unknowns" title={c.unknownsTitle} testId="dec-unknowns">
          {v.unknowns.length === 0 ? <p>{c.unknownsNone}</p> : (
            <ul className="dec-statements">
              {v.unknowns.map((u, i) => (
                <li key={i}><TruthChip label="unknown" style={style} copy={copy} /><span><Text s={u} /></span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <OptionsPanel options={v.options} />

      <Panel id="dec-next" title={style === 'plain' ? c.nextTitlePlain : c.nextTitle} testId="dec-next">
        {v.proposed && <TruthChip label="proposed" style={style} copy={copy} />}
        <p className="dec-next-text"><Text s={v.nextStep} /></p>
        <p className="note"><Text s={c.decidedIn(v.decidedIn)} /></p>
      </Panel>

      <Panel id="dec-links" title={c.linksTitle} testId="dec-links">
        <div className="dec-links">
          {v.investigationId && (
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: v.investigationId })}>
              <Text s={c.openCase(v.investigationId)} />
            </a>
          )}
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId: v.projectId })}>
            <Text s={c.viewProject(v.projectName)} />
          </a>
        </div>
      </Panel>

      <FuturePanel />
    </div>
  );
}

import { useApp } from '../../app/AppContext';
import { LP } from '../../components/L';
import { Panel } from '../../components/Panel';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { formatAge } from '../../i18n/format';
import { hrefFor } from '../../nav/routes';
import { crumbTrail, summaryFor } from '../../view/investigationView';
import { ConflictPanel } from './ConflictPanel';
import { EvidenceLinks } from './EvidenceLinks';
import { ContextPanel, DecisionPanel, MissingPanel } from './panels';
import { hostCopy } from '../../i18n/host';

/** Unknown case id: an error state with ways back, never a blank page. */
export function CaseNotFound({ id }: { readonly id: string }) {
  const { lang, copy, shell } = useApp();
  const c = hostCopy('INVESTIGATION', lang);
  return (
    <>
      <ScreenHeader
        title={copy.h1}
        crumbs={crumbTrail([copy.crumbs[0] ?? '', `{${id}}`], [hrefFor({ name: 'portfolio' }), undefined])}
      />
      <StateBlock kind="error" title={c.notFound.title} body={c.notFound.body}>
        <div className="link-row">
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'home' })}>{shell.notFound.home}</a>
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'portfolio' })}>{shell.nav.portfolio}</a>
        </div>
      </StateBlock>
    </>
  );
}

/**
 * Summary room for cases without a full room (INV-DEMO-9). It is built from the same world as the Explorer: no
 * hand-written health, and every evidence item opens in the Evidence Explorer rather than a drawer.
 */
export function SummaryRoom({ id }: { readonly id: string }) {
  const { persona, lang, copy, world } = useApp();
  const s = summaryFor(world, id, persona);
  if (!s) return <CaseNotFound id={id} />;
  const c = hostCopy('INVESTIGATION', lang);
  const { investigation: inv, project, component, decision, conflict } = s;
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const crumbs = project
    ? crumbTrail(
        [copy.crumbs[0] ?? '', `{${project.name}}`, `{${inv.id}}`],
        [hrefFor({ name: 'portfolio' }), hrefFor({ name: 'project', projectId: project.id }), undefined],
      )
    : crumbTrail([copy.crumbs[0] ?? '', `{${inv.id}}`], [hrefFor({ name: 'portfolio' }), undefined]);
  const meta = (
    <>
      <li><bdi dir="ltr">{inv.id}</bdi></li>
      {project && <li><bdi dir="ltr">{project.name}</bdi></li>}
      {component && persona !== 'nontechnical' && <li><bdi dir="ltr">{component.name}</bdi></li>}
      <li>{copy.started} {formatAge(inv.startedMinutesAgo, lang)}</li>
    </>
  );
  return (
    <>
      <ScreenHeader title={copy.h1} crumbs={crumbs} lede={<LP t={inv.title} />} meta={meta} />
      <p className="note summary-note" data-testid="summary-note"><Text s={c.summary.fullRoomNote} /></p>
      {conflict && (
        <ConflictPanel
          conflict={conflict}
          {...(component && persona !== 'nontechnical' ? { componentName: component.name } : {})}
        />
      )}
      <EvidenceLinks items={s.evidence} investigationId={inv.id} />
      <div className="grid-2">
        <Panel id="sum-hypothesis-title" title={c.summary.hypothesis.title} testId="summary-hypothesis">
          <TruthChip label="hypothesis" style={style} copy={copy} />
          <p><Text s={c.summary.hypothesis.text[persona]} /></p>
          <p className="note"><Text s={c.summary.hypothesis.note} /></p>
        </Panel>
        <Panel id="sum-impact-title" title={c.summary.impact.title} testId="summary-impact">
          <TruthChip label="unknown" style={style} copy={copy} />
          <p><strong>{c.summary.impact.label}:</strong> <Text s={c.summary.impact.text[persona]} /></p>
        </Panel>
      </div>
      <div className="grid-2">
        <MissingPanel missing={inv.missing} />
        <DecisionPanel decision={decision} />
      </div>
      <ContextPanel project={project} component={component} />
      <p>
        <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: 'INV-DEMO-7' })}>
          <Text s={c.summary.openFullRoom('INV-DEMO-7')} />
        </a>
      </p>
    </>
  );
}

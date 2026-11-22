import type { ReactNode } from 'react';
import '../styles/screens/evidence.css';
import { useApp } from '../app/AppContext';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Panel } from '../components/Panel';
import { StateBlock } from '../components/StateBlock';
import { Text } from '../components/Text';
import { TruthChip } from '../components/TruthChip';
import { EVIDENCE } from '../i18n/screens/evidence';
import { hrefFor } from '../nav/routes';
import { explorerFor } from '../view/explorerView';
import { evidenceTitleFor } from '../view/evidence';
import { crumbTrail } from '../view/investigationView';
import { ExplorerDetails } from './evidence/ExplorerDetails';
import { Siblings, Supporting } from './evidence/Related';

interface HeaderProps {
  readonly id: string;
  readonly crumbs: ReturnType<typeof crumbTrail>;
  readonly children?: ReactNode;
}

/**
 * The same markup as ScreenHeader, with the h1 rendered through Text: ScreenHeader takes a plain string, so an id in
 * braces would show literally and could not be isolated left to right in Arabic.
 */
function ExplorerHeader({ id, crumbs, children }: HeaderProps) {
  const { lang } = useApp();
  return (
    <div className="screen-head">
      <Breadcrumbs items={crumbs} />
      <h1><Text s={EVIDENCE[lang].h1(id)} /></h1>
      {children}
    </div>
  );
}

/** Evidence Explorer: one evidence item, what is known about it, what cites it and its neighbours in the case. */
export function Evidence({ id, from }: { readonly id: string; readonly from?: string }) {
  const { persona, lang, copy, shell, world, investigation: demo } = useApp();
  const c = EVIDENCE[lang];
  const ex = explorerFor(world, id, persona, from, demo.rawOutput);
  const portfolio = copy.crumbs[0] ?? '';

  if (!ex) {
    return (
      <>
        <ExplorerHeader id={id} crumbs={crumbTrail([portfolio, `{${id}}`], [hrefFor({ name: 'portfolio' }), undefined])} />
        <StateBlock kind="error" title={c.notFound.title} body={c.notFound.body(id)}>
          <div className="link-row">
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'home' })}>{shell.notFound.home}</a>
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'portfolio' })}>{c.openPortfolio}</a>
          </div>
        </StateBlock>
      </>
    );
  }

  const { view, investigation, project } = ex;
  const labels = [portfolio, ...(project ? [`{${project.name}}`] : []), ...(investigation ? [`{${investigation.id}}`] : []), `{${id}}`];
  const hrefs = [
    hrefFor({ name: 'portfolio' }),
    ...(project ? [hrefFor({ name: 'project', projectId: project.id })] : []),
    ...(investigation ? [hrefFor({ name: 'investigation', id: investigation.id })] : []),
    undefined,
  ];
  const style = persona === 'nontechnical' ? 'plain' : 'standard';

  return (
    <>
      <ExplorerHeader id={id} crumbs={crumbTrail(labels, hrefs)}>
        <div className="case explorer-lead">
          <TruthChip label={view.label} style={style} copy={copy} />
          <p className="case-title" data-testid="evidence-title"><Text s={evidenceTitleFor(world, id, persona, lang)} /></p>
          {investigation && (
            <p>
              <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: investigation.id })} data-testid="back-link">
                <Text s={c.back(investigation.id)} />
              </a>
            </p>
          )}
        </div>
      </ExplorerHeader>
      <div className="grid-main-side">
        <div className="explorer-main">
          <ExplorerDetails ex={ex} />
          <Panel id="ex-class-title" title={c.classification.title} testId="classification">
            <p><Text s={c.classification.text[view.label]} /></p>
          </Panel>
        </div>
        <div className="explorer-side">
          <Supporting ex={ex} />
          {investigation && <Siblings ex={ex} investigation={investigation} />}
        </div>
      </div>
    </>
  );
}

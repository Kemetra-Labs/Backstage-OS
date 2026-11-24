import { Fragment, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { EVIDENCE } from '../../i18n/screens/evidence';
import { formatAge } from '../../i18n/format';
import type { ExplorerView } from '../../view/explorerView';

const row = (k: string, v: ReactNode, key: string) => (
  <Fragment key={key}>
    <dt>{k}</dt>
    <dd data-field={key}>{v}</dd>
  </Fragment>
);

/**
 * The fields of one evidence item. Restricted and not-read items get a state block with the reason instead of a
 * field list, so a missing value is never a blank and never a zero. Every field comes from the persona view.
 */
export function ExplorerDetails({ ex }: { readonly ex: ExplorerView }) {
  const { lang, copy } = useApp();
  const c = EVIDENCE[lang];
  const v = ex.view;

  if (v.restricted) {
    return (
      <Panel id="ex-details-title" title={c.details} testId="evidence-details">
        <StateBlock kind="restricted" body={c.restrictedBody} />
      </Panel>
    );
  }
  if (v.notReadReason && v.notReadReason !== 'restricted') {
    return (
      <Panel id="ex-details-title" title={c.details} testId="evidence-details">
        <StateBlock kind={v.notReadReason} title={copy.notRead[v.notReadReason]} body={c.notReadBody} />
      </Panel>
    );
  }
  if (v.notReadReason === 'restricted') {
    return (
      <Panel id="ex-details-title" title={c.details} testId="evidence-details">
        <StateBlock kind="restricted" body={c.restrictedBody} />
      </Panel>
    );
  }

  const f = c.fields;
  const age = v.freshness === 'stale' || v.freshness === 'current' ? ` · ${formatAge(v.ageMinutes, lang)}` : '';
  return (
    <>
      <Panel id="ex-details-title" title={c.details} testId="evidence-details">
        <dl className="kv explorer-fields">
          {v.provider && row(f.source, <bdi dir="ltr">{copy.provider[v.provider]}</bdi>, 'source')}
          {v.observedAt && row(f.observedAt, <bdi dir="ltr" className="ltr">{v.observedAt}</bdi>, 'observedAt')}
          {v.ingestedAt && row(f.readAt, <bdi dir="ltr" className="ltr">{v.ingestedAt}</bdi>, 'readAt')}
          {row(f.freshness, `${copy.freshness[v.freshness]}${age}`, 'freshness')}
          {v.environment && row(f.environment, <Text s={copy.env[v.environment]} />, 'environment')}
          {v.targetLabel && row(f.target, <bdi dir="ltr" className="ltr">{v.targetLabel}</bdi>, 'target')}
          {v.externalId && row(f.id, <bdi dir="ltr" className="ltr">{v.externalId}</bdi>, 'externalId')}
          {v.rule && row(f.rule, <bdi dir="ltr">{v.rule}</bdi>, 'rule')}
          {v.url && row(
            f.link,
            v.inert
              ? <><bdi dir="ltr" className="ltr inert-link">{v.url}</bdi> <span className="note">({f.inertNote})</span></>
              : <a href={v.url} target="_blank" rel="noopener noreferrer"><bdi dir="ltr" className="ltr">{v.url}</bdi></a>,
            'link',
          )}
        </dl>
        <p className="note" data-testid="freshness-note">{c.freshnessNote[v.freshness]}</p>
      </Panel>
      {v.rawOutput && (
        <Panel id="ex-raw-title" title={c.raw} testId="raw-output">
          <pre className="raw" dir="ltr">{v.rawOutput}</pre>
        </Panel>
      )}
    </>
  );
}

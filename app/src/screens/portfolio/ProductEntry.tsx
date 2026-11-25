import { useApp } from '../../app/AppContext';
import { HealthTriad } from '../../components/HealthTriad';
import { L } from '../../components/L';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { hrefFor } from '../../nav/routes';
import type { ProductEntry as Entry } from '../../view/portfolioView';
import { bucketWords } from '../home/SourceHealth';
import { hostCopy } from '../../i18n/host';

/** One product: summary, the three-part triad, source states in words, counts (or "not read") and a link in. */
export function ProductEntry({ entry }: { readonly entry: Entry }) {
  const { lang, persona } = useApp();
  const c = hostCopy('PORTFOLIO_COPY', lang);
  const f = c.fields;
  const notRead = f.notRead;
  const count = (n: number | null): string => (n === null ? notRead : String(n));
  const sources = bucketWords(entry.buckets, c.sourceWords).join(' · ');

  return (
    <Panel
      id={`pf-${entry.id}`}
      title={<bdi dir="ltr">{entry.name}</bdi>}
      aside={persona === 'technical' ? <bdi dir="ltr">{entry.id}</bdi> : undefined}
      testId={`product-${entry.id}`}
      className="pf-entry"
    >
      <div className="pf-entry-body">
        <div className="pf-entry-lead">
          <p className="pf-summary"><L t={entry.summary} /></p>
          <HealthTriad triad={entry.triad} />
          <p className="pf-status" data-status={entry.status}>{c.status[entry.status][persona]}</p>
          {entry.status === 'notSetUp' && <StateBlock kind="not_configured" body={c.notSetUpBody} />}
        </div>
        <dl className="kv pf-kv">
          <dt>{f.sources}</dt>
          <dd>{sources}</dd>
          <dt>{f.attention}</dt>
          <dd data-count="attention">{count(entry.attentionCount)}</dd>
          {persona !== 'nontechnical' && (
            <>
              <dt>{f.investigations}</dt>
              <dd data-count="investigations">{count(entry.openInvestigations)}</dd>
              <dt>{f.proposals}</dt>
              <dd data-count="proposals">{count(entry.proposals)}</dd>
            </>
          )}
          {entry.detail && (
            <>
              <dt>{f.components}</dt>
              <dd>{entry.detail.componentCount}</dd>
              <dt>{f.environments}</dt>
              <dd>
                {entry.detail.environments.length === 0
                  ? notRead
                  : entry.detail.environments.map((e, i) => (
                      <span key={e}>{i > 0 ? ', ' : ''}<Text s={c.env[e]} /></span>
                    ))}
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="pf-links">
        <a className="btn btn-link" href={hrefFor({ name: 'project', projectId: entry.id })}>
          <Text s={c.viewProduct(entry.name)} />
        </a>
      </div>
    </Panel>
  );
}

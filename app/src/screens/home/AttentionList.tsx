import { useApp } from '../../app/AppContext';
import { LP } from '../../components/L';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { hrefFor } from '../../nav/routes';
import type { HomeAttention } from '../../view/homeView';
import { EvidenceChips } from './EvidenceChips';
import { hostCopy } from '../../i18n/host';

/** Attention across products, highest severity first. The first item is the lead and gets the strongest treatment. */
export function AttentionList({ items }: { readonly items: readonly HomeAttention[] }) {
  const { lang, persona, shell } = useApp();
  const h = hostCopy('HOME_COPY', lang);
  if (items.length === 0) return <StateBlock kind="empty" body={h.attention.none} />;
  return (
    <ul className="home-att-list">
      {items.map((a, i) => (
        <li key={a.id} className={`home-att${i === 0 ? ' home-att-lead' : ''}`} data-attention={a.id}>
          <div className="home-att-head">
            <span className={`sev sev-${a.severity}`}>{shell.severity[a.severity]}</span>
            <bdi dir="ltr" className="home-product">{a.projectName}</bdi>
          </div>
          <p className="home-att-title"><LP t={a.title} /></p>
          <EvidenceChips items={a.evidence} showIds={persona === 'technical'} />
          <div className="home-links">
            {a.investigationId && (
              <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: a.investigationId })}>
                <Text s={h.openCase(a.investigationId)} />
              </a>
            )}
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'project', projectId: a.projectId })}>
              <Text s={h.viewProduct(a.projectName)} />
            </a>
            {a.decisionId && (
              <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'decision', id: a.decisionId })}>
                <Text s={h.openProposal(a.decisionId)} />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

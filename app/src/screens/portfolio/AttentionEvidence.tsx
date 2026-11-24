import { useApp } from '../../app/AppContext';
import { LP } from '../../components/L';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { PORTFOLIO_COPY } from '../../i18n/screens/portfolio';
import { formatAge } from '../../i18n/format';
import { hrefFor } from '../../nav/routes';
import type { AttentionEntry, EvidenceRow } from '../../view/portfolioView';

/** Where an evidence item came from: provider and age, or why it was not read. Restricted items say restricted. */
function Provenance({ row }: { readonly row: EvidenceRow }) {
  const { copy, lang } = useApp();
  const v = row.view;
  if (v.restricted) return <span data-provenance="restricted">{copy.restricted}</span>;
  if (v.notReadReason) return <span data-provenance="not-read">{copy.notRead[v.notReadReason]}</span>;
  const c = PORTFOLIO_COPY[lang];
  return (
    <span data-provenance="read">
      {v.provider ? <bdi dir="ltr">{copy.provider[v.provider]}</bdi> : c.provenance.noProvider}
      {' · '}{copy.freshness[v.freshness]}{' · '}{formatAge(v.ageMinutes, lang)}
    </span>
  );
}

function EvidenceItem({ row, from }: { readonly row: EvidenceRow; readonly from: string | undefined }) {
  const { copy, persona, lang } = useApp();
  const c = PORTFOLIO_COPY[lang];
  const v = row.view;
  return (
    <li className="pf-ev" data-evidence-row={v.id}>
      <TruthChip label={v.label} style={persona === 'nontechnical' ? 'plain' : 'standard'} copy={copy} />
      <span className="pf-ev-text">
        <span><Text s={row.title} /></span>
        <span className="note"><Provenance row={row} /></span>
      </span>
      {!v.restricted && (
        <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id: v.id, ...(from ? { from } : {}) })}>
          <Text s={c.inspect(v.id)} />
        </a>
      )}
    </li>
  );
}

export function AttentionEvidence({ items, empty }: { readonly items: readonly AttentionEntry[]; readonly empty: 'none' | 'notSetUp' | null }) {
  const { lang, persona, shell } = useApp();
  const c = PORTFOLIO_COPY[lang];
  if (items.length === 0) {
    return empty === 'notSetUp'
      ? <StateBlock kind="not_configured" body={c.attentionList.notSetUp} />
      : <StateBlock kind="empty" body={c.attentionList.empty} />;
  }
  return (
    <ul className="pf-att-list">
      {items.map((a) => (
        <li key={a.id} className="pf-att" data-attention={a.id}>
          <div className="pf-att-head">
            <span className={`sev sev-${a.severity}`}>{shell.severity[a.severity]}</span>
            <bdi dir="ltr" className="home-product">{a.projectName}</bdi>
            {persona === 'technical' && a.componentId && (
              <span className="note">{c.attentionList.component}: <bdi dir="ltr">{a.componentId}</bdi></span>
            )}
          </div>
          <p className="pf-att-title"><LP t={a.title} /></p>
          <ul className="pf-ev-list" aria-label={c.attentionList.evidence}>
            {a.evidence.map((row) => <EvidenceItem key={row.view.id} row={row} from={a.investigationId} />)}
          </ul>
          <div className="home-links">
            {a.investigationId && (
              <a className="btn btn-link" href={hrefFor({ name: 'investigation', id: a.investigationId })}>
                <Text s={c.openCase(a.investigationId)} />
              </a>
            )}
            {a.decisionId && (
              <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'decision', id: a.decisionId })}>
                <Text s={c.openProposal(a.decisionId)} />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

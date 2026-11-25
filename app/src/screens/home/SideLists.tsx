import { useApp } from '../../app/AppContext';
import { LP } from '../../components/L';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { formatAge } from '../../i18n/format';
import { hrefFor } from '../../nav/routes';
import type { HomeDecision, HomeInvestigation } from '../../view/homeView';
import { hostCopy } from '../../i18n/host';

export function InvestigationPreviews({ items }: { readonly items: readonly HomeInvestigation[] }) {
  const { lang } = useApp();
  const h = hostCopy('HOME_COPY', lang);
  if (items.length === 0) return <StateBlock kind="empty" />;
  return (
    <ul className="rows">
      {items.map((i) => (
        <li key={i.id} className="row-item" data-investigation={i.id}>
          <p className="home-row-title"><LP t={i.title} /></p>
          <p className="note">
            <bdi dir="ltr">{i.projectName}</bdi> · {h.investigations.started(formatAge(i.startedMinutesAgo, lang))} · {h.investigations.evidenceCount(i.evidenceCount)}
          </p>
          <div className="home-links">
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: i.id })}>
              <Text s={h.openCase(i.id)} />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProposalPreviews({ items }: { readonly items: readonly HomeDecision[] }) {
  const { lang, shell } = useApp();
  const h = hostCopy('HOME_COPY', lang);
  if (items.length === 0) return <StateBlock kind="empty" />;
  return (
    <ul className="rows">
      {items.map((d) => (
        <li key={d.id} className="row-item" data-decision={d.id}>
          <div className="home-att-head">
            <span className={`sev sev-${d.priority}`}>{h.proposals.priority}: {shell.severity[d.priority]}</span>
            <bdi dir="ltr" className="home-product">{d.projectName}</bdi>
          </div>
          <p className="home-row-title"><LP t={d.title} /></p>
          <p className="note">{h.proposals.drafted(formatAge(d.ageMinutes, lang))}</p>
          <div className="home-links">
            <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'decision', id: d.id })}>
              <Text s={h.openProposal(d.id)} />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

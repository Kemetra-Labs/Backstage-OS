import { Text } from '../../components/Text';
import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { formatAge } from '../../i18n/format';
import { hrefFor } from '../../nav/routes';
import type { Risks } from '../../view/projectView';
import { hostCopy } from '../../i18n/host';

interface Props {
  readonly projectId: string;
  readonly risks: Risks;
  readonly hasComponents: boolean;
}

/** Unknowns, unconfirmed links and sources not current. Nothing here is ever drawn green. */
export function RisksPanel({ projectId, risks, hasComponents }: Props) {
  const { copy, lang, shell } = useApp();
  const t = hostCopy('PROJECT_COPY', lang).risks;
  return (
    <Panel id="proj-risks" title={t.title} testId="risks-panel">
      <p className="note"><Text s={t.intro} /></p>

      <h3 className="proj-sub">{t.unknownTitle}</h3>
      {!hasComponents ? (
        <p className="note">{t.nothingMapped}</p>
      ) : risks.unknown.length === 0 ? (
        <p className="note">{t.unknownNone}</p>
      ) : (
        <ul className="rows" data-testid="risk-unknown">
          {risks.unknown.map((u) => (
            <li key={u.id} className="row-item" data-risk-component={u.id} data-reason={u.reason}>
              <a className="proj-comp-link" href={hrefFor({ name: 'project', projectId, componentId: u.id })}>
                <bdi dir="ltr" className="ltr">{u.name}</bdi>
              </a>
              <span className="note">{copy.health.unknown} · {t.reason[u.reason]}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="proj-sub">{t.edgesTitle}</h3>
      {risks.edges.length === 0 ? (
        <p className="note">{t.edgesNone}</p>
      ) : (
        <ul className="rows" data-testid="risk-edges">
          {risks.edges.map((e) => (
            <li key={`${e.from}-${e.to}`} className="row-item" data-risk-edge={`${e.from}->${e.to}`} data-kind={e.kind}>
              <span>
                {shell.map.from} <bdi dir="ltr" className="ltr">{e.fromName}</bdi> · {shell.map.to} <bdi dir="ltr" className="ltr">{e.toName}</bdi>
              </span>
              <span className="note">{shell.edge[e.kind]}: {shell.edgeNote[e.kind]}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="proj-sub">{t.sourcesTitle}</h3>
      {risks.sources.length === 0 ? (
        <p className="note">{t.sourcesNone}</p>
      ) : (
        <ul className="rows" data-testid="risk-sources">
          {risks.sources.map((s) => (
            <li key={s.provider} className="row-item" data-risk-source={s.provider}>
              <span><bdi dir="ltr" className="ltr">{copy.provider[s.provider]}</bdi></span>
              <span className="note">
                {copy.connectivity[s.connectivity]}
                {s.connectivity !== 'not_configured' && ` · ${copy.freshness[s.freshness]} · ${formatAge(s.ageMinutes, lang)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

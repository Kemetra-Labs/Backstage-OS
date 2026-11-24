import { useApp } from '../../app/AppContext';
import { HealthTriad } from '../../components/HealthTriad';
import { Panel } from '../../components/Panel';
import { StateBlock } from '../../components/StateBlock';
import { formatAge } from '../../i18n/format';
import { PROJECT_COPY } from '../../i18n/screens/project';
import type { SourceRow } from '../../view/projectView';
import type { Triad } from '../../view/world';

interface Props {
  readonly triad: Triad;
  readonly sources: readonly SourceRow[];
}

/** Product health triad and every source: provider, connectivity, freshness and age, in words. */
export function StatusPanel({ triad, sources }: Props) {
  const { copy, lang } = useApp();
  const t = PROJECT_COPY[lang].status;
  return (
    <Panel id="proj-status" title={t.title} tone="raised" testId="status-panel">
      <HealthTriad triad={triad} />
      {triad.connectivity === 'not_configured' && <StateBlock kind="not_configured" title={t.notConfiguredTitle} body={t.notConfiguredBody} />}
      <div className="sources">
        <h3 className="proj-sub">{t.sources}</h3>
        <ul aria-label={t.sources}>
          {sources.map((s) => (
            <li key={s.provider} className={`source conn-${s.connectivity} fresh-${s.freshness}`} data-provider={s.provider}>
              <bdi dir="ltr" className="source-name">{copy.provider[s.provider]}</bdi>
              <span className="source-dim" data-dim="connectivity">{copy.connectivity[s.connectivity]}</span>
              {s.connectivity !== 'not_configured' && (
                <span className="source-dim" data-dim="freshness">
                  {copy.freshness[s.freshness]} · {s.ageMinutes === null ? t.neverRead : formatAge(s.ageMinutes, lang)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

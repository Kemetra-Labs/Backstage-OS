import { useApp } from '../../app/AppContext';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { PROJECT_COPY } from '../../i18n/screens/project';
import { formatAge } from '../../i18n/format';
import type { DeliveryRow } from '../../view/projectView';

/** CI and delivery items. Labels come from deliveryLabelFor, so Owner and Nontechnical never see job names or run ids. */
export function DeliveryPanel({ rows }: { readonly rows: readonly DeliveryRow[] }) {
  const { copy, lang, persona } = useApp();
  const t = PROJECT_COPY[lang].delivery;
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  return (
    <Panel id="proj-delivery" title={t.title} testId="delivery-panel">
      <p className="note"><Text s={t.intro} /></p>
      {rows.length === 0 ? (
        <p className="note">{t.empty}</p>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.id} className="row-item" data-delivery={r.id} data-status={r.status}>
              <p><Text s={r.label} /></p>
              <p className="proj-chips">
                <span className={`proj-state proj-state-${r.status}`}>{t.statusLabel}: {t.status[r.status]}</span>
                {r.notReadReason ? (
                  <>
                    <TruthChip label="unknown" style={style} copy={copy} />
                    <span className="note">{copy.notRead[r.notReadReason]}</span>
                  </>
                ) : (
                  <>
                    <TruthChip label={r.truth} style={style} copy={copy} />
                    <span className="note">
                      {copy.freshness[r.freshness]}{r.freshness === 'stale' && r.ageMinutes !== null ? ` · ${formatAge(r.ageMinutes, lang)}` : ''}
                    </span>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

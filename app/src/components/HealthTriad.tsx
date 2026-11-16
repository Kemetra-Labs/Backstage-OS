import { useApp } from '../app/AppContext';
import { formatAge } from '../i18n/segments';
import type { Triad } from '../view/world';

/**
 * Source connectivity, evidence freshness and target health as three separate marks (Blueprint v4 §1).
 * Health is already resolved by the contract (triadOf), so unknown can never render as healthy here.
 */
export function HealthTriad({ triad, compact = false }: { readonly triad: Triad; readonly compact?: boolean }) {
  const { copy, shell, lang } = useApp();
  const showAge = triad.freshness === 'stale' && triad.ageMinutes !== null;
  return (
    <dl className={`triad${compact ? ' triad-compact' : ''}`}>
      <div className={`triad-item conn-${triad.connectivity}`} data-dim="connectivity">
        <dt>{shell.triad.connectivity}</dt>
        <dd>{copy.connectivity[triad.connectivity]}</dd>
      </div>
      <div className={`triad-item fresh-${triad.freshness}`} data-dim="freshness">
        <dt>{shell.triad.freshness}</dt>
        <dd>{copy.freshness[triad.freshness]}{showAge ? ` · ${formatAge(triad.ageMinutes, lang)}` : ''}</dd>
      </div>
      <div className={`triad-item health-${triad.health}`} data-dim="health">
        <dt>{shell.triad.health}</dt>
        <dd data-health={triad.health}>{copy.health[triad.health]}</dd>
      </div>
    </dl>
  );
}

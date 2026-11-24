// Source read rows: provider, words for connectivity and freshness, age against the freshness target.
import { useLens } from '../useLens';
import type { SourceStatus } from '../logic/status';
import { Age, Provider_ } from './ui';

export function SourceRows({ items, narrow }: { readonly items: readonly SourceStatus[]; readonly narrow?: boolean }) {
  const { copy, t } = useLens();
  return (
    <ul className={`kv2-srcrows${narrow ? " kv2-srcrows-insp" : ""}`}>
      {items.map((s) => (
        <li key={s.provider} data-conn={s.connectivity} data-fresh={s.freshness}>
          <Provider_ p={s.provider} />
          <span className="kv2-srcwords">{copy.connectivity[s.connectivity]}, {copy.freshness[s.freshness]}</span>
          <span className="kv2-bar" role="img" aria-label={t('obs.read.age', { a: s.ageMinutes ?? t('not.read'), m: s.ttlMinutes })} data-over={s.used > 1 || undefined}>
            <span style={{ inlineSize: `${Math.min(1, s.used) * 100}%` }} />
          </span>
          <span className="kv2-srcage"><Age minutes={s.ageMinutes} /></span>
        </li>
      ))}
    </ul>
  );
}

import { freshnessOf } from '../contract/rules';
import type { Lang, SourceAuthority } from '../contract/types';
import { formatAge } from '../i18n/segments';
import type { Copy } from '../i18n/strings';

interface Props {
  readonly source: SourceAuthority;
  readonly copy: Copy;
  readonly lang: Lang;
}

/** One source, two independent dimensions: connectivity and freshness. Target health is shown on the target, not here. */
export function SourceChip({ source, copy, lang }: Props) {
  const freshness = freshnessOf(source);
  const showAge = source.connectivity !== 'not_configured' && source.ageMinutes !== null;
  return (
    <li className={`source conn-${source.connectivity} fresh-${freshness}`} data-provider={source.provider}>
      <bdi dir="ltr" className="source-name">{copy.provider[source.provider]}</bdi>
      <span className="source-dim" data-dim="connectivity">{copy.connectivity[source.connectivity]}</span>
      {source.connectivity !== 'not_configured' && (
        <span className="source-dim" data-dim="freshness">
          {copy.freshness[freshness]}
          {showAge && freshness !== 'current' ? ` · ${formatAge(source.ageMinutes, lang)}` : ''}
        </span>
      )}
    </li>
  );
}

import { useApp } from '../../app/AppContext';
import { HealthTriad } from '../../components/HealthTriad';
import type { HomeSourceHealth } from '../../view/homeView';
import type { SourceBuckets } from '../../view/portfolioView';
import { hostCopy } from '../../i18n/host';

export interface BucketWords {
  readonly current: (n: number) => string;
  readonly stale: (n: number) => string;
  readonly unavailable: (n: number) => string;
  readonly notSetUp: (n: number) => string;
  readonly unknown: (n: number) => string;
}

/** Non-zero source states in words, worst first. The buckets are exclusive, so the parts add up to the total. */
export function bucketWords(b: SourceBuckets, w: BucketWords): readonly string[] {
  return [
    b.notConfigured > 0 ? w.notSetUp(b.notConfigured) : '',
    b.unavailable > 0 ? w.unavailable(b.unavailable) : '',
    b.stale > 0 ? w.stale(b.stale) : '',
    b.unknown > 0 ? w.unknown(b.unknown) : '',
    b.current > 0 ? w.current(b.current) : '',
  ].filter((s) => s !== '');
}

/** Per product: target triad plus how many of its sources are current, stale, unavailable or not set up. */
export function SourceHealth({ items }: { readonly items: readonly HomeSourceHealth[] }) {
  const { lang } = useApp();
  const h = hostCopy('HOME_COPY', lang).sourceHealth;
  return (
    <ul className="rows" aria-label={h.caption}>
      {items.map((s) => (
        <li key={s.projectId} className="row-item home-src" data-source-health={s.projectId}>
          <p className="home-src-name"><bdi dir="ltr">{s.name}</bdi></p>
          <HealthTriad triad={s.triad} compact />
          <p className="note">{h.total(s.buckets.total)}: {bucketWords(s.buckets, h).join(' · ')}</p>
        </li>
      ))}
    </ul>
  );
}

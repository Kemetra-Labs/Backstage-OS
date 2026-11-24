// Atoms of the B+C pilot: status chip, age bar, source pips and the source ring. Each draws a number the screen also prints.
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { useLens } from '../useLens';
import { ageGeometry, pipTone, ringShare, type Axis } from '../logic/bc';
import type { SourceStatus, Tone } from '../logic/status';
import { PROV_INITIAL, useStatusWords } from './shared';

function Cross({ size }: { readonly size: number }) {
  return (
    <svg className="kv2-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6" /><path d="m15 9-6 6" />
    </svg>
  );
}

/** Glyph plus word (check, triangle, cross, question): state is never colour alone. */
export function StatusChip({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <span className="kv2-chip" data-tone={tone}>
      {tone === 'ok' ? <Icon name="check" size={12} /> : tone === 'warn' ? <Icon name="alert" size={12} /> : tone === 'bad' ? <Cross size={12} /> : <Icon name="question" size={12} />}
      {children}
    </span>
  );
}

interface AgeBarProps {
  readonly s: Pick<SourceStatus, 'ageMinutes' | 'used' | 'ttlMinutes'> & { readonly freshness?: SourceStatus['freshness'] };
  /** Hide the target caption (used inside table cells). */
  readonly compact?: boolean;
  /** Hide the numbers row (the caller prints them). */
  readonly nums?: boolean;
}

/**
 * Age against the freshness target. The track spans 0 to 3x the target with the target tick at one third; past the
 * tick a hatched amber segment shows the overflow, and a cut mark says it runs off the track. Never capped at 100.
 */
export function AgeBar({ s, compact = false, nums = true }: AgeBarProps) {
  const { t } = useLens();
  const g = ageGeometry(s);
  const base = s.ageMinutes === null ? t('bc.never') : t('obs.read.age', { a: s.ageMinutes, m: s.ttlMinutes });
  const multiple = g.multiple !== null ? t('bc.over', { x: g.multiple }) : null;
  const label = multiple ? `${base}${t('bc.sep')}${multiple}` : base;
  const tail = multiple ?? (compact || s.ageMinutes === null ? '' : t('bc.target', { m: s.ttlMinutes }));
  return (
    <div className="kv2-bc-age" data-state={g.state} role="img" aria-label={label}>
      <div className="kv2-bc-track">
        {g.state !== 'none' && <i className="kv2-bc-fill" style={{ inlineSize: `${g.fill.toFixed(1)}%` }} />}
        {g.overWidth > 0 && <i className="kv2-bc-over" style={{ insetInlineStart: `${g.overStart.toFixed(1)}%`, inlineSize: `${g.overWidth.toFixed(1)}%` }} />}
        {g.cut && <i className="kv2-bc-cut" style={{ insetInlineStart: '96%' }} />}
        <i className="kv2-bc-target" style={{ insetInlineStart: `${g.targetAt.toFixed(1)}%` }} />
      </div>
      {nums && (
        <div className="kv2-bc-nums">
          {g.state === 'none' ? <span>{base}</span> : <b>{base}</b>}
          <span>{tail}</span>
        </div>
      )}
    </div>
  );
}

/** One pip per source, lettered by provider. Filled = confirmed, hatched = stale, dashed = not known. */
export function Pips({ axis, statuses }: { readonly axis: Axis; readonly statuses: readonly SourceStatus[] }) {
  const { copy } = useLens();
  const words = useStatusWords();
  const word = (s: SourceStatus): string => (axis === 'connectivity' ? words.connectivity(s.connectivity) : axis === 'freshness' ? words.freshness(s.freshness) : words.health(s.health));
  const label = statuses.map((s) => `${copy.provider[s.provider]}: ${word(s)}`).join('; ');
  return (
    <div className="kv2-bc-pips" dir="ltr" role="img" aria-label={label}>
      {statuses.map((s) => <i key={s.provider} data-on={pipTone(axis, s)}><b>{PROV_INITIAL[s.provider]}</b></i>)}
    </div>
  );
}

const TAU = 2 * Math.PI * 46;

/** Ring around a service node: arc = min(ratio, 1) of the circle, an extra dashed ring when past target. Decorative. */
export function Ring({ s }: { readonly s: (Pick<SourceStatus, 'ageMinutes' | 'used'> & { readonly freshness?: SourceStatus['freshness'] }) | null }) {
  const share = s ? ringShare(s) : null;
  const stale = !!s && (s.used > 1 || s.freshness === 'stale');
  return (
    <svg className="kv2-bc-ring" viewBox="-6 -6 112 112" aria-hidden="true" focusable="false">
      {share === null ? (
        <circle className="kv2-bc-ring-none" cx="50" cy="50" r="46" />
      ) : (
        <>
          <circle className="kv2-bc-ring-track" cx="50" cy="50" r="46" />
          <circle className="kv2-bc-ring-arc" data-over={stale ? '' : undefined} cx="50" cy="50" r="46" strokeDasharray={`${(share * TAU).toFixed(1)} ${TAU.toFixed(1)}`} transform="rotate(-90 50 50)" />
          {stale && <circle className="kv2-bc-ring-over" cx="50" cy="50" r="54" />}
        </>
      )}
    </svg>
  );
}

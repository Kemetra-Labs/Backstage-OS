// Shared V2 primitives. Standard controls (buttons, tabs, tables) wearing the V2 tokens; no invented widgets.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { DisplayLabel, Provider } from '../../contract/types';
import { formatAge, segments } from '../../i18n';
import { useV2 } from '../context';
import type { K, Vars } from '../../i18n';
import type { Tone } from '../logic/status';
import { Icon, type IconName } from './Icon';

/** Renders copy with {brace} tokens isolated left-to-right so ids, times and names never reorder in Arabic. */
export function Tx({ s }: { readonly s: string }) {
  return (
    <>
      {segments(s).map((seg, i) =>
        seg.ltr ? <bdi key={i} dir="ltr" className="kv2-ltr">{seg.text}</bdi> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

export function T({ k, v }: { readonly k: K; readonly v?: Vars }) {
  const { t } = useV2();
  return <Tx s={t(k, v)} />;
}

export const Lt = ({ children }: { readonly children: ReactNode }) => <bdi dir="ltr" className="kv2-ltr">{children}</bdi>;

export function Provider_({ p }: { readonly p: Provider }) {
  const { copy } = useV2();
  return <Lt>{copy.provider[p]}</Lt>;
}

export function Age({ minutes }: { readonly minutes: number | null }) {
  const { route } = useV2();
  return <span>{formatAge(minutes, route.lang)}</span>;
}

const TRUTH_ICON: Readonly<Record<DisplayLabel, IconName>> = {
  observed: 'check', correlated: 'link', hypothesis: 'bulb', proposed: 'doc', approved: 'shield', unknown: 'question',
};

/** Truth label with an icon as well as colour, so it survives greyscale. Nontechnical gets the plain words. */
export function TruthChip({ label }: { readonly label: DisplayLabel }) {
  const { copy, route } = useV2();
  const text = route.persona === 'nontechnical' ? copy.plainLabel[label] : copy.label[label];
  return (
    <span className="kv2-chip" data-truth={label}>
      <Icon name={TRUTH_ICON[label]} size={11} />
      {text}
    </span>
  );
}

export function ToneChip({ tone, children, icon }: { readonly tone: Tone; readonly children: ReactNode; readonly icon?: IconName }) {
  return (
    <span className="kv2-chip" data-tone={tone}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

interface PanelProps {
  readonly title: ReactNode;
  readonly sub?: ReactNode;
  readonly icon?: IconName;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

export function Panel({ title, sub, icon, actions, className, id, children }: PanelProps) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section className={`kv2-panel${className ? ` ${className}` : ''}`} id={id} aria-labelledby={hid}>
      <header className="kv2-panel-head">
        {icon && <span className="kv2-panel-icon"><Icon name={icon} size={20} /></span>}
        <div className="kv2-panel-titles">
          <h2 id={hid} tabIndex={-1}>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="kv2-panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

interface Opt<V extends string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly count?: number;
  readonly icon?: IconName;
  readonly text?: string;
}

/** A group of toggle buttons (filters, view switches). Pressed state is aria-pressed, not a tab. */
export function Seg<V extends string>({ label, value, options, onChange, className }: {
  readonly label: string; readonly value: V; readonly options: readonly Opt<V>[]; readonly onChange: (v: V) => void; readonly className?: string;
}) {
  return (
    <div className={`kv2-seg${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} data-v={o.value}>
          {o.icon && <Icon name={o.icon} size={15} />}
          <span>{o.label}</span>
          {o.count !== undefined && <span className="kv2-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Real tabs with a roving tabindex and arrow-key movement. The parent renders the matching role="tabpanel". */
export function TabBar<V extends string>({ label, value, options, onChange, idPrefix }: {
  readonly label: string; readonly value: V; readonly options: readonly Opt<V>[]; readonly onChange: (v: V) => void; readonly idPrefix: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const { route } = useV2();
  const rtl = route.lang === 'ar';
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0;
    if (!next) return;
    e.preventDefault();
    const n = options.length;
    const j = next === -99 ? 0 : next === 99 ? n - 1 : (i + next + n) % n;
    refs.current[j]?.focus();
    onChange(options[j]!.value);
  };
  return (
    <div className="kv2-tabs" role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${o.value}`}
          aria-selected={value === o.value}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ icon, value, label, sub, tone, id }: { readonly icon: IconName; readonly value: ReactNode; readonly label: ReactNode; readonly sub?: ReactNode; readonly tone?: Tone; readonly id?: string }) {
  return (
    <div className="kv2-kpi" data-tone={tone} id={id}>
      <span className="kv2-kpi-icon"><Icon name={icon} size={19} /></span>
      <span className="kv2-kpi-body">
        <strong>{value}</strong>
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

/** A bar for a measured ratio (age against a freshness target). Past 100 % the bar is full and amber. */
export function Bar({ ratio, label }: { readonly ratio: number; readonly label: string }) {
  const over = ratio > 1;
  return (
    <span className="kv2-bar" role="img" aria-label={label} data-over={over || undefined}>
      <span style={{ inlineSize: `${Math.min(1, Math.max(0, ratio)) * 100}%` }} />
    </span>
  );
}

/** Background atmosphere: stars and a planet horizon. Pure decoration, aria-hidden, static under reduced motion. */
export function Cosmos({ horizon = true }: { readonly horizon?: boolean }) {
  return (
    <div className="kv2-cosmos" aria-hidden="true">
      <div className="kv2-stars" />
      {horizon && <div className="kv2-horizon"><i /></div>}
    </div>
  );
}

export const toneOfTruth = (l: DisplayLabel): Tone => (l === 'observed' ? 'ok' : l === 'hypothesis' ? 'warn' : 'unk');

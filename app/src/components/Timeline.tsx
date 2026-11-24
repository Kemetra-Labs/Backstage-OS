import type { ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import type { DisplayLabel } from '../contract/types';
import { formatAge } from '../i18n/format';
import { TruthChip } from './TruthChip';

export interface TimelineItem {
  readonly id: string;
  readonly minutesAgo: number | null;
  readonly truth: DisplayLabel;
  readonly title: ReactNode;
  readonly href?: string;
  readonly meta?: ReactNode;
}

/** Newest first. Every entry carries its truth label, so a simulated or inferred event never reads as observed. */
export function Timeline({ items, label }: { readonly items: readonly TimelineItem[]; readonly label?: string }) {
  const { copy, lang, persona, shell } = useApp();
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  const sorted = [...items].sort((a, b) => (a.minutesAgo ?? Infinity) - (b.minutesAgo ?? Infinity));
  return (
    <ol className="timeline" aria-label={label ?? shell.timeline}>
      {sorted.map((i) => (
        <li key={i.id} className="tl-item" data-timeline={i.id}>
          <span className="tl-time">{formatAge(i.minutesAgo, lang)}</span>
          <span className="tl-body">
            <TruthChip label={i.truth} style={style} copy={copy} />
            <span className="tl-title">{i.href ? <a href={i.href}>{i.title}</a> : i.title}</span>
            {i.meta && <span className="tl-meta note">{i.meta}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

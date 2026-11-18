import type { ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import type { StateKind } from '../i18n/shell';
import { Text } from './Text';

interface Props {
  readonly kind: StateKind;
  /** Override the default title or body (copy with {braces}). */
  readonly title?: string;
  readonly body?: string;
  readonly children?: ReactNode;
}

/** Loading, empty, error, restricted, unavailable, not set up or unknown: always said in words, never a blank or a 0. */
export function StateBlock({ kind, title, body, children }: Props) {
  const { shell } = useApp();
  const s = shell.states[kind];
  return (
    <div className={`state-block state-${kind}`} data-state={kind}>
      <p className="state-title"><Text s={title ?? s.title} /></p>
      <p className="note"><Text s={body ?? s.body} /></p>
      {children}
    </div>
  );
}

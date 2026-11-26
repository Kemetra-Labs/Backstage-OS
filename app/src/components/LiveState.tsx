import { useApp } from '../app/AppContext';
import { liveStateKind, type LiveFailure } from '../live/reads';
import { StateBlock } from './StateBlock';
import { Text } from './Text';

/**
 * What a live panel (BACK-51 P1) shows instead of data: loading, not found, no investigation chosen, unavailable or an error.
 * Always in words, with live copy (the default StateBlock copy speaks of demo data); never empty, never healthy.
 */
export function LiveState({ state }: { readonly state: LiveFailure | 'loading' }) {
  const { shell } = useApp();
  const c = shell.live.states[state];
  return (
    <div data-testid="live-state" data-live={state} {...(state === 'loading' ? { role: 'status', 'aria-busy': true } : {})}>
      <StateBlock kind={liveStateKind(state)} title={c.title} body={c.body} />
    </div>
  );
}

/** Where live data came from, in place of the demo marker. */
export function LiveMark({ testId }: { readonly testId: string }) {
  const { shell } = useApp();
  return <span className="live-mark" data-testid={testId}><Text s={shell.live.source} /></span>;
}

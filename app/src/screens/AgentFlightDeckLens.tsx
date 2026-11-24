// BACK-90: the V2 Agent Flight Deck inside the existing Agents screen: read-only oversight of simulated agents and their missions.
// Same pattern as the other lenses: the host's persona, language and route drive it (src/bridge/hostV2.ts), every change is a host
// navigation, no V2Provider, lazy. It runs, approves, stops and retries nothing: the agents are fixture rows and every control only
// moves a view. A mission's event count is shown as not defined (see AgentFlightDeck `embedded`). Synthetic demo data; persona is a
// display switch, not authorization.
import { useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toV2 } from '../bridge/hostV2';
import { V2Context } from '../lenses/context';
import { AgentFlightDeck } from '../lenses/screens/AgentFlightDeck';
import { AGENTS_VIEW_COPY } from '../i18n/screens/map';
import { navigate } from './hostNav';
import './lensStyles';

export default function AgentFlightDeckLens() {
  const { persona, lang, route } = useApp();
  const copy = AGENTS_VIEW_COPY[lang];
  const value = useMemo(() => toV2({ persona, lang, route }, { navigate }), [persona, lang, route]);
  return (
    <V2Context.Provider value={value}>
      <section className="kv2-scope" aria-label={copy.region} data-testid="agent-deck-lens">
        <AgentFlightDeck embedded />
      </section>
    </V2Context.Provider>
  );
}

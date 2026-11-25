import { lazy, Suspense } from 'react';
import { useApp } from '../app/AppContext';
import { LensBoundary } from '../components/LensBoundary';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { hrefFor } from '../nav/routes';
import { agentRoster } from '../view/agentView';
import '../styles/screens/agents.css';
import { ActivityHistory } from './agents/ActivityHistory';
import { AgentRoster } from './agents/AgentRoster';
import { OversightPanel } from './agents/OversightPanel';
import { hostCopy } from '../i18n/host';

// BACK-90: the Flight Deck is another view of this screen, loaded only when asked for (its code and sheets are a lazy chunk).
const AgentFlightDeckLens = lazy(() => import('./AgentFlightDeckLens'));

/**
 * Agent activity (demo only): simulated roster and history. No control starts, stops, pauses or configures anything.
 * The Flight Deck view (`#/agents/deck[/<mission>]`) adds read-only mission oversight for the same simulated agents; the roster stays
 * the default view and is unchanged.
 */
export function Agents() {
  const { shell, lang, persona, world, route } = useApp();
  const copy = hostCopy('AGENTS_COPY', lang);
  const views = hostCopy('AGENTS_VIEW_COPY', lang);
  const deck = route.name === 'agents' && route.view === 'deck';
  return (
    <>
      <ScreenHeader title={shell.nav.agents} lede={<Text s={copy.lede} />} />
      <nav className="view-switch" aria-label={views.label}>
        <a href={hrefFor({ name: 'agents' })} aria-current={deck ? undefined : 'page'} data-view="roster">{views.roster}</a>
        <a href={hrefFor({ name: 'agents', view: 'deck' })} aria-current={deck ? 'page' : undefined} data-view="deck">{views.deck}</a>
      </nav>
      {deck ? (
        <LensBoundary label="Agent Flight Deck" fallback={<p className="note" role="status" data-testid="deck-failed">{views.failed}</p>}>
          <Suspense fallback={<p className="note" role="status" data-testid="deck-loading">{views.loading}</p>}>
            <AgentFlightDeckLens />
          </Suspense>
        </LensBoundary>
      ) : (
        <>
          <OversightPanel copy={copy.oversight} />
          <AgentRoster rows={agentRoster(world)} copy={copy.roster} lang={lang} persona={persona} />
          <ActivityHistory world={world} copy={copy.history} />
        </>
      )}
    </>
  );
}

import { lazy, Suspense } from 'react';
import '../styles/screens/investigation.css';
import { useApp } from '../app/AppContext';
import { LensBoundary } from '../components/LensBoundary';
import { ScreenHeader } from '../components/ScreenHeader';
import { hrefFor } from '../nav/routes';
import { investigationById } from '../view/world';
import { InvestigationRoom } from './InvestigationRoom';
import { CaseNotFound, SummaryRoom } from './investigation/SummaryRoom';
import { hostCopy } from '../i18n/host';

// BACK-89: the replay is another view of the case, loaded only when asked for (its code and sheets are a lazy chunk).
const ReplayLens = lazy(() => import('./ReplayLens'));

/**
 * INV-DEMO-7 has the full room (BACK-6) and, as another view of the same case, the Mission Replay
 * (`#/investigation/<id>/replay[/<event>]`). Other known cases get a summary room; unknown ids an error state.
 */
export function InvestigationRoute({ id }: { readonly id: string }) {
  const { persona, lang, copy, world, investigation, route } = useApp();
  const inv = investigationById(world, id);
  if (!inv) return <CaseNotFound id={id} />;
  if (!(inv.fullRoom && id === investigation.id)) return <SummaryRoom id={id} />;
  const views = hostCopy('REPLAY_VIEW_COPY', lang);
  const replay = route.name === 'investigation' && route.view === 'replay';
  const switcher = (
    <nav className="view-switch" aria-label={views.label}>
      <a href={hrefFor({ name: 'investigation', id })} aria-current={replay ? undefined : 'page'} data-view="room">{views.room}</a>
      <a href={hrefFor({ name: 'investigation', id, view: 'replay' })} aria-current={replay ? 'page' : undefined} data-view="replay">{views.replay}</a>
    </nav>
  );
  if (!replay) return <>{switcher}<InvestigationRoom persona={persona} lang={lang} copy={copy} /></>;
  return (
    <>
      <ScreenHeader title={copy.h1} />
      {switcher}
      <LensBoundary label="Mission Replay" fallback={<p className="note" role="status" data-testid="replay-failed">{views.failed}</p>}>
        <Suspense fallback={<p className="note" role="status" data-testid="replay-loading">{views.loading}</p>}>
          <ReplayLens />
        </Suspense>
      </LensBoundary>
    </>
  );
}

// BACK-87: the Mission Map route. The lens (B+C map, its stylesheets) is a separate chunk, fetched only when this route is opened;
// if it cannot load, the screen says so and every other screen keeps working. Same pattern as the opt-in React Flow map.
import { lazy, Suspense } from 'react';
import { useApp } from '../app/AppContext';
import { LensBoundary } from '../components/LensBoundary';
import { ScreenHeader } from '../components/ScreenHeader';
import { hostCopy } from '../i18n/host';

const MissionMapLens = lazy(() => import('./MissionMapLens'));

export function MissionMap() {
  const { lang, shell } = useApp();
  const copy = hostCopy('MAP_LENS_COPY', lang);
  const header = <ScreenHeader title={shell.nav.map} />;
  return (
    <LensBoundary label="Mission Map" fallback={<>{header}<p className="note" role="status" data-testid="map-failed">{copy.failed}</p></>}>
      <Suspense fallback={<>{header}<p className="note" role="status" data-testid="map-loading">{copy.loading}</p></>}>
        <MissionMapLens />
      </Suspense>
    </LensBoundary>
  );
}

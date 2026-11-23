// BACK-87: the Mission Map route. The lens (B+C map, its stylesheets) is a separate chunk, fetched only when this route is opened;
// if it cannot load, the screen says so and every other screen keeps working. Same pattern as the opt-in React Flow map.
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { MAP_LENS_COPY } from '../i18n/screens/map';

const MissionMapLens = lazy(() => import('./MissionMapLens'));

class LensBoundary extends Component<{ readonly fallback: ReactNode; readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Synthetic demo: nothing is reported anywhere. The console line is for the reviewer.
    console.warn('Mission Map failed to load.', error.message, info.componentStack ?? '');
  }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function MissionMap() {
  const { lang, shell } = useApp();
  const copy = MAP_LENS_COPY[lang];
  const header = <ScreenHeader title={shell.nav.map} />;
  return (
    <LensBoundary fallback={<>{header}<p className="note" role="status" data-testid="map-failed">{copy.failed}</p></>}>
      <Suspense fallback={<>{header}<p className="note" role="status" data-testid="map-loading">{copy.loading}</p></>}>
        <MissionMapLens />
      </Suspense>
    </LensBoundary>
  );
}

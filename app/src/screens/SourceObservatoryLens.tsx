// BACK-88: the V2 Source Observatory inside the existing Sources screen. Same pattern as the Mission Map lens: one persona,
// language and route (the host's), the Observatory's useV2() value derived from them (src/bridge/hostV2.ts), every change a host
// navigation, no V2Provider. Lazy, so its code and sheets load only for the Observatory view. Synthetic demo data only; persona
// is a display switch, not authorization.
import { useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toV2 } from '../bridge/hostV2';
import { V2Context } from '../lenses/context';
import { SourceObservatory } from '../lenses/screens/SourceObservatory';
import { SOURCES_VIEW_COPY } from '../i18n/screens/map';
import { navigate } from './hostNav';
import './lensStyles';

export default function SourceObservatoryLens() {
  const { persona, lang, route } = useApp();
  const copy = SOURCES_VIEW_COPY[lang];
  const value = useMemo(() => toV2({ persona, lang, route }, { navigate }), [persona, lang, route]);
  return (
    <V2Context.Provider value={value}>
      <section className="kv2-scope" aria-label={copy.region} data-testid="source-observatory-lens">
        <SourceObservatory embedded />
      </section>
    </V2Context.Provider>
  );
}

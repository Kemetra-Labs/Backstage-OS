// BACK-88: the V2 Source Observatory inside the existing Sources screen. Same pattern as the Mission Map lens: one persona,
// language and route (the host's), which the Observatory reads through useLens() (src/lenses/useLens.ts), every change a host
// navigation, no provider. Lazy, so its code and sheets load only for the Observatory view. Synthetic demo data only; persona
// is a display switch, not authorization.
import { useApp } from '../app/AppContext';
import { SourceObservatory } from '../lenses/screens/SourceObservatory';
import { SOURCES_VIEW_COPY } from '../i18n/screens/map';
import './lensStyles';

export default function SourceObservatoryLens() {
  const { lang } = useApp();
  const copy = SOURCES_VIEW_COPY[lang];
  return (
    <section className="kv2-scope" aria-label={copy.region} data-testid="source-observatory-lens">
      <SourceObservatory embedded />
    </section>
  );
}

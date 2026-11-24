// BACK-89: the V2 Mission Replay inside the Investigation Room. The host's persona, language and route drive it (src/lenses/useLens.ts);
// the selected event is in the route and moves by replacing the history entry, so playing or scrubbing does not fill Back with steps.
// No provider. Lazy. Read-only: nothing here approves, retries or runs anything. Synthetic demo data; persona is a display switch,
// not authorization.
import { useApp } from '../app/AppContext';
import { MissionReplay } from '../lenses/screens/MissionReplay';
import { REPLAY_VIEW_COPY } from '../i18n/screens/map';
import { ReplayTimeBasis } from './ReplayTimeBasis';
import './lensStyles';

export default function ReplayLens() {
  const { lang } = useApp();
  const copy = REPLAY_VIEW_COPY[lang];
  return (
    <section className="kv2-scope" aria-label={copy.region} data-testid="replay-lens">
      <MissionReplay embedded />
      <ReplayTimeBasis />
    </section>
  );
}

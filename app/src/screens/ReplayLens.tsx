// BACK-89: the V2 Mission Replay inside the Investigation Room. The host's persona, language and route drive it (src/bridge/hostV2.ts);
// the selected event is in the route and moves by replacing the history entry, so playing or scrubbing does not fill Back with steps.
// No V2Provider. Lazy. Read-only: nothing here approves, retries or runs anything. Synthetic demo data; persona is a display switch,
// not authorization.
import { useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toV2 } from '../bridge/hostV2';
import { V2Context } from '../design-lab/v2/context';
import { MissionReplay } from '../design-lab/v2/screens/MissionReplay';
import { REPLAY_VIEW_COPY } from '../i18n/screens/map';
import { navigate, replace } from './hostNav';
import { ReplayTimeBasis } from './ReplayTimeBasis';
import './lensStyles';

export default function ReplayLens() {
  const { persona, lang, route } = useApp();
  const copy = REPLAY_VIEW_COPY[lang];
  const value = useMemo(() => toV2({ persona, lang, route }, { navigate, replace }), [persona, lang, route]);
  return (
    <V2Context.Provider value={value}>
      <section className="kv2-scope" aria-label={copy.region} data-testid="replay-lens">
        <MissionReplay embedded />
        <ReplayTimeBasis />
      </section>
    </V2Context.Provider>
  );
}

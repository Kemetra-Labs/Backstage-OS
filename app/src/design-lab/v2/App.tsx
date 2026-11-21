import { V2Provider, useV2 } from './context';
import { Shell } from './navigation/Shell';
import { AgentFlightDeck } from './screens/AgentFlightDeck';
import { MissionMap } from './screens/MissionMap';
import { MissionMapBC } from './screens/MissionMapBC';
import { MissionReplay } from './screens/MissionReplay';
import { SourceObservatory } from './screens/SourceObservatory';

/** BACK-27 pilot switch: v2.html?concept=bc swaps only the Mission Map for the B+C pilot. Without it V2 is unchanged. */
const bcPilot = (): boolean => new URLSearchParams(window.location.search).get('concept') === 'bc';

function Outlet() {
  const { route } = useV2();
  switch (route.screen) {
    case 'source-observatory': return <SourceObservatory />;
    case 'mission-replay': return <MissionReplay />;
    case 'agent-flight-deck': return <AgentFlightDeck />;
    default: return bcPilot() ? <MissionMapBC /> : <MissionMap />;
  }
}

export function App() {
  return (
    <V2Provider>
      <Shell>
        <Outlet />
      </Shell>
    </V2Provider>
  );
}

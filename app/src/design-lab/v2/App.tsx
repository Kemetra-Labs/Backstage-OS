import { V2Provider, useV2 } from './context';
import { Shell } from './navigation/Shell';
import { AgentFlightDeck } from './screens/AgentFlightDeck';
import { MissionMap } from './screens/MissionMap';
import { MissionReplay } from './screens/MissionReplay';
import { SourceObservatory } from './screens/SourceObservatory';

function Outlet() {
  const { route } = useV2();
  switch (route.screen) {
    case 'source-observatory': return <SourceObservatory />;
    case 'mission-replay': return <MissionReplay />;
    case 'agent-flight-deck': return <AgentFlightDeck />;
    default: return <MissionMap />;
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

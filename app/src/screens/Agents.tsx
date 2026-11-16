import { useApp } from '../app/AppContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { WORLD } from '../fixture/world';
import { AGENTS_COPY } from '../i18n/screens/agents';
import { agentRoster } from '../view/agentView';
import '../styles/screens/agents.css';
import { ActivityHistory } from './agents/ActivityHistory';
import { AgentRoster } from './agents/AgentRoster';
import { OversightPanel } from './agents/OversightPanel';

/** Agent activity (demo only): simulated roster and history. No control starts, stops, pauses or configures anything. */
export function Agents() {
  const { shell, lang, persona } = useApp();
  const copy = AGENTS_COPY[lang];
  return (
    <>
      <ScreenHeader title={shell.nav.agents} lede={<Text s={copy.lede} />} />
      <OversightPanel copy={copy.oversight} />
      <AgentRoster rows={agentRoster(WORLD)} copy={copy.roster} lang={lang} persona={persona} />
      <ActivityHistory world={WORLD} copy={copy.history} />
    </>
  );
}

import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import type { AgentsCopy } from '../../i18n/screens/agents';

/** The first thing on the page: agents here are simulated and people decide in the source system. */
export function OversightPanel({ copy }: { readonly copy: AgentsCopy['oversight'] }) {
  return (
    <Panel id="agents-oversight" title={copy.title} tone="raised" className="oversight" testId="oversight">
      <p className="oversight-intro"><Text s={copy.intro} /></p>
      <ul className="oversight-points">
        {copy.points.map((p) => <li key={p}><Text s={p} /></li>)}
      </ul>
    </Panel>
  );
}

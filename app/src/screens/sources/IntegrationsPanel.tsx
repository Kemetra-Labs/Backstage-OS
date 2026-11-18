import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import type { Persona, Provider } from '../../contract/types';
import type { SourcesCopy } from '../../i18n/screens/sources';
import type { Copy } from '../../i18n/strings';

interface Props {
  readonly copy: SourcesCopy;
  readonly shared: Copy;
  readonly persona: Persona;
  readonly providers: readonly Provider[];
}

/** Informational only: what each provider would be read for. No connect, authorise, sync or refresh control. */
export function IntegrationsPanel({ copy, shared, persona, providers }: Props) {
  const c = copy.integrations;
  return (
    <Panel id="sources-integrations" title={c.title} testId="integrations">
      <p className="oversight-intro"><Text s={c.intro} /></p>
      <p className="note"><Text s={c.readOnly} /></p>
      <ul className="integration-list">
        {providers.map((p) => (
          <li key={p} className="integration" data-integration={p}>
            <strong><Text s={`{${shared.provider[p]}}`} /></strong>
            <span>
              <span className="note">{c.reads}: </span>
              <Text s={persona === 'nontechnical' ? c.provider[p].plain : c.provider[p].reads} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

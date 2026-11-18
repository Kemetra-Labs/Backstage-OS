import { L } from '../../components/L';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import type { Lang, Persona } from '../../contract/types';
import type { AgentsCopy } from '../../i18n/screens/agents';
import { formatAge } from '../../i18n/segments';
import { stateCounts, type AgentRow } from '../../view/agentView';

interface Props {
  readonly rows: readonly AgentRow[];
  readonly copy: AgentsCopy['roster'];
  readonly lang: Lang;
  readonly persona: Persona;
}

/** One row per agent. State is said in words and shaped by border style; none of them reads as healthy. */
export function AgentRoster({ rows, copy, lang, persona }: Props) {
  return (
    <Panel id="agents-roster" title={copy.title} aside={<Text s={copy.summary(stateCounts(rows))} />} testId="roster">
      <ul className="agent-list">
        {rows.map((a) => (
          <li key={a.id} className="agent" data-agent={a.id} data-state={a.state}>
            <div className="agent-head">
              <h3 className="agent-name"><Text s={`{${a.name}}`} /></h3>
              <span className="agent-state" data-agent-state={a.state}>{copy.state[a.state]}</span>
            </div>
            <p className="note">{copy.stateNote[a.state]}</p>
            <p className="agent-purpose"><L t={a.purpose} /></p>
            <dl className="kv">
              <dt>{copy.projects}</dt>
              <dd>
                {a.projects.length === 0 ? copy.none : (
                  <span className="chips">
                    {a.projects.map((p) => <span key={p.id} className="agent-project"><Text s={`{${p.name}}`} /></span>)}
                  </span>
                )}
              </dd>
              <dt>{copy.lastActivity}</dt>
              <dd data-last-activity>{a.lastActivityMinutesAgo === null ? copy.never : formatAge(a.lastActivityMinutesAgo, lang)}</dd>
              {persona === 'technical' && (
                <>
                  <dt><Text s="{ID}" /></dt>
                  <dd><Text s={`{${a.id}}`} /></dd>
                </>
              )}
            </dl>
            <div>
              <p className="agent-cap-title note">{copy.capabilities}</p>
              <ul className="agent-caps">
                {a.capabilities.map((c) => (
                  <li key={c.id} data-capability={c.status}>
                    <span><L t={c.label} /></span>
                    <span className={`cap-status cap-${c.status}`}>{copy.capStatus[c.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

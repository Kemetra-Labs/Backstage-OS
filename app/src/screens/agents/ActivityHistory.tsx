import { useState } from 'react';
import { L } from '../../components/L';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { StateBlock } from '../../components/StateBlock';
import { Text } from '../../components/Text';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import type { World } from '../../contract/world';
import type { AgentsCopy } from '../../i18n/screens/agents';
import { hrefFor } from '../../nav/routes';
import { agentEvents, projectFilterOptions, type AgentEventRow, type ProjectFilter } from '../../view/agentView';

interface Props {
  readonly world: World;
  readonly copy: AgentsCopy['history'];
}

function toItem(e: AgentEventRow, copy: AgentsCopy['history']): TimelineItem {
  return {
    id: e.id,
    minutesAgo: e.minutesAgo,
    truth: e.truth,
    title: <L t={e.text} />,
    meta: (
      <>
        <span data-actor={e.actor}>{e.actor === 'agent' && e.agentName ? <Text s={copy.by(e.agentName)} /> : copy.human}</span>
        {e.investigationId && (
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'investigation', id: e.investigationId })}>
            <Text s={copy.openCase(e.investigationId)} />
          </a>
        )}
        {e.evidenceId && (
          <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'evidence', id: e.evidenceId })}>
            <Text s={copy.inspectEvidence(e.evidenceId)} />
          </a>
        )}
      </>
    ),
  };
}

/** Simulated agent events, newest first. The only controls are the project filter and neutral navigation links. */
export function ActivityHistory({ world, copy }: Props) {
  const [project, setProject] = useState<ProjectFilter>('all');
  const options = projectFilterOptions(world);
  const events = agentEvents(world, project);
  return (
    <Panel
      id="agents-history"
      title={copy.title}
      testId="history"
      aside={
        <Segmented<ProjectFilter>
          label={copy.filterLabel}
          value={project}
          onChange={setProject}
          options={[
            { value: 'all', label: copy.filterAll },
            ...options.map((o) => ({ value: o.id, label: o.name, lang: 'en' })),
          ]}
        />
      }
    >
      <p className="note"><Text s={copy.intro} /></p>
      {events.length === 0 ? (
        <StateBlock kind="empty" title={copy.empty.title} body={copy.empty.body} />
      ) : (
        <div className="agent-timeline"><Timeline items={events.map((e) => toItem(e, copy))} label={copy.listLabel} /></div>
      )}
    </Panel>
  );
}

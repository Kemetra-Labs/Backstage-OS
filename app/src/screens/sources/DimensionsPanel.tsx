import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import type { Persona } from '../../contract/types';
import type { SourcesCopy } from '../../i18n/screens/sources';
import { hrefFor } from '../../nav/routes';

interface Props {
  readonly copy: SourcesCopy;
  readonly persona: Persona;
}

/** Connectivity, freshness and target health are three separate things; this screen shows only the first two. */
export function DimensionsPanel({ copy, persona }: Props) {
  const d = copy.dimensions;
  const items = [d.connectivity, d.freshness, d.target];
  return (
    <Panel id="sources-dimensions" title={d.title} tone="raised" testId="dimensions">
      {persona === 'nontechnical' && <p className="sources-plain" data-plain-note><Text s={copy.plainNote} /></p>}
      <ol className="dim-list">
        {items.map((i, n) => (
          <li key={i.name} className={n === 2 ? 'dim-off' : undefined}>
            <strong>{i.name}</strong>
            <span className="note"><Text s={i.body} /></span>
          </li>
        ))}
      </ol>
      <p className="note">{d.scope}</p>
      <a className="btn btn-quiet btn-link" href={hrefFor({ name: 'portfolio' })}>{d.projectsLink}</a>
    </Panel>
  );
}

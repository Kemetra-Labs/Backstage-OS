import type { Lang, Persona } from '../contract/types';
import { formatAge } from '../i18n/segments';
import type { Copy } from '../i18n/strings';
import type { NodeView } from '../view/viewFor';
import { Text } from './Text';

interface Props {
  readonly nodes: readonly NodeView[];
  readonly persona: Persona;
  readonly copy: Copy;
  readonly lang: Lang;
}

/** The stage (C2): the affected path. Data flow direction is meaning, so the map stays left to right in Arabic. */
export function StageMap({ nodes, persona, copy, lang }: Props) {
  return (
    <section className="stage" aria-labelledby="stage-title">
      <h2 id="stage-title">{copy.stageTitle}</h2>
      <ol className="path" dir="ltr" data-testid="stage-map">
        {nodes.map((n, i) => (
          <li key={n.id} className={`node health-${n.health}${n.checkFailing ? ' node-hot' : ''}`} data-node={n.id}>
            {i > 0 && <span className="edge" aria-hidden="true" />}
            <span className="node-box" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <span className="node-name"><Text s={copy.node[n.id]} /></span>
              {n.checkFailing && <span className="node-check"><Text s={copy.checkFailing[persona]} /></span>}
              <span className="node-health" data-health={n.health}>{copy.health[n.health]}</span>
              {n.freshness === 'stale' && n.ageMinutes !== null && (
                <span className="node-stale">{copy.lastSeen(formatAge(n.ageMinutes, lang))}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="note">{copy.stageNote}</p>
    </section>
  );
}

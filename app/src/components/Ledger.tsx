import type { Lang, Persona } from '../contract/types';
import { formatAge } from '../i18n/format';
import type { Copy } from '../i18n/strings';
import type { PersonaView } from '../view/viewFor';
import { Text } from './Text';
import { TruthChip } from './TruthChip';

interface Props {
  readonly view: PersonaView;
  readonly copy: Copy;
  readonly lang: Lang;
}

function ConfidenceLine({ view, copy }: { readonly view: PersonaView; readonly copy: Copy }) {
  const c = view.hypothesis.confidence;
  if (c.kind === 'number') {
    return <p className="confidence">{copy.confidence}: {copy.level[c.level]} · <bdi dir="ltr">{c.value}%</bdi> (<bdi dir="ltr">{c.basis.method}</bdi>)</p>;
  }
  const suffix = view.persona === 'technical' ? ` (${copy.noScore})` : '';
  return <p className="confidence">{copy.confidence}: {copy.level[c.level]}{suffix}</p>;
}

function ForAgainst({ copy }: { readonly copy: Copy }) {
  return (
    <dl className="for-against">
      <dt>{copy.forLabel}</dt><dd><Text s={copy.forText} /></dd>
      <dt>{copy.againstLabel}</dt><dd><Text s={copy.againstText} /></dd>
      <dt>{copy.confirmBy}</dt><dd><Text s={copy.confirmText} /></dd>
    </dl>
  );
}

const sourceLine = (persona: Persona, view: PersonaView, i: number, copy: Copy, lang: Lang): string => {
  const f = view.facts[i];
  const base = f ? copy.factSource[f.key][persona] : '';
  if (f?.key === 'unknown') return `${base} · ${copy.sourcesNotCurrent(view.sourcesNotCurrent.notCurrent, view.sourcesNotCurrent.total)}`;
  if (f?.ageMinutes !== undefined) return `${base} · ${formatAge(f.ageMinutes, lang)} · ${copy.freshness[f.freshness ?? 'unknown']}`;
  return base;
};

/** The ledger (C2): facts in a fixed order, each with its truth label, source and time. */
export function Ledger({ view, copy, lang }: Props) {
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title">{copy.ledgerTitle}</h2>
      <ul className="facts">
        {view.facts.map((f, i) => (
          <li key={f.key} className="fact" data-fact={f.key}>
            <TruthChip label={f.label} style={view.labelStyle} copy={copy} />
            <p className="fact-text"><Text s={copy.facts[f.key][view.persona]} /></p>
            <p className="fact-source"><Text s={sourceLine(view.persona, view, i, copy, lang)} /></p>
            {f.key === 'hypothesis' && (
              <>
                <ConfidenceLine view={view} copy={copy} />
                {view.hypothesis.showForAgainst && <ForAgainst copy={copy} />}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { OptionView } from '../../view/decisionView';
import { Panel } from '../../components/Panel';
import { Text } from '../../components/Text';
import { TruthChip } from '../../components/TruthChip';
import { useDecisionsUi } from './useDecisionsUi';

function OptionItem({ o }: { readonly o: OptionView }) {
  const { copy, c, style } = useDecisionsUi();
  return (
    <li className="dec-option" data-option={o.id} data-suggested={o.suggested ? 'true' : 'false'}>
      {o.suggested && (
        <p className="dec-suggest">
          <span>{style === 'plain' ? c.suggestedOptionPlain : c.suggestedOption} · </span>
          <TruthChip label="proposed" style={style} copy={copy} />
        </p>
      )}
      <h3><Text s={o.title} /></h3>
      <dl className="dec-fields">
        <dt>{c.benefit}</dt>
        <dd><Text s={o.benefit} /></dd>
        <dt>{c.risk}</dt>
        <dd><Text s={o.risk} /></dd>
        <dt>{c.optionUnknowns}</dt>
        <dd data-part="option-unknowns">
          {o.unknowns.length === 0 ? c.noneRecorded : (
            <ul>{o.unknowns.map((u, i) => <li key={i}><Text s={u} /></li>)}</ul>
          )}
        </dd>
        <dt>{c.optionEvidence}</dt>
        <dd>
          {o.evidenceIds.length === 0 ? c.noneRecorded : o.evidenceIds.map((id, i) => (
            <span key={id}>{i > 0 ? ', ' : ''}<bdi dir="ltr">{id}</bdi></span>
          ))}
        </dd>
      </dl>
    </li>
  );
}

/** Alternatives side by side on desktop, stacked on mobile. Nothing here can be chosen. */
export function OptionsPanel({ options }: { readonly options: readonly OptionView[] }) {
  const { c } = useDecisionsUi();
  return (
    <Panel id="dec-options" title={c.optionsTitle} testId="dec-options">
      <p className="note">{c.optionsNote}</p>
      {options.length === 0 ? <p>{c.optionsNone}</p> : (
        <ul className="dec-options">
          {options.map((o) => <OptionItem key={o.id} o={o} />)}
        </ul>
      )}
    </Panel>
  );
}

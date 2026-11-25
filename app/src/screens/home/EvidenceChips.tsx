import { useApp } from '../../app/AppContext';
import { TruthChip } from '../../components/TruthChip';
import type { EvidenceView } from '../../view/viewFor';

interface Props {
  readonly items: readonly EvidenceView[];
  /** Technical only: show the evidence id next to its chip. */
  readonly showIds: boolean;
}

/** One truth chip per evidence item, labelled by the contract. */
export function EvidenceChips({ items, showIds }: Props) {
  const { copy, persona } = useApp();
  const style = persona === 'nontechnical' ? 'plain' : 'standard';
  return (
    <ul className="chips ev-chips">
      {items.map((v) => (
        <li key={v.id} className="ev-chip" data-evidence-chip={v.id}>
          <TruthChip label={v.label} style={style} copy={copy} />
          {showIds && <bdi dir="ltr" className="ev-id">{v.id}</bdi>}
        </li>
      ))}
    </ul>
  );
}

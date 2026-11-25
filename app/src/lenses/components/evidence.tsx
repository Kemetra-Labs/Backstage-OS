// Evidence row shared by all four screens, so the same item reads the same everywhere.
import type { EvidenceReference } from '../../contract/types';
import { useLens } from '../useLens';
import { evidenceView } from '../logic/evidence';
import { Icon } from './Icon';
import { Age, Lt, Provider_, ToneChip, TruthChip, Tx } from './ui';

export function useEvTitle(): (id: string) => string {
  const { copy, route, t } = useLens();
  return (id) => {
    const hostTitle = copy.evidenceItem[id]?.[route.persona];
    if (hostTitle) return hostTitle;
    return id === 'E-8' || id === 'E-9' ? t(id === 'E-8' ? 'ev.E-8' : 'ev.E-9') : id;
  };
}

interface Props {
  readonly evidence: EvidenceReference;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
  readonly compact?: boolean;
}

export function EvidenceItem({ evidence, selected, onSelect, compact }: Props) {
  const { copy, route } = useLens();
  const title = useEvTitle();
  const v = evidenceView(evidence, route.persona);
  const showId = route.persona !== 'nontechnical';
  const inner = (
    <>
      <span className="kv2-ev-chip">{v.restricted ? <ToneChip tone="unk" icon="lock">{copy.label.unknown}</ToneChip> : <TruthChip label={v.label} />}</span>
      <span className="kv2-ev-main">
        <span className="kv2-ev-title">
          {v.restricted ? <Tx s={copy.restricted} /> : <Tx s={title(v.id)} />}
        </span>
        {!compact && (
          <span className="kv2-ev-meta">
            {showId && <Lt>{v.id}</Lt>}
            {v.provider && <Provider_ p={v.provider} />}
            {v.provider && <Age minutes={v.ageMinutes} />}
            {!v.restricted && !v.notReadReason && <span data-fresh={v.freshness}>{copy.freshness[v.freshness]}</span>}
            {v.notReadReason && <span data-fresh="unknown">{copy.notRead[v.notReadReason]}</span>}
            {v.externalId && <Lt>{v.externalId}</Lt>}
          </span>
        )}
      </span>
      {onSelect && <Icon name="chevron" size={14} className="kv2-ev-go" />}
    </>
  );
  return onSelect ? (
    <button type="button" className="kv2-ev" aria-pressed={selected} onClick={onSelect}>{inner}</button>
  ) : (
    <div className="kv2-ev">{inner}</div>
  );
}

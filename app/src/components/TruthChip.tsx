import type { TruthLabel } from '../contract/types';
import type { Copy } from '../i18n/strings';

interface Props {
  readonly label: TruthLabel | 'unknown';
  readonly style: 'standard' | 'plain';
  readonly copy: Copy;
}

/** Truth label with shape as well as colour (solid, dashed, dotted, double), so it survives greyscale. */
export function TruthChip({ label, style, copy }: Props) {
  const text = style === 'plain' ? copy.plainLabel[label] : copy.label[label];
  return (
    <span className={`truth truth-${label}`} data-truth={label}>
      {text}
    </span>
  );
}

import type { Copy } from './i18n';

/** Truth is carried by pattern + marker + word, never by colour alone. */
export function LineSample({ truth }: { truth: 'observed' | 'unknown' | 'inferred' | 'unresolved' }) {
  const unknown = truth !== 'observed';
  return (
    <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden="true" focusable="false" className="lsample">
      <line x1="2" y1="7" x2={unknown ? 36 : 38} y2="7" className={unknown ? 'ln-unk' : 'ln-obs'} />
      {unknown ? <circle cx="39" cy="7" r="3.2" className="mk-unk" /> : <path d="M34 2 L42 7 L34 12 Z" className="mk-obs" />}
    </svg>
  );
}

export function Chip({ truth, copy }: { truth: string; copy: Copy }) {
  const obs = truth === 'observed';
  return (
    <span className={`chip ${obs ? 'chip-obs' : 'chip-unk'}`} data-truth={truth}>
      <span aria-hidden="true">{obs ? '✓' : '?'}</span> {obs ? copy.observed : copy.unknown}
    </span>
  );
}

export function Legend({ copy }: { copy: Copy }) {
  return (
    <ul className="legend" aria-label={copy.legend} data-testid="legend">
      <li><LineSample truth="observed" /><strong>{copy.observed}</strong>: {copy.observedNote}</li>
      <li><LineSample truth="unknown" /><strong>{copy.unknown}</strong>: {copy.unknownNote}</li>
      <li><span className="stub-sample" aria-hidden="true" /><strong>{copy.unresolved}</strong>: {copy.unresolvedNote}</li>
    </ul>
  );
}

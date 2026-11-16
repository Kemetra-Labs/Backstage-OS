interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly lang?: string;
}

interface Props<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly Option<T>[];
  readonly onChange: (v: T) => void;
}

/** Demo-only switch (persona, language). Buttons with aria-pressed, 44 px targets. */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      <span className="seg-label" aria-hidden="true">{label}</span>
      <div className="seg-btns">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            lang={o.lang}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

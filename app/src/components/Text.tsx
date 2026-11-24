import { segments } from '../i18n/format';

/** Renders copy with {braces} tokens isolated as left-to-right runs, so ids and times never reorder in Arabic. */
export function Text({ s }: { readonly s: string }) {
  return (
    <>
      {segments(s).map((seg, i) =>
        seg.ltr ? (
          <bdi key={i} dir="ltr" className="ltr">
            {seg.text}
          </bdi>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

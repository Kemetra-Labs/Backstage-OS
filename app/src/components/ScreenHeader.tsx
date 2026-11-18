import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { Text } from './Text';

interface Props {
  /** Copy with {braces} for left-to-right tokens (rendered through Text), or ready-made content. */
  readonly title: string | ReactNode;
  readonly crumbs?: readonly Crumb[];
  /** One short line under the title. */
  readonly lede?: ReactNode;
  /** Small meta chips (ids, product, age). */
  readonly meta?: ReactNode;
}

/** The one h1 of a screen, with optional breadcrumbs above and a lede below. */
export function ScreenHeader({ title, crumbs, lede, meta }: Props) {
  return (
    <div className="screen-head">
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <h1>{typeof title === 'string' ? <Text s={title} /> : title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {meta && <ul className="meta">{meta}</ul>}
    </div>
  );
}

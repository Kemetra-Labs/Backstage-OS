import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

interface Props {
  readonly title: string;
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
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {meta && <ul className="meta">{meta}</ul>}
    </div>
  );
}

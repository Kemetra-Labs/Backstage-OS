import { useApp } from '../app/AppContext';
import { Text } from './Text';

export interface Crumb {
  /** Copy with {braces} for left-to-right tokens. */
  readonly label: string;
  /** Route href (from hrefFor). The last crumb has none: it is the current page. */
  readonly href?: string;
}

/** Breadcrumb trail. "›" is bidi-mirrored, so it points the right way in Arabic with no override. */
export function Breadcrumbs({ items }: { readonly items: readonly Crumb[] }) {
  const { copy } = useApp();
  return (
    <nav aria-label={copy.breadcrumb} className="crumbs">
      <ol>
        {items.map((c, i) => (
          <li key={i}>
            {c.href ? <a href={c.href}><Text s={c.label} /></a> : <span aria-current="page"><Text s={c.label} /></span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

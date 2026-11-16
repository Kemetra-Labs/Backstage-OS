import { useApp } from '../app/AppContext';
import { WORLD } from '../fixture/world';
import type { NavKey } from '../i18n/shell';
import { hrefFor, sectionOf, type Route } from '../nav/routes';

const MAIN: ReadonlyArray<{ key: NavKey; route: Route }> = [
  { key: 'home', route: { name: 'home' } },
  { key: 'portfolio', route: { name: 'portfolio' } },
  { key: 'project', route: { name: 'project', projectId: 'RT' } },
  { key: 'investigation', route: { name: 'investigation', id: 'INV-DEMO-7' } },
  { key: 'decisions', route: { name: 'decisions' } },
];
const DEMO: ReadonlyArray<{ key: NavKey; route: Route }> = [
  { key: 'agents', route: { name: 'agents' } },
  { key: 'sources', route: { name: 'sources' } },
];

/** Main navigation. On wide screens a fixed column; on narrow screens a panel opened from the top bar's menu. */
export function Sidebar({ open }: { readonly open: boolean }) {
  const { route, shell } = useApp();
  const section = sectionOf(route);
  const projectId = route.name === 'project' ? route.projectId : null;

  const link = (key: NavKey, r: Route) => (
    <li key={key}>
      <a href={hrefFor(r)} aria-current={section === key && !(key === 'project' && projectId && projectId !== 'RT') ? 'page' : undefined} data-nav={key}>
        {shell.nav[key]}
      </a>
    </li>
  );

  return (
    <nav id="sidenav" className={`side${open ? ' open' : ''}`} aria-label={shell.navLabel}>
      <ul className="side-list">{MAIN.map((m) => link(m.key, m.route))}</ul>
      <p className="side-group" aria-hidden="true">{shell.projectsLabel}</p>
      <ul className="side-list" aria-label={shell.projectsLabel}>
        {WORLD.projects.map((p) => (
          <li key={p.id}>
            <a href={hrefFor({ name: 'project', projectId: p.id })} aria-current={projectId === p.id ? 'page' : undefined} data-nav-project={p.id}>
              <bdi dir="ltr">{p.name}</bdi>
            </a>
          </li>
        ))}
      </ul>
      <ul className="side-list side-demo">{DEMO.map((m) => link(m.key, m.route))}</ul>
    </nav>
  );
}

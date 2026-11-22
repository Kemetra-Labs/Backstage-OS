import { useApp } from '../app/AppContext';
import { needsDemoMarker } from '../contract/rules';
import type { Persona } from '../contract/types';
import { SOURCES } from '../fixture/inv-demo-7';
import { SourceChip } from '../components/SourceChip';
import { Segmented } from '../components/Segmented';
import { Text } from '../components/Text';
import { DemoSearch } from './DemoSearch';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const STRIP_SOURCES = Object.values(SOURCES);

interface Props {
  readonly menuOpen: boolean;
  readonly onMenu: () => void;
}

/** Brand, demo marker, search, the two demo switches and the workspace source strip (connectivity + freshness). */
export function TopBar({ menuOpen, onMenu }: Props) {
  const { persona, lang, copy, shell, world, setPersona, setLang } = useApp();
  /** The product these sources belong to, read from the data so the label cannot name the wrong one. */
  const STRIP_PRODUCT = world.projects.find((p) => STRIP_SOURCES.every((s) => p.sources.includes(s)))?.name;
  return (
    <header className="topbar">
      <div className="top-row">
        <div className="brand-row">
          <a className="brand" href="#/"><bdi dir="ltr">Kawalys</bdi></a>
          {needsDemoMarker(STRIP_SOURCES) && <span className="demo">{copy.demo}</span>}
          <button type="button" className="btn btn-quiet menu-btn" aria-expanded={menuOpen} aria-controls="sidenav" onClick={onMenu}>
            {shell.menu}
          </button>
        </div>
        <DemoSearch />
      </div>
      <div className="controls">
        <Segmented
          label={copy.viewAs}
          value={persona}
          options={PERSONAS.map((p) => ({ value: p, label: copy.persona[p] }))}
          onChange={setPersona}
        />
        <Segmented
          label={copy.language}
          value={lang}
          options={[{ value: 'en', label: 'EN', lang: 'en' }, { value: 'ar', label: 'عربي', lang: 'ar' }]}
          onChange={setLang}
        />
      </div>
      {/* These chips are one product's sources only; the label names it, so they never read as the whole workspace. */}
      <section className="sources" aria-labelledby="topbar-sources-label">
        {STRIP_PRODUCT && <p id="topbar-sources-label" className="sources-label"><Text s={shell.sourcesFor(STRIP_PRODUCT)} /></p>}
        <ul>
          {STRIP_SOURCES.map((s) => <SourceChip key={s.provider} source={s} copy={copy} lang={lang} />)}
        </ul>
      </section>
    </header>
  );
}

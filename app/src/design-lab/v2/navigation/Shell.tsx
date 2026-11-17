// V2 shell: top bar (brand, search, perspective, language), side navigation, and the screen outlet.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { Lt, Seg, T, Tx } from '../components/ui';
import { useV2 } from '../context';
import { WORLD } from '../fixtures/world';
import { plain, type K } from '../i18n/t';
import { buildHash, PERSONAS, type Route } from './route';
import { SCREENS, type ScreenId } from '../types';

const NAV: Readonly<Record<ScreenId, { readonly key: K; readonly icon: IconName }>> = {
  'mission-map': { key: 'nav.map', icon: 'network' },
  'source-observatory': { key: 'nav.obs', icon: 'db' },
  'mission-replay': { key: 'nav.replay', icon: 'play' },
  'agent-flight-deck': { key: 'nav.deck', icon: 'agent' },
};

const SCOPES: readonly { readonly id: string; readonly title: string }[] = [
  { id: 'retail-tower', title: 'Retail Tower OS' },
  { id: 'khepri', title: 'Khepri' },
  { id: 'seshat-bi', title: 'Seshat BI' },
];

/** V1 lives on its own dev ports; from the V2 dev/preview port the links point there, otherwise at the same origin. */
function v1Links(): { readonly app: string; readonly proto: string } {
  const onV2 = window.location.port === '4279';
  return { app: onV2 ? 'http://127.0.0.1:4178/' : '/', proto: 'http://127.0.0.1:8765/' };
}

interface Hit { readonly id: string; readonly label: string; readonly kind: K; readonly screen: ScreenId; readonly patch: Partial<Route> }

function useHits(): readonly Hit[] {
  const { t, copy } = useV2();
  return useMemo(() => {
    const out: Hit[] = [];
    for (const n of WORLD.nodes) out.push({ id: `n-${n.id}`, label: n.title, kind: `kind.${n.kind}` as K, screen: 'mission-map', patch: { node: n.id } });
    for (const s of WORLD.sources) out.push({ id: `s-${s.provider}`, label: copy.provider[s.provider], kind: 'kind.source', screen: 'source-observatory', patch: { src: s.provider } });
    for (const e of WORLD.replay) out.push({ id: `r-${e.id}`, label: `${e.id} ${plain(t(e.key as K))}`, kind: 'kind.evidence', screen: 'mission-replay', patch: { evt: e.id } });
    for (const m of WORLD.missions) out.push({ id: `m-${m.id}`, label: `${m.id} ${plain(t(m.key as K))}`, kind: 'kind.mission', screen: 'agent-flight-deck', patch: { msn: m.id } });
    return out;
  }, [t, copy]);
}

function Search() {
  const { t, open } = useV2();
  const hits = useHits();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | undefined>(undefined);
  const listId = useId();
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? hits.filter((h) => h.label.toLowerCase().includes(needle)).slice(0, 7) : [];
  }, [q, hits]);
  const show = focused && q.trim().length > 0;

  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const choose = (h: Hit) => { setQ(''); setActive(0); open(h.screen, h.patch); input.current?.blur(); };

  return (
    <div className="kv2-search">
      <Icon name="search" size={17} />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label={plain(t('search.label'))}
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show && results[active] ? `${listId}-${active}` : undefined}
        placeholder={plain(t('search.ph'))}
        value={q}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onFocus={() => { window.clearTimeout(blurTimer.current); setFocused(true); }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setFocused(false), 120); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]!); }
          else if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
        }}
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
      <ul id={listId} role="listbox" className="kv2-search-list" hidden={!show}>
        {results.map((h, i) => (
          <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(h); }}>
            <span><Tx s={h.label.startsWith('{') ? h.label : `{${h.label}}`} /></span>
            <small><T k={h.kind} /></small>
          </li>
        ))}
        {show && results.length === 0 && <li role="option" aria-selected="false" aria-disabled="true"><T k="search.none" /></li>}
      </ul>
    </div>
  );
}

export function Shell({ children }: { readonly children: ReactNode }) {
  const { route, copy, t, go } = useV2();
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const links = v1Links();

  const menuBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const on = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); menuBtn.current?.focus(); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [menu]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.focus({ preventScroll: true });
    setMenu(false);
  }, [route.screen]);

  return (
    <div className="kv2-app" data-screen={route.screen}>
      <a className="kv2-skip" href="#kv2-main">{copy.skip}</a>
      <header className="kv2-top">
        <button ref={menuBtn} type="button" className="kv2-menu-btn" aria-expanded={menu} aria-controls="kv2-side" onClick={() => setMenu((m) => !m)}>
          <Icon name="menu" size={20} />
          <span className="kv2-sr"><T k="nav.menu" /></span>
        </button>
        <div className="kv2-brand">
          <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true" focusable="false"><path className="kv2-logo" d="M9 23 19 1h6L15 23H9Zm13 0L32 1h6L28 23h-6Z" /></svg>
          <span lang="en" dir="ltr">Kawalys</span>
        </div>
        <p className="kv2-tag"><T k="brand.tag" /></p>
        <Search />
        <div className="kv2-top-controls">
          <span className="kv2-demo"><T k="demo" /></span>
          <Seg label={copy.viewAs} value={route.persona} options={PERSONAS.map((p) => ({ value: p, label: copy.persona[p] }))} onChange={(persona) => go({ persona })} className="kv2-seg-compact" />
          <Seg label={copy.language} value={route.lang} options={[{ value: 'en', label: <span lang="en">EN</span> }, { value: 'ar', label: <span lang="ar">عربي</span> }]} onChange={(lang) => go({ lang })} className="kv2-seg-compact" />
        </div>
      </header>

      <aside className="kv2-side" id="kv2-side" data-open={menu} aria-label={plain(t('nav.screens'))}>
        <div className="kv2-ws">
          <span className="kv2-ws-icon"><Icon name="target" size={20} /></span>
          <span><strong><T k="ws.name" /></strong><small><T k="ws.sub" /></small></span>
        </div>
        <nav aria-label={plain(t('nav.screens'))}>
          <ul>
            {SCREENS.map((s) => (
              <li key={s}>
                <a href={buildHash({ ...route, screen: s })} aria-current={route.screen === s ? 'page' : undefined}>
                  <Icon name={NAV[s].icon} size={19} />
                  <span><T k={NAV[s].key} /></span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="kv2-side-group">
          <h2><Icon name="layers" size={16} /><T k="scope.portfolios" /></h2>
          <ul>
            {SCOPES.map((sc) => (
              <li key={sc.id}>
                <button type="button" aria-pressed={route.scope === sc.id} onClick={() => go({ scope: sc.id })}>
                  <i aria-hidden="true" />
                  <Lt>{sc.title}</Lt>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="kv2-side-group kv2-side-v1">
          <h2><Icon name="flag" size={16} /><T k="nav.compare" /></h2>
          <ul>
            <li><a href={links.app}><Icon name="external" size={15} /><span><T k="nav.v1app" /></span></a></li>
            <li><a href={links.proto}><Icon name="external" size={15} /><span><T k="nav.v1proto" /></span></a></li>
          </ul>
        </div>
      </aside>

      <main id="kv2-main" ref={main} tabIndex={-1} className="kv2-main">
        {children}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { Lang, Persona } from './contract/types';
import { needsDemoMarker } from './contract/rules';
import { INV_DEMO_7 } from './fixture/inv-demo-7';
import { COPY } from './i18n/strings';
import { SourceChip } from './components/SourceChip';
import { Segmented } from './components/Segmented';
import { InvestigationRoom } from './screens/InvestigationRoom';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];

/** Optional review seed: ?persona=technical&lang=ar. Invalid values fall back to the defaults. */
function initial(): { persona: Persona; lang: Lang } {
  const q = new URLSearchParams(window.location.search);
  const p = q.get('persona');
  const l = q.get('lang');
  return {
    persona: PERSONAS.includes(p as Persona) ? (p as Persona) : 'owner',
    lang: l === 'ar' ? 'ar' : 'en',
  };
}

export function App() {
  const [{ persona, lang }, setState] = useState(initial);
  const copy = COPY[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `Kawalys · ${copy.h1}`;
  }, [lang, copy.h1]);

  return (
    <>
      <a className="skip" href="#main">{copy.skip}</a>
      <header className="topbar">
        <div className="brand-row">
          <bdi dir="ltr" className="brand">Kawalys</bdi>
          {needsDemoMarker(INV_DEMO_7.sources) && <span className="demo">{copy.demo}</span>}
        </div>
        <div className="controls">
          <Segmented
            label={copy.viewAs}
            value={persona}
            options={PERSONAS.map((p) => ({ value: p, label: copy.persona[p] }))}
            onChange={(p) => setState((s) => ({ ...s, persona: p }))}
          />
          <Segmented
            label={copy.language}
            value={lang}
            options={[{ value: 'en', label: 'EN', lang: 'en' }, { value: 'ar', label: 'عربي', lang: 'ar' }]}
            onChange={(l) => setState((s) => ({ ...s, lang: l }))}
          />
        </div>
        <section className="sources" aria-label={copy.sources}>
          <ul>
            {INV_DEMO_7.sources.map((s) => <SourceChip key={s.provider} source={s} copy={copy} lang={lang} />)}
          </ul>
        </section>
      </header>
      <InvestigationRoom persona={persona} lang={lang} copy={copy} />
    </>
  );
}

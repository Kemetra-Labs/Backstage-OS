import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext, type AppState } from './app/AppContext';
import type { Lang, Persona } from './contract/types';
import { COPY } from './i18n/strings';
import { SHELL } from './i18n/shell';
import type { Route } from './nav/routes';
import { useRoute } from './nav/useRoute';
import { AppShell } from './shell/AppShell';
import { Agents } from './screens/Agents';
import { DecisionDetail } from './screens/DecisionDetail';
import { Decisions } from './screens/Decisions';
import { Evidence } from './screens/Evidence';
import { Home } from './screens/Home';
import { InvestigationRoute } from './screens/InvestigationRoute';
import { NotFound } from './screens/NotFound';
import { Portfolio } from './screens/Portfolio';
import { Project } from './screens/Project';
import { Sources } from './screens/Sources';

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

function screenFor(route: Route) {
  switch (route.name) {
    case 'home': return <Home />;
    case 'portfolio': return <Portfolio />;
    case 'project': return <Project projectId={route.projectId} {...(route.componentId ? { componentId: route.componentId } : {})} />;
    case 'investigation': return <InvestigationRoute id={route.id} />;
    case 'evidence': return <Evidence id={route.id} {...(route.from ? { from: route.from } : {})} />;
    case 'decisions': return <Decisions />;
    case 'decision': return <DecisionDetail id={route.id} />;
    case 'agents': return <Agents />;
    case 'sources': return <Sources />;
    case 'notFound': return <NotFound />;
  }
}

export function App() {
  const [{ persona, lang }, setState] = useState(initial);
  const route = useRoute();
  const copy = COPY[lang];
  const shell = SHELL[lang];

  const setPersona = useCallback((p: Persona) => setState((s) => ({ ...s, persona: p })), []);
  const setLang = useCallback((l: Lang) => setState((s) => ({ ...s, lang: l })), []);

  // Keep the demo switches in the URL so a reload or a shared review link shows the same view.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set('persona', persona);
    q.set('lang', lang);
    window.history.replaceState(null, '', `?${q.toString()}${window.location.hash}`);
  }, [persona, lang]);

  const title = route.name === 'investigation' ? copy.h1
    : route.name === 'evidence' ? copy.evidenceTitle
    : route.name === 'decision' ? shell.nav.decisions
    : route.name === 'notFound' ? shell.notFound.title
    : shell.nav[route.name];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `Kawalys · ${title}`;
  }, [lang, title]);

  const value = useMemo<AppState>(
    () => ({ persona, lang, copy, shell, route, setPersona, setLang }),
    [persona, lang, copy, shell, route, setPersona, setLang],
  );

  return (
    <AppContext.Provider value={value}>
      <AppShell>{screenFor(route)}</AppShell>
    </AppContext.Provider>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext, type AppState } from './app/AppContext';
import { SessionContext } from './app/SessionContext';
import type { Lang, Persona } from './contract/types';
import { INV_DEMO_7 } from './fixture/inv-demo-7';
import { WORLD } from './fixture/world';
import { authorizedInvestigation, authorizedWorld } from './view/authorize';
import type { Route } from './nav/routes';
import { useRoute } from './nav/useRoute';
import { AppShell } from './shell/AppShell';
import { Agents } from './screens/Agents';
import { MissionMap } from './screens/MissionMap';
import { DecisionDetail } from './screens/DecisionDetail';
import { Decisions } from './screens/Decisions';
import { Evidence } from './screens/Evidence';
import { Home } from './screens/Home';
import { InvestigationRoute } from './screens/InvestigationRoute';
import { NotFound } from './screens/NotFound';
import { Portfolio } from './screens/Portfolio';
import { Project } from './screens/Project';
import { Shadow } from './screens/Shadow';
import { Sources } from './screens/Sources';
import { hostCopy } from './i18n/host';
import { LIVE } from './live/reads';
import { listenForReturn, SessionStore } from './live/session';
import { SignInPage } from './live/signInPage';
import { isSignInRoute } from './live/signInFlow';

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
    case 'map': return <MissionMap />;
    case 'project': return <Project projectId={route.projectId} {...(route.componentId ? { componentId: route.componentId } : {})} />;
    case 'investigation': return <InvestigationRoute id={route.id} />;
    case 'evidence': return <Evidence id={route.id} {...(route.from ? { from: route.from } : {})} />;
    case 'decisions': return <Decisions />;
    case 'decision': return <DecisionDetail id={route.id} />;
    case 'agents': return <Agents />;
    case 'sources': return <Sources />;
    case 'shadow': return <Shadow />;
    case 'notFound': return <NotFound />;
  }
}

/**
 * D3(a): in live mode the path /sign-in is the sign-in page, bare (no shell: the magic link returns there with ?t=..., which the shell's
 * URL sync would rewrite). In the default (fixture) build isSignInRoute is false, so /sign-in is the normal app. The app's own routes
 * are hash routes; this one is a path because the Descope redirect URL is one. The path is fixed for a page's life, so which
 * component renders never changes between renders. `LIVE &&` in front is load-bearing: it lets the build drop SignInPage (and so the Descope
 * import) from the default build; without it the fixture build ships Descope code (checked: 4 files).
 */
export function App() {
  return LIVE && isSignInRoute(window.location.pathname, LIVE)
    ? <SignInPage projectId={import.meta.env.VITE_KAWALYS_DESCOPE_PROJECT_ID} />
    : <MainApp />;
}

function MainApp() {
  const [{ persona, lang }, setState] = useState(initial);
  const route = useRoute();
  // Live mode only (BACK-51 P2): one session store for the app's life, above every screen. The default build creates none.
  const [session] = useState(() => (LIVE ? new SessionStore() : null));
  // BACK-127: the first check, and a read-only re-check when the owner comes back (tab visible, online); no timer.
  useEffect(() => {
    if (!session) return undefined;
    void session.start();
    return listenForReturn(session);
  }, [session]);
  const copy = hostCopy('COPY', lang);
  const shell = hostCopy('SHELL', lang);

  const world = useMemo(() => authorizedWorld(WORLD, persona), [persona]);
  const investigation = useMemo(() => authorizedInvestigation(INV_DEMO_7, persona), [persona]);

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
    : route.name === 'shadow' ? hostCopy('SHADOW_COPY', lang).title
    : shell.nav[route.name];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `Kawalys · ${title}`;
  }, [lang, title]);

  const value = useMemo<AppState>(
    () => ({ persona, lang, copy, shell, route, world, investigation, setPersona, setLang }),
    [persona, lang, copy, shell, route, world, investigation, setPersona, setLang],
  );

  return (
    <AppContext.Provider value={value}>
      <SessionContext.Provider value={session}>
        <AppShell>{screenFor(route)}</AppShell>
      </SessionContext.Provider>
    </AppContext.Provider>
  );
}

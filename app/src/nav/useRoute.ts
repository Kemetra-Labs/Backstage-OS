import { useEffect, useRef, useState } from 'react';
import { parseHash, type Route } from './routes';

/**
 * The screen a route shows. Selecting something inside a screen (a component on the project map) changes the hash but
 * not the screen, so it must not steal focus or scroll.
 */
export function screenKey(r: Route): string {
  switch (r.name) {
    case 'project': return `project:${r.projectId}`;
    case 'investigation': case 'evidence': case 'decision': return `${r.name}:${r.id}`;
    case 'notFound': return `notFound:${r.path}`;
    default: return r.name;
  }
}

/**
 * Current hash route. When navigation reaches a different screen (not the first render, not an in-screen selection),
 * focus moves to <main> and the page scrolls to the top, so keyboard and screen-reader users land on the new screen.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const lastScreen = useRef(screenKey(route));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const key = screenKey(route);
    if (key === lastScreen.current) return;
    lastScreen.current = key;
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  return route;
}

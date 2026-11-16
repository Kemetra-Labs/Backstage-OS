import { useEffect, useRef, useState } from 'react';
import { parseHash, type Route } from './routes';

/**
 * Current hash route. After a navigation (not the first render) focus moves to <main> and the page scrolls to the
 * top, so keyboard and screen-reader users land on the new screen instead of the old link.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const navigated = useRef(false);

  useEffect(() => {
    const onHash = () => {
      navigated.current = true;
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!navigated.current) return;
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  return route;
}

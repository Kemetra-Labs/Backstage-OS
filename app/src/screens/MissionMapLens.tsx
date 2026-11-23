// BACK-87: the B+C Mission Map inside the host shell. One AppShell, one persona and language, one router: the map's components read
// a `useV2()` value that src/bridge/hostV2.ts derives from the host's AppContext, and every change they ask for is a host
// navigation. This is not the V2 shell and not a second V2Provider. Loaded lazily (see MissionMap.tsx) so its stylesheets and code
// reach the page only on this route. Synthetic demo data only; persona is a display switch, not authorization.
import { useEffect, useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toHostRoute, toMapContext } from '../bridge/mapContext';
import { mapRoute, toV2 } from '../bridge/hostV2';
import { V2Context } from '../design-lab/v2/context';
import { fallbackNode, MissionMapBC } from '../design-lab/v2/screens/MissionMapBC';
import { MAP_LENS_COPY } from '../i18n/screens/map';
import { hrefFor, type Route } from '../nav/routes';
import '../design-lab/v2/styles/tokens.css';
import '../design-lab/v2/styles/embed-fonts.css';
import '../design-lab/v2/styles/base.css';
import '../design-lab/v2/styles/scope.css';
import '../design-lab/v2/styles/map.css';
import '../design-lab/v2/styles/bc.css';
import '../design-lab/v2/styles/observatory.css';
import '../design-lab/v2/styles/replay.css';
import '../design-lab/v2/styles/deck.css';
import '../styles/semantic.css';

const navigate = (r: Route): void => { window.location.hash = hrefFor(r); };

export default function MissionMapLens() {
  const { persona, lang, route } = useApp();
  const copy = MAP_LENS_COPY[lang];
  const value = useMemo(() => toV2({ persona, lang, route }, { navigate }), [persona, lang, route]);
  const ctx = useMemo(() => toMapContext({ persona, lang, route }), [persona, lang, route]);
  // The link describes what the map is showing: the selected node, or the node the map falls back to when none is selected.
  const project = useMemo(() => toHostRoute({ scope: ctx.scope, node: ctx.node ?? fallbackNode(ctx.scope) }, persona), [ctx, persona]);

  // A node id the persona's world does not hold is dropped from the selection; it is also taken out of the address, so a typed or
  // restricted id is not kept in the URL, the history or a copied link. (replaceState: no new history entry, no navigation.)
  useEffect(() => {
    if (route.name === 'map' && route.node !== undefined && ctx.node === null) {
      window.history.replaceState(null, '', `${window.location.search}${hrefFor(mapRoute(ctx, {}))}`);
    }
  }, [route, ctx]);

  return (
    <V2Context.Provider value={value}>
      <section className="kv2-scope" aria-label={copy.region} data-testid="mission-map-lens">
        <MissionMapBC />
        <p className="kv2-host-link">
          {project
            ? <a href={hrefFor(project)} data-testid="map-open-project">{copy.openProject}</a>
            : <span data-testid="map-no-project">{copy.noProject}</span>}
          {project && <span className="kv2-host-note"> {copy.openProjectNote}</span>}
        </p>
      </section>
    </V2Context.Provider>
  );
}

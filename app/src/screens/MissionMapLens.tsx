// BACK-87: the B+C Mission Map inside the host shell. One AppShell, one persona and language, one router: the map's components read
// the host's AppContext through `useLens()` (src/lenses/useLens.ts, via src/bridge/lensState.ts), and every change they ask for is
// a host navigation. This is not the V2 shell and there is no provider. Loaded lazily (see MissionMap.tsx) so its stylesheets and code
// reach the page only on this route. Synthetic demo data only; persona is a display switch, not authorization.
import { useEffect, useMemo } from 'react';
import { useApp } from '../app/AppContext';
import { toHostRoute, toMapContext } from '../bridge/mapContext';
import { mapRoute } from '../bridge/lensState';
import { fallbackNode, MissionMapBC } from '../lenses/screens/MissionMapBC';
import { MAP_LENS_COPY } from '../i18n/screens/map';
import { hrefFor } from '../nav/routes';
import './lensStyles';

export default function MissionMapLens() {
  const { persona, lang, route } = useApp();
  const copy = MAP_LENS_COPY[lang];
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
    <section className="kv2-scope" aria-label={copy.region} data-testid="mission-map-lens">
      <MissionMapBC />
      <p className="kv2-host-link">
        {project
          ? <a href={hrefFor(project)} data-testid="map-open-project">{copy.openProject}</a>
          : <span data-testid="map-no-project">{copy.noProject}</span>}
        {project && <span className="kv2-host-note"> {copy.openProjectNote}</span>}
      </p>
    </section>
  );
}

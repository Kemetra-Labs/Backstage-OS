// BACK-87: the Mission Map route becomes a map context, and the host adapter builds the map's useLens value from host state only.
// Persona is a display switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import type { Lang, Persona } from '../contract/types';
import { DOMAIN } from '../domain/fixture';
import { WORLD } from '../fixture/world';
import { translate } from '../i18n';
import { authorizedWorld } from '../view/authorize';
import { DEFAULT_ROUTE } from '../lenses/navigation/route';
import { COPY } from '../i18n/strings';
import { hrefFor, MAP_SCOPES, parseHash, type Route } from '../nav/routes';
import { deckRoute, hostRouteFor, mapRoute, replayRoute, toLensState } from './lensState';
import { MAP_DEFAULT_SCOPE, toMapContext, type HostView } from './mapContext';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const LANGS: readonly Lang[] = ['en', 'ar'];
const view = (persona: Persona, lang: Lang, hash: string): HostView => ({ persona, lang, route: parseHash(hash) });
const restricted = (json: string): boolean => /"E-5"|"O-5"/.test(json);
const nav = () => {
  const seen: Route[] = [];
  return { seen, navigate: (r: Route): void => { seen.push(r); } };
};

describe('the Mission Map route becomes a map context', () => {
  it('opens on the standalone lens default scope when the route names none, and the route scopes are real map nodes', () => {
    expect(MAP_DEFAULT_SCOPE).toBe(DEFAULT_ROUTE.scope);
    expect(toMapContext(view('owner', 'en', '#/map'))).toMatchObject({ scope: 'retail-tower', node: null, origin: 'map' });
    for (const s of MAP_SCOPES.filter((x) => x !== 'all')) expect(WORLD.graph.nodes.some((n) => n.id === s), s).toBe(true);
  });

  it('takes scope and node from the route, for any node of the persona\'s authorized world', () => {
    expect(toMapContext(view('owner', 'en', '#/map/khepri'))).toMatchObject({ scope: 'khepri', node: null });
    expect(toMapContext(view('owner', 'ar', '#/map/retail-tower/inventory'))).toMatchObject({ scope: 'retail-tower', node: 'inventory', dir: 'rtl' });
    expect(toMapContext(view('nontechnical', 'en', '#/map/all/github'))).toMatchObject({ scope: 'all', node: 'github' });
  });

  it('drops an id that is not a node of the world (an evidence id, a foreign id) and never carries it; the trimmed-world test below exercises the world check itself', () => {
    for (const node of ['E-5', 'O-5', 'nope', 'constructor']) {
      for (const p of PERSONAS) {
        const ctx = toMapContext(view(p, 'en', `#/map/retail-tower/${node}`));
        expect(ctx.node, `${p} ${node}`).toBeNull();
        expect(restricted(JSON.stringify(ctx)), `${p} ${node}`).toBe(false);
      }
    }
  });
});

describe('the host adapter builds the map\'s useLens value from host state', () => {
  it.each(PERSONAS.flatMap((p) => LANGS.map((l) => [p, l] as const)))('%s / %s: route, copy and translator come from the host', (p, l) => {
    const lens = toLensState(view(p, l, '#/map/retail-tower/stock-sync'), nav());
    expect(lens.route).toMatchObject({ screen: 'mission-map', persona: p, lang: l, scope: 'retail-tower', node: 'stock-sync' });
    expect(lens.copy).toBe(COPY[l]);
    expect(lens.t('nav.map')).toBe(translate('nav.map', l, p));
  });

  it('turns every change the map asks for into a host navigation', () => {
    const n = nav();
    const lens = toLensState(view('owner', 'en', '#/map/retail-tower/stock-sync'), n);
    lens.go({ node: 'pos' });
    lens.go({ scope: 'khepri', node: null });
    lens.go({ scope: 'seshat-bi' });
    lens.go({ node: null });
    expect(n.seen).toEqual([
      { name: 'map', scope: 'retail-tower', node: 'pos' },
      { name: 'map', scope: 'khepri' },
      { name: 'map', scope: 'seshat-bi' },
      { name: 'map', scope: 'retail-tower' },
    ]);
  });

  it('maps the standalone lens app\'s other screens to host routes, and ignores a scope that is not a map scope', () => {
    const n = nav();
    const lens = toLensState(view('technical', 'en', '#/map/retail-tower/stock-sync'), n);
    lens.open('source-observatory', { src: 'github' });
    lens.open('source-observatory');
    lens.open('mission-replay');
    lens.open('agent-flight-deck');
    lens.open('mission-map', { node: 'pos' });
    lens.go({ scope: '<script>' });
    expect(n.seen).toEqual([
      { name: 'sources', view: 'observatory', src: 'github' },
      { name: 'sources', view: 'observatory' },
      { name: 'investigation', id: DOMAIN.investigationId, view: 'replay' },
      { name: 'agents', view: 'deck' },
      { name: 'map', scope: 'retail-tower', node: 'pos' },
      { name: 'map', scope: 'retail-tower', node: 'stock-sync' },
    ]);
    expect(hostRouteFor('mission-map', toMapContext(view('owner', 'en', '#/')))).toEqual({ name: 'map', scope: 'all' });
  });

  it('on the Sources screen the route carries the selected source, and a change is a source change', () => {
    const n = nav();
    const lens = toLensState(view('owner', 'ar', '#/sources/observatory/sentry'), n);
    expect(lens.route).toMatchObject({ screen: 'source-observatory', src: 'sentry', persona: 'owner', lang: 'ar' });
    lens.go({ src: 'port' });
    lens.open('source-observatory', { src: 'jira' });
    expect(n.seen).toEqual([{ name: 'sources', view: 'observatory', src: 'port' }, { name: 'sources', view: 'observatory', src: 'jira' }]);
    expect(toLensState(view('owner', 'en', '#/sources/observatory'), nav()).route.src).toBe(DEFAULT_ROUTE.src);
    expect(toLensState(view('owner', 'en', '#/sources'), nav()).route.screen).toBe('source-observatory');
  });

  it('on the replay view the route carries the event, and moving the cursor replaces the history entry instead of adding one', () => {
    const pushed: Route[] = [];
    const replaced: Route[] = [];
    const nav2 = { navigate: (r: Route) => { pushed.push(r); }, replace: (r: Route) => { replaced.push(r); } };
    const lens = toLensState(view('technical', 'en', '#/investigation/INV-DEMO-7/replay/R-4'), nav2);
    expect(lens.route).toMatchObject({ screen: 'mission-replay', evt: 'R-4' });
    lens.go({ evt: 'R-5' });
    lens.open('agent-flight-deck');
    expect(replaced).toEqual([replayRoute('INV-DEMO-7', 'R-5')]);
    expect(pushed).toEqual([{ name: 'agents', view: 'deck' }]);
    // Without a replace hook the host falls back to a navigation rather than dropping the change.
    const n = nav();
    toLensState(view('owner', 'en', '#/investigation/INV-DEMO-7/replay'), n).go({ evt: 'R-2' });
    expect(n.seen).toEqual([replayRoute('INV-DEMO-7', 'R-2')]);
    expect(toLensState(view('owner', 'en', '#/investigation/INV-DEMO-7/replay'), nav()).route.evt).toBeNull();
  });

  it('on the Flight Deck view the route carries the mission, and a change is a navigation to that mission', () => {
    const n = nav();
    const lens = toLensState(view('owner', 'ar', '#/agents/deck/MSN-DEMO-2'), n);
    expect(lens.route).toMatchObject({ screen: 'agent-flight-deck', msn: 'MSN-DEMO-2', persona: 'owner', lang: 'ar' });
    lens.go({ msn: 'MSN-DEMO-3' });
    lens.open('agent-flight-deck', { msn: 'MSN-DEMO-4' });
    expect(n.seen).toEqual([deckRoute('MSN-DEMO-3'), deckRoute('MSN-DEMO-4')]);
    expect(toLensState(view('owner', 'en', '#/agents/deck'), nav()).route.msn).toBe(DEFAULT_ROUTE.msn);
    expect(toLensState(view('owner', 'en', '#/agents'), nav()).route.screen).toBe('mission-map');
  });

  it('every route it produces survives the host href and parser, and carries no restricted id', () => {
    const n = nav();
    const lens = toLensState(view('owner', 'ar', '#/map'), n);
    for (const node of ['stock-sync', 'pos', 'inventory', 'github', null]) lens.go({ node });
    for (const r of n.seen) {
      expect(parseHash(hrefFor(r))).toEqual(r);
      expect(restricted(JSON.stringify(r))).toBe(false);
    }
    expect(restricted(JSON.stringify(mapRoute(toMapContext(view('nontechnical', 'en', '#/map')), { node: 'inventory' })))).toBe(false);
  });

  it('uses the world it is given: a node outside it is not selected', () => {
    const w = authorizedWorld(WORLD, 'owner');
    const trimmed = { ...w, graph: { ...w.graph, nodes: w.graph.nodes.filter((x) => x.id !== 'pos') } };
    expect(toLensState(view('owner', 'en', '#/map/retail-tower/pos'), nav(), trimmed).route.node).toBeNull();
    expect(toLensState(view('owner', 'en', '#/map/retail-tower/pos'), nav(), w).route.node).toBe('pos');
  });
});

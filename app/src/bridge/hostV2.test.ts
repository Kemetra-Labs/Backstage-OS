// BACK-87: the Mission Map route becomes a map context, and the host adapter builds the map's useV2 value from host state only.
// Persona is a display switch on synthetic data, not authorization.
import { describe, expect, it } from 'vitest';
import type { Lang, Persona } from '../contract/types';
import { DOMAIN } from '../domain/fixture';
import { WORLD as V2 } from '../design-lab/v2/fixtures/world';
import { translate } from '../design-lab/v2/i18n/t';
import { authorizedWorld } from '../design-lab/v2/logic/authorize';
import { DEFAULT_ROUTE } from '../design-lab/v2/navigation/route';
import { COPY } from '../i18n/strings';
import { hrefFor, MAP_SCOPES, parseHash, type Route } from '../nav/routes';
import { hostRouteFor, mapRoute, toV2 } from './hostV2';
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
  it('opens on the lab default scope when the route names none, and the route scopes are real map nodes', () => {
    expect(MAP_DEFAULT_SCOPE).toBe(DEFAULT_ROUTE.scope);
    expect(toMapContext(view('owner', 'en', '#/map'))).toMatchObject({ scope: 'retail-tower', node: null, origin: 'map' });
    for (const s of MAP_SCOPES.filter((x) => x !== 'all')) expect(V2.nodes.some((n) => n.id === s), s).toBe(true);
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

describe('the host adapter builds the map\'s useV2 value from host state', () => {
  it.each(PERSONAS.flatMap((p) => LANGS.map((l) => [p, l] as const)))('%s / %s: route, copy and translator come from the host', (p, l) => {
    const v2 = toV2(view(p, l, '#/map/retail-tower/stock-sync'), nav());
    expect(v2.route).toMatchObject({ screen: 'mission-map', persona: p, lang: l, scope: 'retail-tower', node: 'stock-sync' });
    expect(v2.copy).toBe(COPY[l]);
    expect(v2.t('nav.map')).toBe(translate('nav.map', l, p));
  });

  it('turns every change the map asks for into a host navigation', () => {
    const n = nav();
    const v2 = toV2(view('owner', 'en', '#/map/retail-tower/stock-sync'), n);
    v2.go({ node: 'pos' });
    v2.go({ scope: 'khepri', node: null });
    v2.go({ scope: 'seshat-bi' });
    v2.go({ node: null });
    expect(n.seen).toEqual([
      { name: 'map', scope: 'retail-tower', node: 'pos' },
      { name: 'map', scope: 'khepri' },
      { name: 'map', scope: 'seshat-bi' },
      { name: 'map', scope: 'retail-tower' },
    ]);
  });

  it('maps the lab\'s other screens to host routes, and ignores a scope that is not a map scope', () => {
    const n = nav();
    const v2 = toV2(view('technical', 'en', '#/map/retail-tower/stock-sync'), n);
    v2.open('source-observatory', { src: 'github' });
    v2.open('mission-replay');
    v2.open('agent-flight-deck');
    v2.open('mission-map', { node: 'pos' });
    v2.go({ scope: '<script>' });
    expect(n.seen).toEqual([
      { name: 'sources' },
      { name: 'investigation', id: DOMAIN.investigationId },
      { name: 'agents' },
      { name: 'map', scope: 'retail-tower', node: 'pos' },
      { name: 'map', scope: 'retail-tower', node: 'stock-sync' },
    ]);
    expect(hostRouteFor('mission-map', toMapContext(view('owner', 'en', '#/')))).toEqual({ name: 'map', scope: 'all' });
  });

  it('every route it produces survives the host href and parser, and carries no restricted id', () => {
    const n = nav();
    const v2 = toV2(view('owner', 'ar', '#/map'), n);
    for (const node of ['stock-sync', 'pos', 'inventory', 'github', null]) v2.go({ node });
    for (const r of n.seen) {
      expect(parseHash(hrefFor(r))).toEqual(r);
      expect(restricted(JSON.stringify(r))).toBe(false);
    }
    expect(restricted(JSON.stringify(mapRoute(toMapContext(view('nontechnical', 'en', '#/map')), { node: 'inventory' })))).toBe(false);
  });

  it('uses the world it is given: a node outside it is not selected', () => {
    const w = authorizedWorld(V2, 'owner');
    const trimmed = { ...w, nodes: w.nodes.filter((x) => x.id !== 'pos') };
    expect(toV2(view('owner', 'en', '#/map/retail-tower/pos'), nav(), trimmed).route.node).toBeNull();
    expect(toV2(view('owner', 'en', '#/map/retail-tower/pos'), nav(), w).route.node).toBe('pos');
  });
});

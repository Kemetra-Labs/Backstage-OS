// BACK-85 (S5a): the typed identity crosswalk and the pure host-to-map context. Persona is a display switch on synthetic data,
// not authorization. These tests pin the crosswalk to the two fixtures (so a rename or a new project cannot silently drift),
// prove nothing maps by name alone, and prove the context carries no restricted record and holds no state of its own.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Lang, Persona } from '../contract/types';
import { DOMAIN } from '../domain/fixture';
import { WORLD as V1 } from '../fixture/world';
import { WORLD as V2 } from '../design-lab/v2/fixtures/world';
import { authorizedWorld } from '../design-lab/v2/logic/authorize';
import { hrefFor, parseHash, type Route } from '../nav/routes';
import { COMPONENT_PROJECT, IDENTITIES, isSharedComponent, mapIdOfProject, projectOfMapId } from './identity';
import { permittedNode, toHostRoute, toHostRouteIn, toMapContext, toMapContextIn, type HostView } from './mapContext';

const PERSONAS: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const LANGS: readonly Lang[] = ['en', 'ar'];
const LAY: readonly Persona[] = ['owner', 'nontechnical'];
const view = (persona: Persona, lang: Lang, hash: string): HostView => ({ persona, lang, route: parseHash(hash) });
const restricted = (json: string): boolean => /"E-5"|"O-5"/.test(json);

describe('identity crosswalk is pinned to the fixtures', () => {
  it('names every host project exactly once, and no project that does not exist', () => {
    expect(IDENTITIES.map((e) => e.host).sort()).toEqual(V1.projects.map((p) => p.id).sort());
  });

  it('every map id is a node of the V2 fixture, of the kind the crosswalk records', () => {
    for (const e of IDENTITIES) expect(V2.nodes.find((n) => n.id === e.map)?.kind, e.map).toBe(e.mapKind);
  });

  it('RT is verified structurally: the host, the canonical model and the map agree on the same components', () => {
    const rt = V1.projects.find((p) => p.id === 'RT')!;
    const canonical = DOMAIN.components.map((c) => c.id);
    for (const id of canonical) expect(rt.components.map((c) => c.id), `V1 RT has ${id}`).toContain(id);
    const grouped = V2.edges.filter((e) => e.cls === 'group' && e.a === 'retail-tower').map((e) => e.b).sort();
    expect(grouped).toEqual([...canonical].sort());
    expect(rt.name).toBe('Retail Tower OS');
    expect(V2.nodes.find((n) => n.id === 'retail-tower')!.title).toBe('Retail Tower OS');
  });

  it('KH is not verified: a similar name only, with no shared component and no shared evidence', () => {
    const kh = V1.projects.find((p) => p.id === 'KH')!;
    const khepri = V2.nodes.find((n) => n.id === 'khepri')!;
    expect(kh.name).toBe(khepri.title);
    const mapIds = new Set(V2.nodes.map((n) => n.id));
    expect(kh.components.filter((c) => mapIds.has(c.id))).toEqual([]);
    expect(V2.edges.filter((e) => e.cls === 'group' && e.a === 'khepri')).toEqual([]);
    expect(khepri.evidence).toEqual([]);
    expect(IDENTITIES.find((e) => e.host === 'KH')!.status).toBe('unresolved');
  });

  it('SB is ambiguous: a project on the host side, a service on the map side', () => {
    expect(V1.projects.some((p) => p.id === 'SB')).toBe(true);
    expect(V2.nodes.find((n) => n.id === 'seshat-bi')!.kind).toBe('service');
    expect(IDENTITIES.find((e) => e.host === 'SB')!.status).toBe('ambiguous');
  });

  it('exactly one identity is verified, and every entry explains itself', () => {
    expect(IDENTITIES.filter((e) => e.status === 'verified').map((e) => e.host)).toEqual(['RT']);
    for (const e of IDENTITIES) expect(e.basis.length, e.host).toBeGreaterThan(20);
  });
});

describe('resolution is explicit about what it does not know', () => {
  it('resolves RT both ways and round-trips', () => {
    expect(mapIdOfProject('RT')).toEqual({ kind: 'verified', id: 'retail-tower' });
    expect(projectOfMapId('retail-tower')).toEqual({ kind: 'verified', id: 'RT' });
    for (const e of IDENTITIES.filter((x) => x.status === 'verified')) {
      const m = mapIdOfProject(e.host);
      expect(m.kind === 'verified' && projectOfMapId(m.id)).toEqual({ kind: 'verified', id: e.host });
    }
  });

  it('never invents a counterpart for an unverified project or node', () => {
    expect(mapIdOfProject('KH')).toEqual({ kind: 'unresolved' });
    expect(mapIdOfProject('SB')).toEqual({ kind: 'ambiguous' });
    expect(projectOfMapId('khepri')).toEqual({ kind: 'unresolved' });
    expect(projectOfMapId('seshat-bi')).toEqual({ kind: 'ambiguous' });
  });

  it.each(['XX', '', 'rt', 'constructor', '__proto__', 'toString', 'E-5', 'github'])('treats %j as foreign in both directions', (id) => {
    expect(mapIdOfProject(id)).toEqual({ kind: 'foreign' });
    expect(projectOfMapId(id)).toEqual({ kind: 'foreign' });
  });

  it('shares only the components the canonical model owns', () => {
    for (const id of ['pos', 'stock-sync', 'inventory']) expect(isSharedComponent(id), id).toBe(true);
    for (const id of ['payments', 'api-gateway', 'reporting', 'github', 'sentry', 'retail-tower', 'constructor']) expect(isSharedComponent(id), id).toBe(false);
    expect(COMPONENT_PROJECT).toBe('RT');
  });
});

describe('the host route becomes a map context, and nothing else', () => {
  it.each(PERSONAS.flatMap((p) => LANGS.map((l) => [p, l] as const)))('%s / %s: a shared component is the selection inside the verified scope', (p, l) => {
    expect(toMapContext(view(p, l, '#/project/RT/stock-sync'))).toEqual({
      persona: p, lang: l, dir: l === 'ar' ? 'rtl' : 'ltr', scope: 'retail-tower', node: 'stock-sync', origin: 'verified',
    });
  });

  it('English and Arabic differ only in language and direction', () => {
    for (const p of PERSONAS) {
      const { lang: _l, dir: _d, ...en } = toMapContext(view(p, 'en', '#/project/RT/pos'));
      const { lang: _l2, dir: _d2, ...ar } = toMapContext(view(p, 'ar', '#/project/RT/pos'));
      expect(ar).toEqual(en);
    }
    expect(toMapContext(view('owner', 'ar', '#/')).dir).toBe('rtl');
    expect(toMapContext(view('owner', 'en', '#/')).dir).toBe('ltr');
  });

  it('a project route with no component scopes the map and selects nothing', () => {
    expect(toMapContext(view('owner', 'en', '#/project/RT'))).toMatchObject({ scope: 'retail-tower', node: null, origin: 'verified' });
  });

  it('a route that is not a project has no map scope and no selection', () => {
    for (const h of ['#/', '#/portfolio', '#/agents', '#/sources', '#/decisions', '#/investigation/INV-DEMO-7', '#/evidence/E-1', '#/nope']) {
      expect(toMapContext(view('owner', 'en', h)), h).toMatchObject({ scope: 'all', node: null, origin: 'none' });
    }
  });

  it('an unverified project is never silently mapped, and its component is never selected', () => {
    expect(toMapContext(view('owner', 'en', '#/project/KH'))).toMatchObject({ scope: 'all', node: null, origin: 'unresolved' });
    expect(toMapContext(view('owner', 'en', '#/project/SB'))).toMatchObject({ scope: 'all', node: null, origin: 'ambiguous' });
    expect(toMapContext(view('owner', 'en', '#/project/ZZ'))).toMatchObject({ scope: 'all', node: null, origin: 'foreign' });
    const kh = V1.projects.find((p) => p.id === 'KH')!.components[0]!.id;
    expect(toMapContext(view('owner', 'en', `#/project/KH/${kh}`)).node).toBeNull();
  });

  it('a component the host has but the map lacks, or a foreign id, is not selected', () => {
    for (const c of ['payments', 'api-gateway', 'github', 'E-5', 'O-5', 'constructor', 'retail-tower']) {
      expect(toMapContext(view('owner', 'en', `#/project/RT/${c}`)).node, c).toBeNull();
    }
  });

  it('a selection the persona\'s authorized world does not hold is cleared', () => {
    const w = authorizedWorld(V2, 'owner');
    const trimmed = { ...w, nodes: w.nodes.filter((n) => n.id !== 'inventory') };
    expect(permittedNode(w, 'inventory')).toBe('inventory');
    expect(permittedNode(trimmed, 'inventory')).toBeNull();
    expect(toMapContextIn(view('owner', 'en', '#/project/RT/inventory'), trimmed).node).toBeNull();
    expect(toMapContextIn(view('owner', 'en', '#/project/RT/inventory'), w).node).toBe('inventory');
    expect(toMapContextIn(view('owner', 'en', '#/project/RT/pos'), trimmed).node).toBe('pos');
  });

  it('a persona switch keeps the same route and re-derives the context from it', () => {
    const seq = ['owner', 'technical', 'owner', 'nontechnical', 'technical'] as const;
    for (const p of seq) {
      const ctx = toMapContext(view(p, 'en', '#/project/RT/inventory'));
      expect(ctx).toMatchObject({ persona: p, scope: 'retail-tower', node: 'inventory' });
      expect(restricted(JSON.stringify(ctx)), p).toBe(false);
    }
  });
});

describe('no restricted record can reach the context', () => {
  const routes = ['#/', '#/project/RT', '#/project/RT/inventory', '#/project/RT/stock-sync', '#/project/RT/pos', '#/evidence/E-5', '#/evidence/E-5?from=INV-DEMO-7',
    '#/project/RT/E-5', '#/project/E-5', '#/investigation/O-5'];

  it('contains no restricted record id for any persona, language or route, including routes that name one', () => {
    for (const p of PERSONAS) for (const l of LANGS) for (const h of routes) {
      const json = JSON.stringify(toMapContext(view(p, l, h)));
      expect(restricted(json), `${p}/${l} ${h}`).toBe(false);
    }
  });

  it('the world a selection is checked against holds no restricted record for a lay persona, and the technical one does', () => {
    for (const p of LAY) expect(restricted(JSON.stringify(authorizedWorld(V2, p))), p).toBe(false);
    expect(restricted(JSON.stringify(authorizedWorld(V2, 'technical')))).toBe(true);
  });
});

describe('a map selection becomes a host route, reversibly', () => {
  const routeEq = (a: Route | null, b: Route) => expect(a).toEqual(b);

  it('round-trips every shared component through the map context for every persona and language', () => {
    for (const p of PERSONAS) for (const l of LANGS) for (const c of DOMAIN.components.map((x) => x.id)) {
      const route: Route = { name: 'project', projectId: 'RT', componentId: c };
      const ctx = toMapContext({ persona: p, lang: l, route });
      expect(ctx.node, `${p}/${l}/${c}`).toBe(c);
      routeEq(toHostRoute({ scope: ctx.scope, node: ctx.node }, p), route);
    }
  });

  it('round-trips the verified product and the verified scope', () => {
    routeEq(toHostRoute({ scope: 'retail-tower', node: 'retail-tower' }, 'owner'), { name: 'project', projectId: 'RT' });
    routeEq(toHostRoute({ scope: 'retail-tower', node: null }, 'owner'), { name: 'project', projectId: 'RT' });
  });

  it('the produced route survives the host href and parser unchanged', () => {
    for (const c of ['pos', 'stock-sync', 'inventory']) {
      const r = toHostRoute({ scope: 'retail-tower', node: c }, 'nontechnical')!;
      expect(parseHash(hrefFor(r))).toEqual(r);
    }
  });

  it('has no route for services, unverified products, unmapped scopes or foreign ids', () => {
    for (const node of ['github', 'jira', 'sentry', 'port', 'khepri', 'seshat-bi', 'E-5', 'constructor', 'payments']) {
      expect(toHostRoute({ scope: 'retail-tower', node }, 'technical'), node).toBeNull();
    }
    for (const scope of ['all', 'khepri', 'seshat-bi', 'nope']) expect(toHostRoute({ scope, node: null }, 'owner'), scope).toBeNull();
  });

  it('has no route for a node the persona\'s authorized world does not hold', () => {
    const w = authorizedWorld(V2, 'owner');
    const trimmed = { ...w, nodes: w.nodes.filter((n) => n.id !== 'stock-sync') };
    expect(toHostRouteIn({ scope: 'retail-tower', node: 'stock-sync' }, trimmed)).toBeNull();
    expect(toHostRouteIn({ scope: 'retail-tower', node: 'pos' }, trimmed)).not.toBeNull();
  });
});

describe('the context holds no state: Back and Forward re-derive it from the route', () => {
  it('replays a history list and returns to identical contexts, in both directions', () => {
    const history = ['#/project/RT/stock-sync', '#/project/RT/inventory', '#/portfolio', '#/project/RT', '#/project/KH'];
    const at = (i: number) => toMapContext(view('owner', 'ar', history[i]!));
    const forward = history.map((_, i) => at(i));
    for (let i = history.length - 1; i >= 0; i -= 1) expect(at(i), `back to ${history[i]}`).toEqual(forward[i]);
    for (let i = 0; i < history.length; i += 1) expect(at(i), `forward to ${history[i]}`).toEqual(forward[i]);
    expect(forward.map((c) => c.node)).toEqual(['stock-sync', 'inventory', null, null, null]);
  });

  it('is a pure function of its input: the same view gives an equal context, and the input is not changed', () => {
    const v = view('nontechnical', 'ar', '#/project/RT/pos');
    const copy = JSON.stringify(v);
    expect(toMapContext(v)).toEqual(toMapContext(v));
    expect(JSON.stringify(v)).toBe(copy);
  });
});

describe('the bridge adds no second authority', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);

  it('has source files to check', () => {
    expect(sources.map(([f]) => f).sort()).toEqual(['identity.ts', 'mapContext.ts']);
  });

  it('imports no React, no V2 provider or context, and holds no module state', () => {
    for (const [f, src] of sources) {
      expect(src, f).not.toMatch(/from 'react'|from "react"/);
      expect(src, f).not.toMatch(/design-lab\/v2\/(context|navigation|main|App)/);
      expect(src, f).not.toMatch(/\b(useState|useReducer|useContext|createContext|V2Provider|useV2|localStorage|sessionStorage)\b/);
      expect(src, f).not.toMatch(/^\s*(let|var)\s/m);
    }
  });
});

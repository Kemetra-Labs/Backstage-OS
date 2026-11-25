// BACK-84: scopeFixture is the runtime authority for the INV-DEMO-7 overlap in both consumers. Persona is a display switch on
// synthetic data, not authorization: no server-side enforcement is claimed.
// Three kinds of test: the runtime adapter's verdicts; the authority proofs (change or disable scopeFixture and both consumers move,
// while records the canonical fixture does not own stay under each consumer's own rule); and the worlds the screens receive.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD } from '../fixture/world';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { authorizedInvestigation, authorizedWorld } from '../view/authorize';
import { DOMAIN } from './fixture';
import { canonicalComponent, canonicalFor, dependencyVerdict, evidenceVerdict } from './runtime';
import { scopeFixture } from './scope';
import { componentFacts } from './project';
import { graphEdgeFacts, graphNodeFacts } from './project';

const LAY: readonly Persona[] = ['owner', 'nontechnical'];
const ALL: readonly Persona[] = ['owner', 'technical', 'nontechnical'];
const SRC = fileURLToPath(new URL('..', import.meta.url));

describe('runtime verdicts come from scopeFixture', () => {
  it.each(LAY)('%s: E-5 is withheld, E-1 is visible, a record the canonical fixture does not own is foreign', (p) => {
    expect(evidenceVerdict(p, 'E-5')).toBe('withheld');
    expect(evidenceVerdict(p, 'E-1')).toBe('visible');
    expect(evidenceVerdict(p, 'E-12')).toBe('foreign');
    expect(evidenceVerdict(p, 'constructor')).toBe('foreign');
  });

  it('technical sees every canonical record, and gets the canonical fixture itself', () => {
    for (const id of Object.keys(DOMAIN.evidence)) expect(evidenceVerdict('technical', id)).toBe('visible');
    expect(canonicalFor('technical')).toBe(DOMAIN);
  });

  it.each(LAY)('%s: the canonical fixture is scoped once and the same object is returned each time', (p) => {
    expect(canonicalFor(p)).toBe(scopeFixture(DOMAIN, p));
    expect(canonicalFor(p)).toBe(canonicalFor(p));
  });

  it.each(LAY)('%s: inventory is scoped to an unknown claim with no evidence; a component it does not own is undefined', (p) => {
    const inv = canonicalComponent(p, 'inventory')!;
    expect(inv.health).toBe('unknown');
    expect(inv.basis).toEqual([]);
    expect(inv.evidence).toEqual([]);
    expect(canonicalComponent(p, 'payments')).toBeUndefined();
  });

  it('a dependency the canonical fixture owns is visible, one it does not own is foreign', () => {
    for (const p of ALL) {
      expect(dependencyVerdict(p, 'pos', 'stock-sync').kind).toBe('visible');
      expect(dependencyVerdict(p, 'stock-sync', 'github').kind).toBe('foreign');
    }
  });
});

describe('the worlds the screens receive carry the scoped canonical facts', () => {
  it.each(LAY)('%s: host RT overlap components and the investigation nodes equal the scoped projection', (p) => {
    const scoped = canonicalFor(p);
    const rt = authorizedWorld(WORLD, p).projects.find((x) => x.id === 'RT')!;
    const inv = authorizedInvestigation(INV_DEMO_7, p);
    for (const c of DOMAIN.components) {
      expect(rt.components.find((x) => x.id === c.id)!.state, `host world ${c.id}`).toEqual(componentFacts(scoped, c.id).state);
      expect(inv.nodes.find((x) => x.id === c.id)!.state, `host investigation ${c.id}`).toEqual(componentFacts(scoped, c.id).state);
    }
  });

  it.each(LAY)('%s: lens overlap nodes and dependencies equal the scoped projection', (p) => {
    const scoped = canonicalFor(p);
    const w = authorizedWorld(WORLD, p);
    for (const c of DOMAIN.components) {
      const n = w.graph.nodes.find((x) => x.id === c.id)!;
      const f = graphNodeFacts(scoped, c.id);
      expect({ state: n.state, evidence: n.evidence, check: n.check }, `lens node ${c.id}`).toEqual({ state: f.state, evidence: f.evidence, check: f.check });
    }
    for (const d of DOMAIN.dependencies) {
      const e = w.graph.edges.find((x) => x.cls === 'dep' && x.a === d.from && x.b === d.to)!;
      expect({ truth: e.truth, evidence: e.evidence }, `lens edge ${d.from}-${d.to}`).toEqual(graphEdgeFacts(scoped, d.from, d.to));
    }
  });

  it('technical receives the unscoped worlds, and an owner to technical to owner switch leaves no E-5 behind', () => {
    expect(authorizedWorld(WORLD, 'technical')).toBe(WORLD);
    expect(authorizedWorld(WORLD, 'technical')).toBe(WORLD);
    for (const p of ['owner', 'technical', 'owner', 'nontechnical', 'technical', 'nontechnical'] as const) {
      const has = (json: string) => /"E-5"|"O-5"/.test(json);
      const lay = p !== 'technical';
      expect(has(JSON.stringify(authorizedWorld(WORLD, p))), `host ${p}`).toBe(!lay);
      expect(has(JSON.stringify(authorizedInvestigation(INV_DEMO_7, p))), `host investigation ${p}`).toBe(!lay);
      expect(has(JSON.stringify(authorizedWorld(WORLD, p))), `lens ${p}`).toBe(!lay);
    }
  });
});

describe('scopeFixture is the only authority for overlap records (mutation proofs)', () => {
  afterEach(() => { vi.doUnmock('./scope'); vi.doUnmock('./fixture'); vi.resetModules(); });

  const consumers = async () => ({
    host: await import('../view/authorize'), world: await import('../fixture/world'), investigation: await import('../fixture/inv-demo-7'),
    lens: await import('../view/authorize'), lensWorld: await import('../fixture/world'),
  });

  // `withhold(id)`: mark one canonical record Technical-only in the canonical fixture only. The host and lens objects for it still say
  // visible to everyone, so only the canonical decision can remove it.
  const withhold = (id: string) => {
    vi.doMock('./fixture', async (orig) => {
      const m = await orig<typeof import('./fixture')>();
      const rec = { ...m.DOMAIN.evidence[id]!, visibility: 'technical' as const };
      return { ...m, DOMAIN: { ...m.DOMAIN, evidence: { ...m.DOMAIN.evidence, [id]: rec } } };
    });
  };

  it('a record the canonical fixture withholds disappears from both consumers, though their own rule would keep it', async () => {
    vi.resetModules();
    withhold('E-3');
    const c = await consumers();
    for (const p of LAY) {
      expect(c.world.WORLD.evidence['E-3']!.visibility, 'the consumer record itself is not Technical-only').not.toBe('technical');
      const host = JSON.stringify(c.host.authorizedWorld(c.world.WORLD, p));
      const investigation = JSON.stringify(c.host.authorizedInvestigation(c.investigation.INV_DEMO_7, p));
      const lens = JSON.stringify(c.lens.authorizedWorld(c.lensWorld.WORLD, p));
      expect(host, `host ${p}`).not.toContain('"E-3"');
      expect(investigation, `host investigation ${p}`).not.toContain('"E-3"');
      expect(lens, `lens ${p}`).not.toContain('"E-3"');
    }
    expect(JSON.stringify(c.host.authorizedWorld(c.world.WORLD, 'technical'))).toContain('"E-3"');
    expect(JSON.stringify(c.lens.authorizedWorld(c.lensWorld.WORLD, 'technical'))).toContain('"E-3"');
  });

  it('host fails closed when the canonical fixture withholds the record the investigation raw output cites', async () => {
    vi.resetModules();
    withhold('E-1');
    const c = await consumers();
    for (const p of LAY) expect(() => c.host.authorizedInvestigation(c.investigation.INV_DEMO_7, p), p).toThrow(/rawOutput/);
    expect(() => c.host.authorizedInvestigation(c.investigation.INV_DEMO_7, 'technical')).not.toThrow();
  });

  it('with scopeFixture disabled the overlap is no longer withheld, while records outside it still are (no second filter on the overlap)', async () => {
    vi.resetModules();
    vi.doMock('./scope', () => ({ scopeFixture: (f: unknown) => f }));
    const c = await consumers();
    for (const p of LAY) {
      const w1 = c.host.authorizedWorld(c.world.WORLD, p);
      const w2 = c.lens.authorizedWorld(c.lensWorld.WORLD, p);
      // The canary: E-5 is an overlap record, so only scopeFixture keeps it from lay personas.
      expect(w1.evidence['E-5'], `host ${p}`).toBeDefined();
      expect(w2.evidence['E-5'], `lens ${p}`).toBeDefined();
      // E-12 is not an overlap record: each consumer's own rule still withholds it.
      expect(w1.evidence['E-12'], `host ${p} E-12`).toBeUndefined();
      expect(w2.evidence['E-23'], `lens ${p} E-23`).toBeUndefined();
    }
  });
});

describe('no module outside src/domain scopes the canonical fixture on its own', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('__') ? [p] : [];
  });
  const rel = (p: string): string => p.slice(SRC.length).replace(/\\/g, '/');

  it('only domain/runtime.ts calls scopeFixture; both authorize modules ask domain/runtime', () => {
    const files = walk(SRC);
    const users = files.filter((f) => /scopeFixture\s*\(|import[^;]*scopeFixture/.test(readFileSync(f, 'utf8'))).map(rel).filter((f) => !f.startsWith('domain/')).sort();
    expect(users).toEqual([]);
    for (const f of ['view/authorize.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).toMatch(/domain\/runtime'/);
    }
  });
});

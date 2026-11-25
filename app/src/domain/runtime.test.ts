// BACK-84: scopeFixture is the runtime authority for the INV-DEMO-7 overlap in both consumers. Persona is a display switch on
// synthetic data, not authorization: no server-side enforcement is claimed.
// Three kinds of test: the runtime adapter's verdicts; the authority proofs (change or disable scopeFixture and both consumers move,
// while records the canonical fixture does not own stay under each consumer's own rule); and the worlds the screens receive.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Persona } from '../contract/types';
import { WORLD as V1_WORLD } from '../fixture/world';
import { INV_DEMO_7 } from '../fixture/inv-demo-7';
import { authorizedInvestigation, authorizedWorld as v1Authorized } from '../view/authorize';
import { WORLD as V2_WORLD } from '../fixture/world';
import { authorizedWorld as v2Authorized } from '../view/authorize';
import { DOMAIN } from './fixture';
import { canonicalComponent, canonicalFor, dependencyVerdict, evidenceVerdict } from './runtime';
import { scopeFixture } from './scope';
import { toV1ComponentFacts } from './toV1';
import { toV2EdgeFacts, toV2NodeFacts } from './toV2';

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
  it.each(LAY)('%s: V1 RT overlap components and the investigation nodes equal the scoped projection', (p) => {
    const scoped = canonicalFor(p);
    const rt = v1Authorized(V1_WORLD, p).projects.find((x) => x.id === 'RT')!;
    const inv = authorizedInvestigation(INV_DEMO_7, p);
    for (const c of DOMAIN.components) {
      expect(rt.components.find((x) => x.id === c.id)!.state, `V1 world ${c.id}`).toEqual(toV1ComponentFacts(scoped, c.id).state);
      expect(inv.nodes.find((x) => x.id === c.id)!.state, `V1 investigation ${c.id}`).toEqual(toV1ComponentFacts(scoped, c.id).state);
    }
  });

  it.each(LAY)('%s: V2 overlap nodes and dependencies equal the scoped projection', (p) => {
    const scoped = canonicalFor(p);
    const w = v2Authorized(V2_WORLD, p);
    for (const c of DOMAIN.components) {
      const n = w.graph.nodes.find((x) => x.id === c.id)!;
      const f = toV2NodeFacts(scoped, c.id);
      expect({ state: n.state, evidence: n.evidence, check: n.check }, `V2 node ${c.id}`).toEqual({ state: f.state, evidence: f.evidence, check: f.check });
    }
    for (const d of DOMAIN.dependencies) {
      const e = w.graph.edges.find((x) => x.cls === 'dep' && x.a === d.from && x.b === d.to)!;
      expect({ truth: e.truth, evidence: e.evidence }, `V2 edge ${d.from}-${d.to}`).toEqual(toV2EdgeFacts(scoped, d.from, d.to));
    }
  });

  it('technical receives the unscoped worlds, and an owner to technical to owner switch leaves no E-5 behind', () => {
    expect(v1Authorized(V1_WORLD, 'technical')).toBe(V1_WORLD);
    expect(v2Authorized(V2_WORLD, 'technical')).toBe(V2_WORLD);
    for (const p of ['owner', 'technical', 'owner', 'nontechnical', 'technical', 'nontechnical'] as const) {
      const has = (json: string) => /"E-5"|"O-5"/.test(json);
      const lay = p !== 'technical';
      expect(has(JSON.stringify(v1Authorized(V1_WORLD, p))), `V1 ${p}`).toBe(!lay);
      expect(has(JSON.stringify(authorizedInvestigation(INV_DEMO_7, p))), `V1 investigation ${p}`).toBe(!lay);
      expect(has(JSON.stringify(v2Authorized(V2_WORLD, p))), `V2 ${p}`).toBe(!lay);
    }
  });
});

describe('scopeFixture is the only authority for overlap records (mutation proofs)', () => {
  afterEach(() => { vi.doUnmock('./scope'); vi.doUnmock('./fixture'); vi.resetModules(); });

  const consumers = async () => ({
    v1: await import('../view/authorize'), v1w: await import('../fixture/world'), v1i: await import('../fixture/inv-demo-7'),
    v2: await import('../view/authorize'), v2w: await import('../fixture/world'),
  });

  // `withhold(id)`: mark one canonical record Technical-only in the canonical fixture only. The V1 and V2 objects for it still say
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
      expect(c.v1w.WORLD.evidence['E-3']!.visibility, 'the consumer record itself is not Technical-only').not.toBe('technical');
      const v1 = JSON.stringify(c.v1.authorizedWorld(c.v1w.WORLD, p));
      const v1i = JSON.stringify(c.v1.authorizedInvestigation(c.v1i.INV_DEMO_7, p));
      const v2 = JSON.stringify(c.v2.authorizedWorld(c.v2w.WORLD, p));
      expect(v1, `V1 ${p}`).not.toContain('"E-3"');
      expect(v1i, `V1 investigation ${p}`).not.toContain('"E-3"');
      expect(v2, `V2 ${p}`).not.toContain('"E-3"');
    }
    expect(JSON.stringify(c.v1.authorizedWorld(c.v1w.WORLD, 'technical'))).toContain('"E-3"');
    expect(JSON.stringify(c.v2.authorizedWorld(c.v2w.WORLD, 'technical'))).toContain('"E-3"');
  });

  it('V1 fails closed when the canonical fixture withholds the record the investigation raw output cites', async () => {
    vi.resetModules();
    withhold('E-1');
    const c = await consumers();
    for (const p of LAY) expect(() => c.v1.authorizedInvestigation(c.v1i.INV_DEMO_7, p), p).toThrow(/rawOutput/);
    expect(() => c.v1.authorizedInvestigation(c.v1i.INV_DEMO_7, 'technical')).not.toThrow();
  });

  it('with scopeFixture disabled the overlap is no longer withheld, while records outside it still are (no second filter on the overlap)', async () => {
    vi.resetModules();
    vi.doMock('./scope', () => ({ scopeFixture: (f: unknown) => f }));
    const c = await consumers();
    for (const p of LAY) {
      const w1 = c.v1.authorizedWorld(c.v1w.WORLD, p);
      const w2 = c.v2.authorizedWorld(c.v2w.WORLD, p);
      // The canary: E-5 is an overlap record, so only scopeFixture keeps it from lay personas.
      expect(w1.evidence['E-5'], `V1 ${p}`).toBeDefined();
      expect(w2.evidence['E-5'], `V2 ${p}`).toBeDefined();
      // E-12 is not an overlap record: each consumer's own rule still withholds it.
      expect(w1.evidence['E-12'], `V1 ${p} E-12`).toBeUndefined();
      expect(w2.evidence['E-23'], `V2 ${p} E-23`).toBeUndefined();
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

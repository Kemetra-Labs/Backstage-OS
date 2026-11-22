// BACK-83: the overlap facts live once, in src/domain, and both consumers read them through the typed projections.
// Three guards: the import direction (domain depends on nobody), no second copy of the overlap literals, and a mutation test
// (change the canonical record, both consumers move with it).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainFixture } from './types';

// Resolved from this file, not the working directory, so the guards hold wherever vitest is started.
const SRC = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');
const nonTest = (dir: string): string[] =>
  readdirSync(join(SRC, dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => `${dir}/${f}`);

describe('domain is the one source for the INV-DEMO-7 overlap', () => {
  // The only consumer module the projections may name is V2's type file, as a type-only import: it supplies the target shapes.
  it('src/domain imports only from contract and type shapes (it depends on no consumer value)', () => {
    for (const f of nonTest('domain')) {
      const imports = [...read(f).matchAll(/import (type )?[^;]*? from '([^']+)'/g)].filter((m) => m[2]!.startsWith('.'));
      for (const [, isType, p] of imports) {
        const ok = p === '../contract/types' || p === '../contract/world' || p!.startsWith('./')
          || (p === '../design-lab/v2/types' && isType === 'type ');
        expect(ok, `${f} imports ${p}`).toBe(true);
      }
    }
  });

  it('no consumer fixture holds a second copy of E-1..E-9', () => {
    const consumers = [...nonTest('fixture'), 'design-lab/v2/fixtures/world.ts'];
    for (const f of consumers) expect(read(f), f).not.toMatch(/id:\s*'E-[1-9]'/);
  });

  // V1 world.ts (Khepri and Seshat-BI sources) and V2 world.ts (Confluence) define sources outside the overlap, so only
  // inv-demo-7.ts is checked: it used to define the five overlap sources.
  it('inv-demo-7 no longer defines the five synthetic sources', () => {
    expect(read('fixture/inv-demo-7.ts')).not.toMatch(/ttlSeconds/);
  });
});

describe('changing the canonical record changes both consumers', () => {
  afterEach(() => { vi.doUnmock('./fixture'); vi.resetModules(); });

  it('inventory facts and the stock-sync to inventory truth follow DOMAIN into V1 and V2', async () => {
    vi.resetModules();
    vi.doMock('./fixture', async (orig) => {
      const m = await orig<typeof import('./fixture')>();
      const changed: DomainFixture = {
        ...m.DOMAIN,
        components: m.DOMAIN.components.map((c) => (c.id === 'inventory'
          ? { ...c, health: 'degraded' as const, connectivity: 'reachable' as const, freshness: 'current' as const, basis: ['E-1'], evidence: ['E-1'] }
          : c)),
        dependencies: m.DOMAIN.dependencies.map((d) => (d.to === 'inventory'
          ? { ...d, truth: 'observed' as const, evidence: ['E-1'] }
          : d)),
      };
      return { ...m, DOMAIN: changed };
    });
    const v1 = await import('../fixture/world');
    const v1Nodes = await import('../fixture/inv-demo-7');
    const v2 = await import('../design-lab/v2/fixtures/world');

    const inv1 = v1.WORLD.projects.find((p) => p.id === 'RT')!.components.find((c) => c.id === 'inventory')!;
    expect(inv1.state.health).toBe('degraded');
    expect(inv1.state.basis.map((b) => b.id)).toEqual(['E-1']);
    expect(v1Nodes.NODES.find((n) => n.id === 'inventory')!.state.health).toBe('degraded');

    const inv2 = v2.WORLD.nodes.find((n) => n.id === 'inventory')!;
    expect(inv2.state.health).toBe('degraded');
    expect(inv2.state.basis.map((b) => b.id)).toEqual(['E-1']);
    expect(inv2.evidence).toEqual(['E-1']);
    const d3 = v2.WORLD.edges.find((e) => e.id === 'd3')!;
    expect(d3.truth).toBe('observed');
    expect(d3.evidence).toEqual(['E-1']);
  });
});

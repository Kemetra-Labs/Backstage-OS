import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { explorerFor, resolveInvestigation } from './explorerView';

describe('resolveInvestigation', () => {
  it('uses a valid from, falls back to the citing case, and ignores a from that does not cite the item', () => {
    expect(resolveInvestigation(WORLD, 'E-1', 'INV-DEMO-7')?.id).toBe('INV-DEMO-7');
    expect(resolveInvestigation(WORLD, 'E-1')?.id).toBe('INV-DEMO-7');
    expect(resolveInvestigation(WORLD, 'E-1', 'INV-DEMO-9')?.id).toBe('INV-DEMO-7');
    expect(resolveInvestigation(WORLD, 'E-1', 'INV-NOPE')?.id).toBe('INV-DEMO-7');
    expect(resolveInvestigation(WORLD, 'E-11', 'INV-DEMO-7')).toBeUndefined();
  });
});

describe('explorerFor', () => {
  it('is undefined for an unknown id', () => {
    expect(explorerFor(WORLD, 'E-999', 'owner')).toBeUndefined();
  });

  it('E-1: context, siblings, supporting entities and raw output for Technical only', () => {
    const t = explorerFor(WORLD, 'E-1', 'technical', 'INV-DEMO-7');
    expect(t?.investigation?.id).toBe('INV-DEMO-7');
    expect(t?.project?.id).toBe('RT');
    expect(t?.component?.id).toBe('stock-sync');
    expect(t?.siblings.map((s) => s.id)).toEqual(['E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7']);
    expect(t?.decisions.map((d) => d.id)).toContain('DEC-DEMO-3');
    expect(t?.view.rawOutput).toContain('AssertionError');
    for (const p of ['owner', 'nontechnical'] as const) {
      const v = explorerFor(WORLD, 'E-1', p, 'INV-DEMO-7');
      expect(v?.view.rawOutput).toBeUndefined();
      expect(v?.view.url).toBeUndefined();
    }
  });

  it('only E-1 carries raw output', () => {
    expect(explorerFor(WORLD, 'E-2', 'technical')?.view.rawOutput).toBeUndefined();
  });

  it('E-12 is restricted for Owner and Nontechnical and readable for Technical', () => {
    expect(explorerFor(WORLD, 'E-12', 'owner')?.view.restricted).toBe(true);
    expect(explorerFor(WORLD, 'E-12', 'nontechnical')?.view.restricted).toBe(true);
    const t = explorerFor(WORLD, 'E-12', 'technical');
    expect(t?.view.restricted).toBeUndefined();
    expect(t?.view.provider).toBe('sentry');
    // Not cited by any case: context comes from the component that reads it.
    expect(t?.investigation).toBeUndefined();
    expect(t?.project?.id).toBe('RT');
    expect(t?.component?.id).toBe('payments');
    expect(t?.siblings).toEqual([]);
  });

  it('unread evidence keeps its reason and has no observed fields', () => {
    const e24 = explorerFor(WORLD, 'E-24', 'owner');
    expect(e24?.view.notReadReason).toBe('unavailable');
    expect(e24?.view.observedAt).toBeUndefined();
    expect(e24?.view.label).toBe('unknown');
    expect(explorerFor(WORLD, 'E-31', 'owner')?.view.notReadReason).toBe('not_configured');
    expect(explorerFor(WORLD, 'E-31', 'owner')?.project?.id).toBe('SB');
  });

  it('E-23 is correlated with its rule for Technical, restricted for the others', () => {
    const t = explorerFor(WORLD, 'E-23', 'technical');
    expect(t?.view.label).toBe('correlated');
    expect(t?.view.rule).toMatch(/Deploy time/);
    expect(explorerFor(WORLD, 'E-23', 'owner')?.view.rule).toBeUndefined();
  });

  it('finds the proposal that cites an item', () => {
    const e41 = explorerFor(WORLD, 'E-41', 'owner');
    expect(e41?.decisions.map((d) => d.id)).toEqual(['DEC-DEMO-1']);
    expect(e41?.view.label).toBe('approved');
  });

  it('falls back to the proposal project when nothing else cites the item', () => {
    const world = {
      ...WORLD,
      projects: WORLD.projects.map((p) => ({ ...p, components: [], delivery: [], attention: [], health: { ...p.health, basis: [] } })),
    };
    expect(explorerFor(world, 'E-41', 'owner')?.project?.id).toBe('RT');
  });

  it('a from that points at another case does not leak into the crumbs', () => {
    expect(explorerFor(WORLD, 'E-22', 'owner', 'INV-DEMO-7')?.investigation?.id).toBe('INV-DEMO-9');
  });
});

import { describe, expect, it } from 'vitest';
import type { SourceAuthority } from '../contract/types';
import { WORLD } from '../fixture/world';
import { authorizedWorld } from './authorize';
import { isNotSetUp, portfolioView, sourceBuckets } from './portfolioView';

const src = (connectivity: SourceAuthority['connectivity'], ageMinutes: number | null, ttlSeconds = 600): SourceAuthority => ({
  provider: 'github', connectivity, ageMinutes, ttlSeconds, lastSuccessAt: ageMinutes === null ? null : '2026-11-16T14:03:00Z', synthetic: true,
});

// Owner and Nontechnical read the world App.tsx gives them: scoped by authorizedWorld (BACK-73).
const scoped = (p: 'owner' | 'nontechnical') => authorizedWorld(WORLD, p);

describe('sourceBuckets', () => {
  it('puts every source in exactly one bucket', () => {
    const list = [src('reachable', 1), src('reachable', 600), src('unavailable', 300), src('not_configured', null), src('reachable', null)];
    const b = sourceBuckets(list);
    expect(b).toEqual({ total: 5, current: 1, stale: 1, unavailable: 1, notConfigured: 1, unknown: 1 });
    expect(b.current + b.stale + b.unavailable + b.notConfigured + b.unknown).toBe(b.total);
  });

  it('never counts an unavailable or unconfigured source as current', () => {
    const b = sourceBuckets([src('unavailable', 1), src('not_configured', 1)]);
    expect(b.current).toBe(0);
  });
});

describe('portfolioView', () => {
  it('lists the three products in world order', () => {
    const v = portfolioView(scoped('owner'), 'owner', 'en');
    expect(v.products.map((p) => p.id)).toEqual(['RT', 'KH', 'SB']);
  });

  it('resolves health through the contract: RT unknown, KH degraded, SB unknown, none healthy', () => {
    const h = Object.fromEntries(portfolioView(scoped('owner'), 'owner', 'en').products.map((p) => [p.id, p.triad.health]));
    expect(h).toEqual({ RT: 'unknown', KH: 'degraded', SB: 'unknown' });
  });

  it('marks Seshat-BI not set up and reports its counts as not read, never 0', () => {
    const sb = portfolioView(scoped('owner'), 'owner', 'en').products.find((p) => p.id === 'SB');
    expect(sb?.status).toBe('notSetUp');
    expect(sb?.attentionCount).toBeNull();
    expect(sb?.openInvestigations).toBeNull();
    expect(sb?.proposals).toBeNull();
    expect(sb?.triad.connectivity).toBe('not_configured');
  });

  it('counts attention, open investigations and proposed decisions from the world', () => {
    const rt = portfolioView(WORLD, 'technical', 'en').products.find((p) => p.id === 'RT');
    expect(rt).toMatchObject({ status: 'attention', attentionCount: 2, openInvestigations: 1, proposals: 1 });
    // ATT-RT-2 rests only on Technical-only E-12, so Owner's scoped world counts one (see nondisclosure.test.ts).
    expect(portfolioView(scoped('owner'), 'owner', 'en').products.find((p) => p.id === 'RT')?.attentionCount).toBe(1);
  });

  it('sorts attention by severity and carries one evidence row per item', () => {
    const v = portfolioView(WORLD, 'technical', 'en');
    expect(v.attention.map((a) => a.severity)).toEqual(['high', 'medium', 'medium']);
    expect(v.attention[0]?.evidence).toHaveLength(2);
    expect(v.attentionEmpty).toBeNull();
  });

  it('gives owner and nontechnical no row for technical-only evidence, and refuses unscoped input (BACK-92 R7, defence in depth)', () => {
    for (const persona of ['owner', 'nontechnical'] as const) {
      const rows = portfolioView(scoped(persona), persona, 'en').attention.flatMap((a) => a.evidence);
      expect(rows.map((r) => r.view.id)).not.toContain('E-12');
      expect(rows.some((r) => r.title === 'Restricted to Technical')).toBe(false);
      expect(() => portfolioView(WORLD, persona, 'en')).toThrow(/unscoped evidence/);
    }
    const tech = portfolioView(WORLD, 'technical', 'en').attention.flatMap((a) => a.evidence);
    expect(tech.map((r) => r.view.id)).toContain('E-12');
  });

  it('gives only Technical component and environment detail', () => {
    expect(portfolioView(WORLD, 'technical', 'en').products[0]?.detail).toEqual({
      componentCount: 6, environments: ['ci', 'staging', 'production'],
    });
    expect(portfolioView(scoped('owner'), 'owner', 'en').products[0]?.detail).toBeUndefined();
    expect(portfolioView(scoped('nontechnical'), 'nontechnical', 'en').products[0]?.detail).toBeUndefined();
  });

  it('filters to one product and explains an empty list for an unconfigured one', () => {
    const rt = portfolioView(scoped('owner'), 'owner', 'en', 'RT');
    expect(rt.products.map((p) => p.id)).toEqual(['RT']);
    expect(rt.attention.every((a) => a.projectId === 'RT')).toBe(true);
    const sb = portfolioView(scoped('owner'), 'owner', 'en', 'SB');
    expect(sb.attention).toEqual([]);
    expect(sb.attentionEmpty).toBe('notSetUp');
  });

  it('reports a plain empty state for a configured product without attention', () => {
    const quiet = { ...WORLD, projects: WORLD.projects.map((p) => (p.id === 'KH' ? { ...p, attention: [] } : p)) };
    const v = portfolioView(quiet, 'owner', 'en', 'KH');
    expect(v.attentionEmpty).toBe('none');
    expect(v.products[0]?.status).toBe('noneFlagged');
  });

  it('offers an All option plus one per product', () => {
    const o = portfolioView(scoped('owner'), 'owner', 'en').options;
    expect(o.map((x) => x.value)).toEqual(['all', 'RT', 'KH', 'SB']);
    expect(isNotSetUp(WORLD.projects[2]!)).toBe(true);
    expect(isNotSetUp(WORLD.projects[0]!)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { SourceAuthority } from '../contract/types';
import { WORLD } from '../fixture/world';
import { isNotSetUp, portfolioView, sourceBuckets } from './portfolioView';

const src = (connectivity: SourceAuthority['connectivity'], ageMinutes: number | null, ttlSeconds = 600): SourceAuthority => ({
  provider: 'github', connectivity, ageMinutes, ttlSeconds, lastSuccessAt: ageMinutes === null ? null : '2026-11-16T14:03:00Z', synthetic: true,
});

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
    const v = portfolioView(WORLD, 'owner', 'en');
    expect(v.products.map((p) => p.id)).toEqual(['RT', 'KH', 'SB']);
  });

  it('resolves health through the contract: RT unknown, KH degraded, SB unknown, none healthy', () => {
    const h = Object.fromEntries(portfolioView(WORLD, 'owner', 'en').products.map((p) => [p.id, p.triad.health]));
    expect(h).toEqual({ RT: 'unknown', KH: 'degraded', SB: 'unknown' });
  });

  it('marks Seshat-BI not set up and reports its counts as not read, never 0', () => {
    const sb = portfolioView(WORLD, 'owner', 'en').products.find((p) => p.id === 'SB');
    expect(sb?.status).toBe('notSetUp');
    expect(sb?.attentionCount).toBeNull();
    expect(sb?.openInvestigations).toBeNull();
    expect(sb?.proposals).toBeNull();
    expect(sb?.triad.connectivity).toBe('not_configured');
  });

  it('counts attention, open investigations and proposed decisions from the world', () => {
    const rt = portfolioView(WORLD, 'owner', 'en').products.find((p) => p.id === 'RT');
    expect(rt).toMatchObject({ status: 'attention', attentionCount: 2, openInvestigations: 1, proposals: 1 });
  });

  it('sorts attention by severity and carries one evidence row per item', () => {
    const v = portfolioView(WORLD, 'technical', 'en');
    expect(v.attention.map((a) => a.severity)).toEqual(['high', 'medium', 'medium']);
    expect(v.attention[0]?.evidence).toHaveLength(2);
    expect(v.attentionEmpty).toBeNull();
  });

  it('restricts technical-only evidence for owner and nontechnical, with no provider or age (raw, unprojected input: defence in depth)', () => {
    for (const persona of ['owner', 'nontechnical'] as const) {
      const rows = portfolioView(WORLD, persona, 'en').attention.flatMap((a) => a.evidence);
      const restricted = rows.filter((r) => r.view.restricted);
      expect(restricted.length).toBeGreaterThan(0);
      for (const r of restricted) {
        expect(r.view.provider).toBeUndefined();
        expect(r.view.ageMinutes).toBeNull();
        expect(r.title).toBe('Restricted to Technical');
      }
    }
    const tech = portfolioView(WORLD, 'technical', 'en').attention.flatMap((a) => a.evidence);
    expect(tech.some((r) => r.view.restricted)).toBe(false);
  });

  it('gives only Technical component and environment detail', () => {
    expect(portfolioView(WORLD, 'technical', 'en').products[0]?.detail).toEqual({
      componentCount: 6, environments: ['ci', 'staging', 'production'],
    });
    expect(portfolioView(WORLD, 'owner', 'en').products[0]?.detail).toBeUndefined();
    expect(portfolioView(WORLD, 'nontechnical', 'en').products[0]?.detail).toBeUndefined();
  });

  it('filters to one product and explains an empty list for an unconfigured one', () => {
    const rt = portfolioView(WORLD, 'owner', 'en', 'RT');
    expect(rt.products.map((p) => p.id)).toEqual(['RT']);
    expect(rt.attention.every((a) => a.projectId === 'RT')).toBe(true);
    const sb = portfolioView(WORLD, 'owner', 'en', 'SB');
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
    const o = portfolioView(WORLD, 'owner', 'en').options;
    expect(o.map((x) => x.value)).toEqual(['all', 'RT', 'KH', 'SB']);
    expect(isNotSetUp(WORLD.projects[2]!)).toBe(true);
    expect(isNotSetUp(WORLD.projects[0]!)).toBe(false);
  });
});

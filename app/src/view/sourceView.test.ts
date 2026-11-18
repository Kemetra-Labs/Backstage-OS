import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { affectedBy, productSources, providersInUse } from './sourceView';

const products = productSources(WORLD);
const row = (product: string, provider: string) => products.find((p) => p.id === product)?.rows.find((r) => r.provider === provider);

describe('productSources', () => {
  it('lists the three products with their sources', () => {
    expect(products.map((p) => p.name)).toEqual(['Retail Tower OS', 'Khepri', 'Seshat-BI']);
    expect(products.map((p) => p.rows.length)).toEqual([5, 4, 3]);
  });

  it('reads Seshat-BI GitHub as not set up, unknown and never read', () => {
    expect(row('SB', 'github')).toMatchObject({ connectivity: 'not_configured', freshness: 'unknown', ageMinutes: null });
  });

  it('reads Khepri Jira as unavailable and stale', () => {
    expect(row('KH', 'jira')).toMatchObject({ connectivity: 'unavailable', freshness: 'stale', ageMinutes: 300 });
  });

  it('converts TTL to minutes and keeps seconds', () => {
    expect(row('RT', 'github')).toMatchObject({ ttlMinutes: 30, ttlSeconds: 1800, synthetic: true });
  });

  it('never counts a not set up or unavailable source as current', () => {
    const kh = products.find((p) => p.id === 'KH');
    expect(kh?.summary).toMatchObject({ unavailable: 1, notConfigured: 1 });
    expect(kh?.notCurrent).toBe(2);
    expect(products.every((p) => p.notCurrent === p.summary.total - p.summary.current)).toBe(true);
  });

  it('puts each source in exactly one bucket, so the summary adds up to the total', () => {
    for (const p of products) {
      const s = p.summary;
      expect(s.current + s.stale + s.unavailable + s.notConfigured + s.unknown).toBe(s.total);
    }
    // Khepri Jira is unavailable: it counts as unavailable only, not also as stale.
    expect(products.find((p) => p.id === 'KH')?.summary).toMatchObject({ stale: 0, unavailable: 1 });
  });

  it('forces a null age for sources that are not set up', () => {
    const w = {
      ...WORLD,
      projects: [{ ...WORLD.projects[0]!, sources: [{ ...WORLD.projects[0]!.sources[0]!, connectivity: 'not_configured' as const, ageMinutes: 5, lastSuccessAt: null }] }],
    };
    expect(productSources(w)[0]?.rows[0]?.ageMinutes).toBeNull();
  });

  it('orders providers stably', () => {
    expect(products[0]?.rows.map((r) => r.provider)).toEqual(['github', 'jira', 'sentry', 'datadog', 'port']);
  });
});

describe('providersInUse and affectedBy', () => {
  it('lists every provider once, in a stable order', () => {
    expect(providersInUse(WORLD)).toEqual(['github', 'jira', 'confluence', 'sentry', 'datadog', 'port']);
  });

  it('names who is unavailable or not set up', () => {
    expect(affectedBy(products, 'unavailable')).toEqual([
      { product: 'Retail Tower OS', provider: 'port' },
      { product: 'Khepri', provider: 'jira' },
    ]);
    expect(affectedBy(products, 'not_configured')).toEqual([
      { product: 'Retail Tower OS', provider: 'datadog' },
      { product: 'Khepri', provider: 'datadog' },
      { product: 'Seshat-BI', provider: 'github' },
    ]);
  });
});

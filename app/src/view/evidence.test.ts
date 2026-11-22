import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import { deliveryLabelFor, evidenceTitleFor, evidenceViewFor } from './evidence';

const ev = (id: string) => {
  const e = WORLD.evidence[id];
  if (!e) throw new Error(id);
  return e;
};

describe('evidenceViewFor', () => {
  it('Technical gets ids, link, rule and raw output; others do not', () => {
    const t = evidenceViewFor('technical', ev('E-23'), 'raw');
    expect(t).toMatchObject({ rule: expect.any(String), url: expect.stringContaining('example.invalid'), rawOutput: 'raw', inert: true });
    for (const p of ['owner', 'nontechnical'] as const) {
      const v = evidenceViewFor(p, ev('E-1'), 'raw');
      expect(v.url).toBeUndefined();
      expect(v.rawOutput).toBeUndefined();
      expect(v.externalId).toBeUndefined();
    }
    expect(evidenceViewFor('owner', ev('E-1')).observedAt).toBeDefined();
    expect(evidenceViewFor('nontechnical', ev('E-1')).observedAt).toBeUndefined();
  });
  it('technical-only evidence is restricted for other personas (raw, unprojected input: defence in depth)', () => {
    expect(evidenceViewFor('owner', ev('E-12'))).toEqual({ id: 'E-12', label: 'unknown', freshness: 'unknown', ageMinutes: null, inert: true, restricted: true });
    expect(evidenceViewFor('technical', ev('E-12')).restricted).toBeUndefined();
  });
  it('unread evidence is unknown with its reason', () => {
    expect(evidenceViewFor('owner', ev('E-24'))).toMatchObject({ label: 'unknown', freshness: 'unknown', notReadReason: 'unavailable' });
  });
  it('approved needs its record link', () => {
    expect(evidenceViewFor('owner', ev('E-41')).label).toBe('approved');
  });
});

describe('evidenceTitleFor', () => {
  it('uses S1 copy for E-1..E-7 and world text for the rest', () => {
    expect(evidenceTitleFor(WORLD, 'E-1', 'technical', 'en')).toContain('integration-tests');
    expect(evidenceTitleFor(WORLD, 'E-1', 'owner', 'en')).not.toContain('integration-tests');
    expect(evidenceTitleFor(WORLD, 'E-22', 'owner', 'ar')).toMatch(/[\u0600-\u06FF]/);
    expect(evidenceTitleFor(WORLD, 'E-12', 'owner', 'en')).toBe('Restricted to Technical');
    expect(evidenceTitleFor(WORLD, 'E-12', 'technical', 'en')).toContain('payments');
    expect(evidenceTitleFor(WORLD, 'nope', 'owner', 'en')).toBe('{nope}');
  });
});

describe('deliveryLabelFor', () => {
  const rt = WORLD.projects.find((p) => p.id === 'RT');
  const item = (id: string) => {
    const d = rt?.delivery.find((x) => x.id === id);
    if (!d) throw new Error(id);
    return d;
  };
  it('redacts job names and run ids for Owner and Nontechnical', () => {
    expect(deliveryLabelFor(item('DLV-RT-1'), 'technical', 'en')).toBe('{ci / integration-tests (stock-sync)} · {#DEMO-4471}');
    expect(deliveryLabelFor(item('DLV-RT-1'), 'owner', 'en')).toBe('Automated check');
    expect(deliveryLabelFor(item('DLV-RT-2'), 'owner', 'ar')).toBe('تغيير في الكود');
    expect(deliveryLabelFor(item('DLV-RT-3'), 'owner', 'en')).toBe('Work item {RT-DEMO-112}');
    expect(deliveryLabelFor(item('DLV-RT-3'), 'nontechnical', 'en')).toBe('Work item');
    const noId = { ...item('DLV-RT-1'), ref: { kind: 'check' as const, id: 'x', label: 'job' } };
    expect(deliveryLabelFor(noId, 'technical', 'en')).toBe('{job}');
  });
});

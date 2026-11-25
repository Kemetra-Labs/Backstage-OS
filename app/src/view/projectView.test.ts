import { describe, expect, it } from 'vitest';
import { WORLD } from '../fixture/world';
import {
  DEFAULT_FILTERS, attentionFor, deliveryRows, filterComponents, layersOf, linkedEvidence, mapFor, risksFor, segLabel,
  sourceRows, unknownReason,
} from './projectView';
import { authorizedWorld } from './authorize';
import { componentById, projectById } from './world';

const RT = projectById(WORLD, 'RT')!;
const KH = projectById(WORLD, 'KH')!;
const SB = projectById(WORLD, 'SB')!;
const comp = (id: string) => componentById(RT, id)!;

describe('map model', () => {
  it('has all six RT components and every edge by default', () => {
    const m = mapFor(RT, DEFAULT_FILTERS);
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['api-gateway', 'inventory', 'payments', 'pos', 'reporting', 'stock-sync']);
    expect(m.edges).toHaveLength(RT.edges.length);
  });

  it('resolves health through the contract: only api-gateway is healthy, inventory is unknown', () => {
    const m = mapFor(RT, DEFAULT_FILTERS);
    expect(m.nodes.filter((n) => n.triad.health === 'healthy').map((n) => n.id)).toEqual(['api-gateway']);
    expect(m.nodes.find((n) => n.id === 'inventory')?.triad.health).toBe('unknown');
    expect(comp('inventory').state.health).toBe('healthy'); // the claim, not what is shown
  });

  it('filters by environment and drops edges whose end is hidden', () => {
    const m = mapFor(RT, { env: 'staging', layer: 'all' });
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['inventory', 'payments']);
    expect(m.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['payments>inventory']);
  });

  it('filters by layer and re-ranks columns and rows densely, keeping left-to-right order', () => {
    const m = mapFor(RT, { env: 'all', layer: 'service' });
    expect(m.nodes.map((n) => [n.id, n.col, n.row]).sort()).toEqual([['payments', 0, 1], ['stock-sync', 0, 0]]);
    const m2 = mapFor(RT, { env: 'all', layer: 'data' });
    expect(m2.nodes).toHaveLength(1);
    expect(m2.nodes[0]).toMatchObject({ col: 0, row: 0 });
  });

  it('can filter to nothing, which is not the same as an empty product', () => {
    expect(filterComponents(RT, { env: 'production', layer: 'data' })).toHaveLength(0);
    expect(RT.components.length).toBeGreaterThan(0);
  });

  it('is empty for Seshat-BI', () => {
    expect(mapFor(SB, DEFAULT_FILTERS)).toEqual({ nodes: [], edges: [] });
    expect(layersOf(SB)).toEqual([]);
  });

  it('lists layers in architecture order and carries investigation ids and failing checks', () => {
    expect(layersOf(RT)).toEqual(['client', 'edge', 'service', 'data', 'integration']);
    const m = mapFor(RT, DEFAULT_FILTERS);
    expect(m.nodes.find((n) => n.id === 'stock-sync')).toMatchObject({ investigationId: 'INV-DEMO-7', checkFailing: true });
    expect(m.nodes.find((n) => n.id === 'pos')?.investigationId).toBeUndefined();
  });

  it('shows the Khepri conflict: degraded api, green web, linked case', () => {
    const m = mapFor(KH, DEFAULT_FILTERS);
    expect(m.nodes.find((n) => n.id === 'khepri-api')).toMatchObject({ investigationId: 'INV-DEMO-9' });
    expect(m.nodes.find((n) => n.id === 'khepri-api')?.triad.health).toBe('degraded');
    expect(m.nodes.find((n) => n.id === 'khepri-web')?.triad.health).toBe('healthy');
  });
});

describe('segment labels', () => {
  it('strips braces and marks Latin text as English', () => {
    expect(segLabel('{CI (main)}')).toEqual({ label: 'CI (main)', lang: 'en' });
    expect(segLabel('الكل')).toEqual({ label: 'الكل' });
  });
});

describe('sources and risks', () => {
  it('reports sources in words: never-read and not set up have no age', () => {
    const rows = sourceRows(RT);
    expect(rows.find((r) => r.provider === 'datadog')).toMatchObject({ connectivity: 'not_configured', ageMinutes: null, current: false });
    expect(rows.find((r) => r.provider === 'port')).toMatchObject({ connectivity: 'unavailable', freshness: 'stale' });
    expect(rows.find((r) => r.provider === 'github')?.current).toBe(true);
  });

  it('explains why each component is unknown', () => {
    expect(unknownReason(comp('pos'))).toBe('not_set_up');
    expect(unknownReason(comp('inventory'))).toBe('stale');
    expect(unknownReason({ ...comp('api-gateway'), state: { ...comp('api-gateway').state, basis: [] } })).toBe('no_evidence');
  });

  it('lists unknown components, unconfirmed edges and sources not current for RT', () => {
    const r = risksFor(RT);
    expect(r.unknown.map((u) => u.id).sort()).toEqual(['inventory', 'pos', 'reporting', 'stock-sync']);
    expect(r.unknown.find((u) => u.id === 'inventory')?.reason).toBe('stale');
    // The four catalog-declared edges rest on E-7, which was never read (Port unavailable), so they count as provisional.
    expect(r.edges.map((e) => e.kind).sort()).toEqual(['hypothesis', 'provisional', 'provisional', 'provisional', 'provisional', 'provisional']);
    expect(r.edges.find((e) => e.kind === 'hypothesis')).toMatchObject({ fromName: 'payments', toName: 'inventory' });
    expect(r.sources.map((s) => s.provider).sort()).toEqual(['datadog', 'port', 'sentry']);
  });

  it('never lists payments (degraded with a read observation) or a healthy component as unknown', () => {
    const r = risksFor(RT);
    expect(r.unknown.some((u) => u.id === 'payments' || u.id === 'api-gateway')).toBe(false);
  });

  it('covers Seshat-BI: nothing mapped, GitHub not set up', () => {
    const r = risksFor(SB);
    expect(r.unknown).toEqual([]);
    expect(r.sources.map((s) => s.provider)).toEqual(['github']);
  });

  it('flags the unreadable Jira source and the unset Datadog for Khepri', () => {
    expect(risksFor(KH).sources.map((s) => s.provider).sort()).toEqual(['datadog', 'jira']);
    expect(risksFor(KH).unknown.map((u) => u.id)).toEqual(['khepri-worker']);
  });
});

describe('delivery rows and persona redaction', () => {
  const BANNED = ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'DEMO-4468', 'DEMO-5120', 'example.invalid'];

  it('shows job names and run ids to Technical only', () => {
    const tech = deliveryRows(RT, 'technical', 'en').map((r) => r.label).join(' ');
    expect(tech).toContain('integration-tests');
    expect(tech).toContain('#DEMO-4471');
    for (const persona of ['owner', 'nontechnical'] as const) {
      for (const lang of ['en', 'ar'] as const) {
        const text = deliveryRows(RT, persona, lang).map((r) => r.label).join(' ');
        for (const b of BANNED) expect(text, `${persona}/${lang}/${b}`).not.toContain(b);
      }
    }
  });

  it('keeps the claimed status when evidence was read, with the resolved label', () => {
    const rows = deliveryRows(RT, 'technical', 'en');
    expect(rows.find((x) => x.id === 'DLV-RT-1')).toMatchObject({ status: 'failing', truth: 'observed', freshness: 'current' });
    expect(rows.find((x) => x.id === 'DLV-RT-3')?.truth).toBe('correlated');
  });

  it('turns a not-read item into unknown status with its reason', () => {
    const r = deliveryRows(KH, 'owner', 'en').find((x) => x.id === 'DLV-KH-2')!;
    expect(r).toMatchObject({ status: 'unknown', truth: 'unknown', notReadReason: 'unavailable' });
  });

  it('is empty for Seshat-BI', () => {
    expect(deliveryRows(SB, 'owner', 'en')).toEqual([]);
  });
});

describe('selected component evidence', () => {
  it('links the basis and attention evidence once each, with persona titles', () => {
    const rows = linkedEvidence(WORLD, RT, comp('stock-sync'), 'technical', 'en');
    expect(rows.map((r) => r.id)).toEqual(['E-6', 'E-1', 'E-3']);
    expect(rows[0]?.view.notReadReason).toBe('not_configured');
    expect(rows[1]?.title).toContain('integration-tests');
  });

  it('gives Owner and Nontechnical redacted titles, no row for withheld evidence, and refuses unscoped input (BACK-92 R7)', () => {
    for (const persona of ['owner', 'nontechnical'] as const) {
      const w = authorizedWorld(WORLD, persona);
      const rt = projectById(w, 'RT')!;
      const text = linkedEvidence(w, rt, componentById(rt, 'stock-sync')!, persona, 'en').map((r) => r.title).join(' ');
      expect(text).not.toContain('integration-tests');
      expect(text).not.toContain('#DEMO-4471');
      // Inventory rests only on Technical-only E-5: the scoped world gives it no linked row at all, not a placeholder.
      expect(linkedEvidence(w, rt, componentById(rt, 'inventory')!, persona, 'en')).toEqual([]);
      expect(() => linkedEvidence(WORLD, RT, comp('inventory'), persona, 'en')).toThrow(/unscoped evidence/);
    }
    expect(linkedEvidence(WORLD, RT, comp('inventory'), 'technical', 'en').map((r) => r.id)).toEqual(['E-5']);
  });

  it('has no evidence for a component with an empty basis and no attention', () => {
    expect(linkedEvidence(WORLD, RT, comp('pos'), 'owner', 'en')).toEqual([]);
    expect(attentionFor(RT, comp('pos'))).toEqual([]);
    expect(attentionFor(RT, comp('stock-sync')).map((a) => a.id)).toEqual(['ATT-RT-1']);
  });
});

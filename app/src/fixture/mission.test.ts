import { describe, expect, it } from 'vitest';
import { resolveHealth, resolveLabel, effectiveFreshness } from '../contract/rules';
import { INV_DEMO_7 } from './inv-demo-7';
import { authorizedWorld } from '../view/authorize';
import { evidenceView, nodeChip } from '../lenses/logic/evidence';
import { isRiskNode, nodeStatus, sourceCounts, sourceStatus } from '../lenses/logic/status';
import { WORLD } from './world';

const NOW = WORLD.now;

const w = WORLD;

describe('one shared synthetic world', () => {
  it('reuses V1 identities: the same investigation and every V1 evidence id', () => {
    expect(w.investigationId).toBe(INV_DEMO_7.id);
    for (const e of INV_DEMO_7.evidence) expect(w.evidence[e.id], e.id).toBe(e);
  });

  it('only references things that exist', () => {
    const nodeIds = new Set(w.graph.nodes.map((n) => n.id));
    for (const e of w.graph.edges) {
      expect(nodeIds.has(e.a), e.id).toBe(true);
      expect(nodeIds.has(e.b), e.id).toBe(true);
      for (const id of e.evidence) expect(w.evidence[id], `${e.id}:${id}`).toBeDefined();
    }
    for (const n of w.graph.nodes) for (const id of n.evidence) expect(w.evidence[id], `${n.id}:${id}`).toBeDefined();
    for (const r of w.replay) if (r.evidence) expect(w.evidence[r.evidence], r.id).toBeDefined();
    for (const m of w.missions) {
      expect(w.missionAgents.some((a) => a.id === m.agent), m.id).toBe(true);
      for (const id of m.evidence) expect(w.evidence[id], `${m.id}:${id}`).toBeDefined();
    }
    const providers = new Set(w.sources.map((s) => s.provider));
    for (const n of w.graph.nodes) if (n.provider) expect(providers.has(n.provider), n.id).toBe(true);
    for (const s of w.sourceTimeline) expect(providers.has(s.provider), s.id).toBe(true);
  });

  it('has unique ids', () => {
    for (const list of [w.graph.nodes.map((n) => n.id), w.graph.edges.map((e) => e.id), w.replay.map((r) => r.id), w.missions.map((m) => m.id), w.sourceTimeline.map((s) => s.id)]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('keeps replay events in time order and every event inside the investigation window', () => {
    const clocks = w.replay.map((r) => r.clock);
    expect([...clocks].sort()).toEqual(clocks);
    expect(w.sourceTimeline.map((s) => s.at)).toEqual([...w.sourceTimeline.map((s) => s.at)].sort());
    for (const s of w.sourceTimeline) expect(Date.parse(s.at)).toBeLessThanOrEqual(Date.parse(NOW));
  });
});

describe('Unknown is never Healthy', () => {
  it('shows healthy only where current Observed evidence backs it', () => {
    for (const n of w.graph.nodes) {
      const healthy = resolveHealth(n.state) === 'healthy';
      const backed = n.state.basis.some((r) => resolveLabel(r) === 'observed' && effectiveFreshness(r) === 'current');
      expect(healthy, n.id).toBe(backed && n.state.health === 'healthy');
    }
    expect(w.graph.nodes.filter((n) => nodeStatus(n).health === 'healthy').map((n) => n.id)).toEqual(['github']);
  });

  it('turns claimed-healthy nodes with no or stale evidence into unknown', () => {
    for (const id of ['khepri', 'jira', 'sentry', 'inventory']) {
      const n = w.graph.nodes.find((x) => x.id === id)!;
      expect(n.state.health, `${id} claims healthy`).toBe('healthy');
      expect(nodeStatus(n).health, id).toBe('unknown');
      expect(nodeChip(n, w.sources).kind, id).not.toBe('healthy');
    }
  });

  it('never claims degraded without a read observation', () => {
    const seshat = w.graph.nodes.find((n) => n.id === 'seshat-bi')!;
    expect(seshat.state.health).toBe('degraded');
    expect(nodeStatus(seshat).health).toBe('unknown');
  });

  it('never shows a source healthy without a current observed read', () => {
    const rows = w.sources.map((s) => sourceStatus(s, w.now));
    expect(rows.filter((r) => r.health === 'healthy').map((r) => r.provider)).toEqual(['github']);
  });
});

describe('sources keep three independent readings', () => {
  const rows = w.sources.map((s) => sourceStatus(s, w.now));
  it('derives counts, with no combined figure', () => {
    const c = sourceCounts(rows);
    expect(c.reachable).toEqual({ n: 3, of: 6 });
    expect(c.current).toEqual({ n: 2, of: 6 });
    expect(c.healthy).toEqual({ n: 1, of: 6 });
    expect(c.issues).toBe(2);
    expect(Object.keys(c).sort()).toEqual(['current', 'healthy', 'issues', 'reachable']);
  });

  it('lets the axes disagree: reachable but stale, and reachable but health unknown', () => {
    const sentry = rows.find((r) => r.provider === 'sentry')!;
    expect(sentry).toMatchObject({ connectivity: 'reachable', freshness: 'stale', health: 'unknown' });
    const jira = rows.find((r) => r.provider === 'jira')!;
    expect(jira).toMatchObject({ connectivity: 'reachable', freshness: 'current', health: 'unknown' });
    const port = rows.find((r) => r.provider === 'port')!;
    expect(port).toMatchObject({ connectivity: 'unavailable', freshness: 'stale', health: 'unknown', issue: true });
    for (const p of ['datadog', 'confluence']) expect(rows.find((r) => r.provider === p)).toMatchObject({ connectivity: 'not_configured', freshness: 'unknown', readAt: null, issue: false });
  });

  it('derives the last good read from the fixed now, not from the constant stamp V1 uses', () => {
    expect(rows.find((r) => r.provider === 'github')!.readAt).toBe('2026-11-16T14:03:00.000Z');
    expect(rows.find((r) => r.provider === 'port')!.readAt).toBe('2026-11-15T13:09:00.000Z');
    expect(rows.find((r) => r.provider === 'port')!.used).toBeGreaterThan(1);
  });

  it('finds exactly the risks the screens report', () => {
    expect(w.graph.nodes.filter((n) => isRiskNode(n, w)).map((n) => n.id).sort()).toEqual(['port', 'sentry', 'stock-sync']);
  });
});

describe('persona-safe evidence', () => {
  const e5 = w.evidence['E-5']!;
  it('hides technical-only evidence from Owner and Nontechnical', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      expect(evidenceView(e5, p)).toMatchObject({ restricted: true, label: 'unknown', provider: null });
    }
    expect(evidenceView(e5, 'technical').restricted).toBe(false);
  });

  it('is defence in depth only: screens pass Owner and Nontechnical an authorized world that holds no Technical-only record (BACK-30)', () => {
    for (const p of ['owner', 'nontechnical'] as const) {
      const scoped = authorizedWorld(w, p);
      expect(Object.values(scoped.evidence).some((r) => r.visibility === 'technical')).toBe(false);
      expect(scoped.evidence['E-5']).toBeUndefined();
    }
  });

  it('reveals targets and external ids to Technical only', () => {
    const e1 = w.evidence['E-1']!;
    expect(evidenceView(e1, 'technical').externalId).toBe('#DEMO-4471');
    expect(evidenceView(e1, 'owner').externalId).toBeUndefined();
    expect(evidenceView(e1, 'nontechnical').observedAt).toBeUndefined();
    expect(evidenceView(e1, 'nontechnical').targetLabel).toBeUndefined();
  });

  it('keeps a correlated item without a written rule as a hypothesis (contract rule)', () => {
    expect(resolveLabel({ ...w.evidence['E-3']!, rule: '' })).toBe('hypothesis');
  });
});

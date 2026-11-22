import { describe, expect, it } from 'vitest';
import type { InvestigationData } from '../contract/types';
import { EVIDENCE, INV_DEMO_7 } from '../fixture/inv-demo-7';
import { viewFor, type EvidenceView, type PersonaView } from './viewFor';

// Allowlists: a persona view may carry only these evidence fields (selection, not hiding).
const ALLOWED: Record<'owner' | 'technical' | 'nontechnical', readonly string[]> = {
  nontechnical: ['id', 'label', 'freshness', 'ageMinutes', 'inert', 'provider', 'notReadReason', 'restricted'],
  owner: ['id', 'label', 'freshness', 'ageMinutes', 'inert', 'provider', 'notReadReason', 'restricted', 'observedAt', 'environment'],
  technical: ['id', 'label', 'freshness', 'ageMinutes', 'inert', 'provider', 'notReadReason', 'restricted', 'observedAt', 'environment',
    'ingestedAt', 'externalId', 'url', 'rule', 'rawOutput', 'targetLabel'],
};
const RESTRICTED_KEYS = ['id', 'label', 'freshness', 'ageMinutes', 'inert', 'restricted'];

describe('viewFor: least-privilege persona views (Blueprint v4 §5, D-5)', () => {
  const tech = viewFor('technical', INV_DEMO_7);
  const owner = viewFor('owner', INV_DEMO_7);
  const non = viewFor('nontechnical', INV_DEMO_7);

  it('gives every persona the same facts in the same order with the same labels', () => {
    const shape = (v: PersonaView) => v.facts.map((f) => [f.key, f.label]);
    expect(shape(owner)).toEqual(shape(tech));
    expect(shape(non)).toEqual(shape(tech));
  });

  it.each([['owner', owner], ['technical', tech], ['nontechnical', non]] as const)('%s evidence carries only allowlisted fields', (p, v) => {
    for (const e of v.evidence) {
      const allowed = e.restricted ? RESTRICTED_KEYS : ALLOWED[p];
      for (const k of Object.keys(e)) expect(allowed, `${p} ${e.id}.${k}`).toContain(k);
    }
  });

  it('shows raw output and job names to technical only (H1)', () => {
    const e1 = (v: PersonaView) => v.evidence.find((e) => e.id === 'E-1') as EvidenceView;
    expect(e1(tech).rawOutput).toContain('AssertionError');
    expect(e1(tech).targetLabel).toContain('integration-tests');
    for (const v of [owner, non]) {
      expect(JSON.stringify(v)).not.toContain('integration-tests');
      expect(JSON.stringify(v)).not.toContain('AssertionError');
      expect(JSON.stringify(v)).not.toContain('#DEMO-4471');
      expect(JSON.stringify(v)).not.toContain('example.invalid');
    }
  });

  it('reduces restricted evidence to id and status for non-technical personas (M5) (raw, unprojected input: defence in depth)', () => {
    for (const v of [owner, non]) {
      const e5 = v.evidence.find((e) => e.id === 'E-5') as EvidenceView;
      expect(e5.restricted).toBe(true);
      expect(Object.keys(e5).sort()).toEqual([...RESTRICTED_KEYS].sort());
      expect(e5.label).toBe('unknown');
    }
    expect(tech.evidence.find((e) => e.id === 'E-5')?.restricted).toBeUndefined();
  });

  it('labels unread evidence unknown in the view itself (H3)', () => {
    for (const id of ['E-6', 'E-7']) expect(tech.evidence.find((e) => e.id === id)?.label).toBe('unknown');
  });

  it('labels an observed or correlated fact unknown when its evidence was not read (H3)', () => {
    const inv: InvestigationData = {
      ...INV_DEMO_7,
      facts: [{ key: 'observed', evidence: EVIDENCE.runtime }, { key: 'correlated', evidence: null }],
    };
    expect(viewFor('owner', inv).facts.map((f) => f.label)).toEqual(['unknown', 'unknown']);
  });

  it('selects header metadata per persona (H2)', () => {
    expect(tech.meta.component).toBe('Backend-Core › stock-sync');
    expect(tech.meta.environment).toBe('ci');
    expect(owner.meta.environment).toBe('ci');
    expect(non.meta).not.toHaveProperty('component');
    expect(non.meta).not.toHaveProperty('environment');
  });

  it('uses plain labels for nontechnical and standard labels otherwise', () => {
    expect([non.labelStyle, owner.labelStyle, tech.labelStyle]).toEqual(['plain', 'standard', 'standard']);
  });

  it('gates the confidence number on persona, using a fixture with a complete basis', () => {
    const withBasis: InvestigationData = {
      ...INV_DEMO_7,
      hypothesis: { ...INV_DEMO_7.hypothesis, confidenceBasis: { method: 'rule R-7', calibration: '40 cases', sources: [EVIDENCE.checkFailed], value: 62 } },
    };
    expect(viewFor('technical', withBasis).hypothesis.confidence.kind).toBe('number');
    expect(viewFor('owner', withBasis).hypothesis.confidence.kind).toBe('words');
    expect(viewFor('nontechnical', withBasis).hypothesis.confidence.kind).toBe('words');
    for (const v of [owner, tech, non]) expect(v.hypothesis.confidence.kind).toBe('words');
  });

  it('shows supporting and contradicting evidence to technical only', () => {
    expect([tech, owner, non].map((v) => v.hypothesis.showForAgainst)).toEqual([true, false, false]);
  });

  it('leads with the stage for technical and with the ledger otherwise (C2)', () => {
    expect([tech, owner, non].map((v) => v.stageFirst)).toEqual([true, false, false]);
  });

  it('reports customer impact as unknown for everyone', () => {
    for (const v of [owner, tech, non]) expect(v.impact).toBe('unknown');
  });

  it('resolves node health and freshness through the contract, with each node’s own age (H2, M3)', () => {
    for (const v of [owner, tech, non]) {
      const inv = v.nodes.find((n) => n.id === 'inventory');
      expect(inv?.health).toBe('unknown');
      expect(inv?.freshness).toBe('stale');
      expect(inv?.ageMinutes).toBe(540);
      expect(v.nodes.find((n) => n.id === 'pos')?.ageMinutes).toBeNull();
      expect(v.nodes.every((n) => n.health !== 'healthy')).toBe(true);
    }
  });

  it('computes evidence freshness from the source, not the claim', () => {
    const e5 = tech.evidence.find((e) => e.id === 'E-5');
    expect(e5?.freshness).toBe('stale');
  });

  it('counts sources that are not current: 3 of 5', () => {
    expect(tech.sourcesNotCurrent).toEqual({ notCurrent: 3, total: 5 });
  });

  it('keeps not-read evidence visible with its reason instead of dropping it', () => {
    const reasons = tech.evidence.filter((e) => e.notReadReason).map((e) => e.notReadReason).sort();
    expect(reasons).toEqual(['not_configured', 'unavailable']);
    expect(non.evidence.filter((e) => e.notReadReason)).toHaveLength(2);
  });

  it('marks every link inert because every source is synthetic', () => {
    expect(tech.evidence.every((e) => e.inert)).toBe(true);
    expect(tech.demo).toBe(true);
  });

  it('does not mutate the fixture', () => {
    const before = JSON.stringify(INV_DEMO_7);
    viewFor('nontechnical', INV_DEMO_7);
    expect(JSON.stringify(INV_DEMO_7)).toBe(before);
  });
});

// Evidence record adapter (BACK-57 slice 3): the server's typed evidence to EvidenceReference, with the
// HumanDecision mapping the owner accepted on BACK-94 (comment 18828). Pure; no network.
import { describe, expect, it } from 'vitest';
import { effectiveFreshness, resolveLabel } from '../contract/rules';
import type { SourceAuthority } from '../contract/types';
import { decisionLabel, toEvidenceReference } from './evidence';

const github: SourceAuthority = {
  provider: 'github', connectivity: 'reachable', lastSuccessAt: '2026-11-25T12:00:00.000Z', ageMinutes: 10, ttlSeconds: 1800, synthetic: true,
};
const sources = new Map([['s1', github]]);
const NOW = new Date('2026-11-25T12:10:00Z');

const record = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  type: 'Observation',
  state: 'ok',
  projectId: 'p1',
  sourceId: 's1',
  investigationId: null,
  sourceRef: 'github:kemetra-labs/backstage-os#pull/12',
  observedAt: '2026-11-25T12:00:00.000Z',
  receivedAt: '2026-11-25T12:00:01.000Z',
  payload: { kind: 'pull_request', number: 12, title: 'Add the portfolio route', url: 'https://github.com/kemetra-labs/backstage-os/pull/12' },
  citations: [],
  ...over,
});
const map = (over: Record<string, unknown> = {}) => toEvidenceReference(record(over), sources, NOW);

describe('source-derived evidence', () => {
  it('an ok Observation is observed, all-visible, with its source authority and link', () => {
    const ref = map()!;
    expect(ref).toMatchObject({ id: 'e1', classification: 'observed', visibility: 'all', freshness: 'current' });
    expect(ref.observation).toMatchObject({ source: github, sourceUrl: 'https://github.com/kemetra-labs/backstage-os/pull/12' });
    expect(resolveLabel(ref)).toBe('observed');
  });

  it('a Correlation keeps its written rule; without one it resolves to a hypothesis', () => {
    expect(resolveLabel(map({ type: 'Correlation', payload: { rule: 'deploy before error spike' } })!)).toBe('correlated');
    expect(resolveLabel(map({ type: 'Correlation', payload: {} })!)).toBe('hypothesis');
  });

  it('a Hypothesis is a hypothesis', () => {
    expect(resolveLabel(map({ type: 'Hypothesis' })!)).toBe('hypothesis');
  });

  it('an ok record older than the source TTL is stale, even when the source read is fresh', () => {
    const ref = map({ observedAt: '2026-11-22T12:00:00.000Z' })!;
    expect(ref.freshness).toBe('stale');
    expect(effectiveFreshness(ref)).toBe('stale');
  });

  it('an ok record dated in the future is unknown, never current', () => {
    expect(effectiveFreshness(map({ observedAt: '2026-11-26T00:00:00.000Z' })!)).toBe('unknown');
  });

  it('keeps only an https github.com link', () => {
    expect(map({ payload: { url: 'https://evil.example/x' } })!.observation!.sourceUrl).toBeUndefined();
  });

  it('a stale record claims stale, so it is never current', () => {
    expect(effectiveFreshness(map({ state: 'stale' })!)).toBe('stale');
  });

  it.each(['unknown', 'error', 'denied'])('a %s record is unread: label unknown, reason unavailable, never restricted', (state) => {
    const ref = map({ state })!;
    expect(ref.observation).toBeNull();
    expect(ref.notReadReason).toBe('unavailable');
    expect(ref.visibility).toBe('all');
    expect(resolveLabel(ref)).toBe('unknown');
  });

  it('a source the caller has no authority for is unread, not invented', () => {
    const ref = toEvidenceReference(record({ sourceId: 's-unknown' }), sources, NOW)!;
    expect(ref.observation).toBeNull();
    expect(resolveLabel(ref)).toBe('unknown');
  });
});

describe('a HumanDecision (owner decision, BACK-94)', () => {
  const decision = (over: Record<string, unknown> = {}) =>
    record({ type: 'HumanDecision', sourceId: null, investigationId: 'i1', sourceRef: 'kawalys:decision', payload: { decision: 'Roll back', rationale: 'CI red' }, ...over });
  const link = 'https://github.com/kemetra-labs/backstage-os/pull/12';

  it('is not source evidence: no EvidenceReference, so no source is invented for it', () => {
    expect(toEvidenceReference(decision({ citations: ['e1'] }), sources, NOW)).toBeNull();
  });

  it('without citations is proposed', () => {
    expect(decisionLabel(decision({ citations: [] }))).toBe('proposed');
  });

  it('with citations but no link to the owning record is still proposed (the server has no link today)', () => {
    expect(decisionLabel(decision({ citations: ['e1'] }))).toBe('proposed');
  });

  it('with a link but no citations is proposed', () => {
    expect(decisionLabel(decision({ citations: [], payload: { url: link } }))).toBe('proposed');
  });

  it('is approved only with citations AND an https link to the owning record', () => {
    expect(decisionLabel(decision({ citations: ['e1'], payload: { url: link } }))).toBe('approved');
    expect(decisionLabel(decision({ citations: ['e1'], payload: { url: 'javascript:alert(1)' } }))).toBe('proposed');
    expect(decisionLabel(decision({ citations: ['e1'], payload: { url: 'http://github.com/x' } }))).toBe('proposed');
    expect(decisionLabel(decision({ citations: ['e1'], payload: { url: 'https://localhost/x' } }))).toBe('proposed');
  });

  it('is null for anything that is not a decision', () => {
    expect(decisionLabel(record())).toBeNull();
    expect(decisionLabel('x')).toBeNull();
    expect(decisionLabel(decision({ id: '' }))).toBeNull();
  });
});

describe('the record is untrusted', () => {
  it.each([
    ['not an object', 'x'],
    ['no id', { ...record(), id: '' }],
    ['an unknown type', { ...record(), type: 'Rumour' }],
    ['an unknown state', { ...record(), state: 'healthy' }],
    ['a bad observedAt', { ...record(), observedAt: 'yesterday' }],
  ])('%s gives null, never a throw or an ok reference', (_label, body) => {
    expect(toEvidenceReference(body, sources, NOW)).toBeNull();
  });
});

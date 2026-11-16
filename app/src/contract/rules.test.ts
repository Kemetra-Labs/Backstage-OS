import { describe, expect, it } from 'vitest';
import type { ConfidenceBasis, EvidenceReference, Hypothesis, Observation, SourceAuthority } from './types';
import {
  confidenceDisplay,
  countDisplay,
  effectiveFreshness,
  freshnessOf,
  isForbiddenControlLabel,
  isInertLink,
  needsDemoMarker,
  resolveHealth,
  resolveLabel,
} from './rules';

const github: SourceAuthority = {
  provider: 'github', connectivity: 'reachable', lastSuccessAt: '2026-11-16T14:03:00Z',
  ageMinutes: 6, ttlSeconds: 1800, synthetic: true,
};
const obs: Observation = {
  id: 'O-1', target: { kind: 'check', id: 'check:x', label: 'x' }, source: github,
  observedAt: '2026-11-16T14:02:00Z', ingestedAt: '2026-11-16T14:03:00Z', environment: 'ci',
};
const ref = (over: Partial<EvidenceReference> = {}): EvidenceReference => ({
  id: 'E-1', observation: obs, classification: 'observed', freshness: 'current', visibility: 'all', ...over,
});

describe('resolveHealth: healthy needs current observed evidence', () => {
  it('keeps healthy when backed by a current observed item', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [ref()] })).toBe('healthy');
  });
  it('downgrades healthy to unknown with no evidence', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [] })).toBe('unknown');
  });
  it('downgrades healthy to unknown when the only evidence is stale', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'stale', health: 'healthy', basis: [ref({ freshness: 'stale' })] })).toBe('unknown');
  });
  it('downgrades healthy to unknown when the evidence is a hypothesis', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [ref({ classification: 'hypothesis' })] })).toBe('unknown');
  });
  it('downgrades healthy to unknown when the evidence was not read', () => {
    expect(resolveHealth({ connectivity: 'unavailable', freshness: 'unknown', health: 'healthy', basis: [ref({ observation: null })] })).toBe('unknown');
  });
  it('keeps degraded or down only with a read observation, otherwise unknown', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'stale', health: 'down', basis: [ref({ freshness: 'stale' })] })).toBe('down');
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'current', health: 'degraded', basis: [] })).toBe('unknown');
  });
  it('passes unknown through', () => {
    expect(resolveHealth({ connectivity: 'not_configured', freshness: 'unknown', health: 'unknown', basis: [] })).toBe('unknown');
  });
});

describe('resolveLabel: correlated needs a rule', () => {
  it('keeps correlated with a rule', () => {
    expect(resolveLabel(ref({ classification: 'correlated', rule: 'key in commit message' }))).toBe('correlated');
  });
  it('renders correlated without a rule as hypothesis', () => {
    expect(resolveLabel(ref({ classification: 'correlated' }))).toBe('hypothesis');
    expect(resolveLabel(ref({ classification: 'correlated', rule: '   ' }))).toBe('hypothesis');
  });
  it('renders approved without an owning record link as proposed', () => {
    expect(resolveLabel(ref({ classification: 'approved' }))).toBe('proposed');
    const withUrl = ref({ classification: 'approved', observation: { ...obs, sourceUrl: 'https://jira.example.invalid/RT-DEMO-112' } });
    expect(resolveLabel(withUrl)).toBe('approved');
  });
  it('leaves other labels unchanged', () => {
    expect(resolveLabel(ref())).toBe('observed');
    expect(resolveLabel(ref({ classification: 'proposed' }))).toBe('proposed');
  });
});

describe('confidenceDisplay: numbers need a complete basis and the technical persona', () => {
  const basis: ConfidenceBasis = { method: 'rule R-7', calibration: '40 past cases', sources: [ref()], value: 62 };
  const hyp = (over: Partial<Hypothesis> = {}): Hypothesis => ({ id: 'H-1', confidence: 'medium', supporting: [], contradicting: [], ...over });

  it('shows a number to technical when the basis is complete', () => {
    expect(confidenceDisplay(hyp({ confidenceBasis: basis }), 'technical')).toEqual({ kind: 'number', level: 'medium', value: 62, basis });
  });
  it('shows words to owner and nontechnical even with a complete basis', () => {
    expect(confidenceDisplay(hyp({ confidenceBasis: basis }), 'owner')).toEqual({ kind: 'words', level: 'medium' });
    expect(confidenceDisplay(hyp({ confidenceBasis: basis }), 'nontechnical')).toEqual({ kind: 'words', level: 'medium' });
  });
  it('shows words to technical when there is no basis', () => {
    expect(confidenceDisplay(hyp(), 'technical')).toEqual({ kind: 'words', level: 'medium' });
  });
  it.each([
    ['empty method', { ...basis, method: '' }],
    ['empty calibration', { ...basis, calibration: ' ' }],
    ['no sources', { ...basis, sources: [] }],
    ['value out of range', { ...basis, value: 140 }],
    ['value not finite', { ...basis, value: Number.NaN }],
  ])('shows words to technical when the basis has %s', (_name, b) => {
    expect(confidenceDisplay(hyp({ confidenceBasis: b }), 'technical')).toEqual({ kind: 'words', level: 'medium' });
  });
});

describe('countDisplay', () => {
  it('renders not read for a null value, never zero', () => {
    expect(countDisplay({ value: null, sourcesRead: 0, sourcesTotal: 2, atLeast: false, basis: [] })).toEqual({ kind: 'notRead', sourcesRead: 0, sourcesTotal: 2 });
  });
  it('renders at least N when a source was stale or unread', () => {
    expect(countDisplay({ value: 3, sourcesRead: 2, sourcesTotal: 5, atLeast: true, basis: [] })).toEqual({ kind: 'atLeast', value: 3, sourcesRead: 2, sourcesTotal: 5 });
  });
  it('renders an exact count when every source was read', () => {
    expect(countDisplay({ value: 1, sourcesRead: 1, sourcesTotal: 1, atLeast: false, basis: [] })).toEqual({ kind: 'exact', value: 1, sourcesRead: 1, sourcesTotal: 1 });
  });
});

describe('freshnessOf', () => {
  it('is unknown when never read or not configured', () => {
    expect(freshnessOf({ ...github, lastSuccessAt: null, ageMinutes: null })).toBe('unknown');
    expect(freshnessOf({ ...github, connectivity: 'not_configured', lastSuccessAt: null, ageMinutes: null })).toBe('unknown');
  });
  it('is current inside the TTL and stale past it', () => {
    expect(freshnessOf(github)).toBe('current');
    expect(freshnessOf({ ...github, ageMinutes: 540 })).toBe('stale');
  });
  it('is stale when unreachable even if the last read is recent', () => {
    expect(freshnessOf({ ...github, connectivity: 'unavailable' })).toBe('stale');
  });
});

describe('needsDemoMarker and isInertLink', () => {
  it('forces the demo marker when any source is synthetic', () => {
    expect(needsDemoMarker([github])).toBe(true);
    expect(needsDemoMarker([{ ...github, synthetic: false }])).toBe(false);
  });
  it('treats example.invalid, missing urls and synthetic sources as inert', () => {
    expect(isInertLink('https://github.example.invalid/run/1', false)).toBe(true);
    expect(isInertLink(undefined, false)).toBe(true);
    expect(isInertLink('https://github.com/x', true)).toBe(true);
    expect(isInertLink('not a url', false)).toBe(true);
    expect(isInertLink('https://github.com/x', false)).toBe(false);
  });
});

describe('review fixes: labels for unread evidence (H3)', () => {
  it('labels unread evidence unknown, whatever it claims', () => {
    expect(resolveLabel(ref({ observation: null }))).toBe('unknown');
    expect(resolveLabel(ref({ observation: null, classification: 'correlated', rule: 'r' }))).toBe('unknown');
  });
});

describe('review fixes: freshness is computed, not trusted (M3)', () => {
  const pastTtl: Observation = { ...obs, source: { ...github, ageMinutes: 540 } };
  it('takes the worse of claimed and computed freshness', () => {
    expect(effectiveFreshness(ref({ observation: pastTtl, freshness: 'current' }))).toBe('stale');
    expect(effectiveFreshness(ref())).toBe('current');
    expect(effectiveFreshness(ref({ freshness: 'stale' }))).toBe('stale');
  });
  it('is unknown when nothing was read', () => {
    expect(effectiveFreshness(ref({ observation: null, freshness: 'current' }))).toBe('unknown');
  });
  it('does not keep healthy when the claimed-current source is past its TTL', () => {
    expect(resolveHealth({ connectivity: 'reachable', freshness: 'current', health: 'healthy', basis: [ref({ observation: pastTtl })] })).toBe('unknown');
  });
});

describe('review fixes: counts never show a misleading exact number (M2)', () => {
  it('reads not read when no source was read, even with value 0', () => {
    expect(countDisplay({ value: 0, sourcesRead: 0, sourcesTotal: 2, atLeast: false, basis: [] }).kind).toBe('notRead');
  });
  it('reads at least N when some sources were not read, even if atLeast is false', () => {
    expect(countDisplay({ value: 2, sourcesRead: 1, sourcesTotal: 3, atLeast: false, basis: [] }).kind).toBe('atLeast');
  });
});

describe('review fixes: inert links (M1)', () => {
  it.each(['javascript:alert(1)', 'data:text/html,x', 'https://x.example.invalid./', 'ftp://github.com/x'])('treats %s as inert', (u) => {
    expect(isInertLink(u, false)).toBe(true);
  });
  it('allows a real http(s) host only', () => {
    expect(isInertLink('http://github.com/x', false)).toBe(false);
  });
});

describe('review fixes: Arabic command forms and English inflections (M6)', () => {
  it.each(['اعتمد', 'أجّل', 'شغّل', 'أعد المحاولة', 'أصدر', 'اصدار', 'وافق', 'Approved', 'Released', 'Retrying', 'Running'])('forbids "%s"', (l) => {
    expect(isForbiddenControlLabel(l)).toBe(true);
  });
  it.each(['إغلاق', 'عرض الدليل', 'غير تقني', 'Good', 'Ongoing', 'Run-book'])('allows "%s"', (l) => {
    expect(isForbiddenControlLabel(l)).toBe(l === 'Run-book');
  });
});

describe('isForbiddenControlLabel: English and Arabic action verbs', () => {
  it.each(['Approve chosen option', 'Reject', 'Defer', 'Go', 'No-go', 'Release now', 'Retry', 'Run checks', 'approve'])('forbids "%s"', (label) => {
    expect(isForbiddenControlLabel(label)).toBe(true);
  });
  it.each(['اعتماد الخيار المحدد', 'رفض', 'تأجيل', 'تشغيل الفحص', 'إصدار', 'إعادة المحاولة'])('forbids Arabic "%s"', (label) => {
    expect(isForbiddenControlLabel(label)).toBe(true);
  });
  it.each(['Open evidence E-3', 'Copy proposal text', 'Close', 'Owner', 'عربي', 'نسخ نص الاقتراح', 'Good morning', 'Ongoing'])('allows "%s"', (label) => {
    expect(isForbiddenControlLabel(label)).toBe(false);
  });
});

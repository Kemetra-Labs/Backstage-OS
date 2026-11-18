import { describe, expect, it } from 'vitest';
import { isForbiddenControlLabel } from '../../contract/rules';
import { segments } from '../segments';
import { AGENTS_COPY } from './agents';
import { SOURCES_COPY } from './sources';

// Exclusive buckets: 2 + 1 + 1 + 1 + 0 = 5.
const SUMMARY = { total: 5, current: 2, stale: 1, unknown: 0, unavailable: 1, notConfigured: 1 };
const COUNTS = { watching: 1, idle: 2, paused: 3, not_enabled: 4 };

/** Every plain string in a copy object. Function members are exercised explicitly below. */
function strings(v: unknown): readonly string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

const keysOf = (v: unknown, prefix = ''): readonly string[] =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v).flatMap(([k, x]) => keysOf(x, `${prefix}${k}.`))
    : [prefix];

const latinOutsideBraces = (s: string): string[] =>
  segments(s).filter((x) => !x.ltr && /[A-Za-z]/.test(x.text)).map((x) => x.text);

describe('agents copy', () => {
  it('has the same keys in EN and AR', () => {
    expect(keysOf(AGENTS_COPY.ar)).toEqual(keysOf(AGENTS_COPY.en));
  });

  it('has no Latin outside braces in Arabic', () => {
    const samples = [
      ...strings(AGENTS_COPY.ar),
      AGENTS_COPY.ar.roster.summary(COUNTS),
      AGENTS_COPY.ar.history.by('triage-scout'),
      AGENTS_COPY.ar.history.openCase('INV-DEMO-7'),
      AGENTS_COPY.ar.history.inspectEvidence('E-3'),
    ];
    for (const s of samples) expect(latinOutsideBraces(s), s).toEqual([]);
  });

  it('states the oversight rules and the remediation state in words', () => {
    expect(AGENTS_COPY.en.oversight.points.join(' ')).toMatch(/Proposed/);
    expect(AGENTS_COPY.en.oversight.points.join(' ')).toMatch(/remediation agent is not part/);
    expect(AGENTS_COPY.en.roster.state.not_enabled).toBe('Not enabled');
  });

  it('builds neutral link labels', () => {
    for (const lang of ['en', 'ar'] as const) {
      const h = AGENTS_COPY[lang].history;
      expect(isForbiddenControlLabel(h.openCase('INV-DEMO-7'))).toBe(false);
      expect(isForbiddenControlLabel(h.inspectEvidence('E-3'))).toBe(false);
      expect(isForbiddenControlLabel(h.filterAll)).toBe(false);
    }
  });

  it('summarises counts', () => {
    expect(AGENTS_COPY.en.roster.summary(COUNTS)).toBe('1 watching (simulated), 2 idle, 3 paused by a human, 4 not enabled');
  });
});

describe('sources copy', () => {
  it('has the same keys in EN and AR', () => {
    expect(keysOf(SOURCES_COPY.ar)).toEqual(keysOf(SOURCES_COPY.en));
  });

  it('has no Latin outside braces in Arabic', () => {
    const c = SOURCES_COPY.ar;
    const samples = [
      c.lede, c.plainNote, ...strings(c.dimensions), ...strings(c.integrations),
      c.table.caption('Khepri'), c.table.ttl, c.table.ttlSeconds(1800), c.table.synthetic, c.table.summaryRow,
      c.summary(SUMMARY), c.stateHeading,
      c.stateBlock.unavailable('{Khepri} {Jira}'), c.stateBlock.not_configured('{Khepri} {Datadog}'),
    ];
    for (const s of samples) expect(latinOutsideBraces(s), s).toEqual([]);
  });

  it('summarises without ever saying ok or healthy', () => {
    for (const lang of ['en', 'ar'] as const) {
      const s = SOURCES_COPY[lang].summary(SUMMARY);
      expect(s).not.toMatch(/\bok\b|healthy|سليم/i);
    }
    expect(SOURCES_COPY.en.summary(SUMMARY)).toBe('2 of 5 sources current, 1 stale, 1 unavailable, 1 not set up');
    expect(SOURCES_COPY.en.summary({ ...SUMMARY, stale: 0, unknown: 1 })).toBe('2 of 5 sources current, 1 unavailable, 1 not set up, 1 not read yet');
    expect(SOURCES_COPY.ar.summary({ ...SUMMARY, stale: 0, unknown: 1 })).toBe('2 من 5 مصادر حديثة، 1 غير متاحة، 1 غير مُعدة، 1 لم تُقرأ بعد');
    expect(SOURCES_COPY.en.summary({ ...SUMMARY, stale: 0, unavailable: 0, notConfigured: 0 })).toBe('2 of 5 sources current');
    expect(SOURCES_COPY.ar.summary({ ...SUMMARY, stale: 0, unavailable: 0, notConfigured: 0 })).toBe('2 من 5 مصادر حديثة');
  });

  it('says nothing is connected and points at the G2 gate', () => {
    expect(SOURCES_COPY.en.integrations.intro).toMatch(/nothing is connected/);
    expect(SOURCES_COPY.en.integrations.intro).toMatch(/BACK-7/);
  });

  it('has a plain and a technical description for every provider', () => {
    for (const lang of ['en', 'ar'] as const) {
      const p = SOURCES_COPY[lang].integrations.provider;
      expect(Object.keys(p).sort()).toEqual(['confluence', 'datadog', 'github', 'jira', 'port', 'sentry']);
      for (const i of Object.values(p)) expect(i.reads && i.plain).toBeTruthy();
    }
  });

  it('keeps the plain text free of banned persona strings', () => {
    const all = JSON.stringify(SOURCES_COPY) + JSON.stringify(AGENTS_COPY);
    for (const b of ['integration-tests', '#DEMO-4471', 'PR #DEMO-88', 'AssertionError', 'example.invalid', 'DEMO-4468', 'DEMO-5120', 'DEMO-311']) {
      expect(all.includes(b), b).toBe(false);
    }
  });
});

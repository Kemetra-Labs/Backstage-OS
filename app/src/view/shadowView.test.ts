import { describe, expect, it } from 'vitest';
import fixture from '../fixture/shadow-cognition.json';
import { readShadow } from './shadowView';

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;

describe('readShadow (COG-07 shadow view model)', () => {
  it('reads the committed cognitive-core fixture', () => {
    const v = readShadow(fixture);
    expect(v.kind).toBe('ok');
    if (v.kind !== 'ok') return;
    expect(v.searches.map((s) => s.query)).toEqual(['login', 'BACK-7', '#12', 'سياسة الجلسة', 'payments outage']);
    expect(v.searches.find((s) => s.query === 'payments outage')).toMatchObject({ outcome: 'no-match', hits: [] });
    expect(v.reasoning.kind).toBe('insufficient-evidence');
    expect(v.reasoning.tasks.map((t) => [t.id, t.state])).toEqual([['T1', 'blocked'], ['T2', 'blocked'], ['T3', 'unknown']]);
  });

  it('keeps an unknown task unknown and a hidden task without a reference', () => {
    const v = readShadow(fixture);
    if (v.kind !== 'ok') throw new Error('expected ok');
    expect(v.reasoning.tasks[2]).toEqual({ id: 'T3', sourceRef: null, state: 'unknown', reasons: [{ code: 'task-missing', requirement: null }] });
  });

  it('keeps a hit that is not verified as not verified', () => {
    const raw = clone();
    const searches = raw['searches'] as Array<{ hits: Array<{ status: string }> }>;
    searches[0]!.hits[0]!.status = 'stale';
    const v = readShadow(raw);
    if (v.kind !== 'ok') throw new Error('expected ok');
    expect(v.searches[0]!.hits[0]!.status).toBe('stale');
  });

  it('refuses output the independent validator did not accept', () => {
    const raw = clone();
    (raw['reasoning'] as Record<string, unknown>)['validated'] = false;
    expect(readShadow(raw)).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['not an object', 42],
    ['no searches', { ...clone(), searches: 'x' }],
    ['an unknown task state', (() => { const r = clone(); ((r['reasoning'] as { tasks: Array<{ state: string }> }).tasks[0]!).state = 'healthy'; return r; })()],
    ['an unknown hit status', (() => { const r = clone(); ((r['searches'] as Array<{ hits: Array<{ status: string }> }>)[0]!.hits[0]!).status = 'ok'; return r; })()],
    ['an unknown outcome', (() => { const r = clone(); ((r['searches'] as Array<{ outcome: string }>)[0]!).outcome = 'maybe'; return r; })()],
  ])('refuses a malformed fixture: %s', (_name, raw) => {
    expect(readShadow(raw)).toEqual({ kind: 'invalid' });
  });
});

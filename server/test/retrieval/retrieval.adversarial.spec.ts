// COG-08 gate item (BACK-111), on COG-03 retrieval (BACK-106): malicious imported text. Provider titles
// are untrusted. They must only be tokenized and returned as stored: never executed, never able to
// pollute prototypes, never smuggled into an identifier match by invisible characters, and never able
// to make matching or mention extraction slow or unbounded. Synthetic data only.
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, GH, pr, REPO } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const o = (id: string) => ({ id, observedAt: at('11:55') });
const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, o(`a${n}`));

const timed = <T>(f: () => T): { value: T; ms: number } => {
  const start = performance.now();
  const value = f();
  return { value, ms: performance.now() - start };
};

describe('malicious imported text (COG-08)', () => {
  it('markup is returned as stored and only tokenized', () => {
    const p = projectionOf([titled(1, '<script>alert(1)</script> deploy')]);
    const r = search(p, 'deploy');
    expect(r.hits[0]!.title).toBe('<script>alert(1)</script> deploy');
    expect(search(p, 'script alert').outcome).toBe('match');
  });

  it('prototype-like words neither throw nor pollute', () => {
    const p = projectionOf([titled(2, '__proto__ constructor prototype hasOwnProperty')]);
    expect(search(p, '__proto__').outcome).toBe('match');
    expect(search(p, 'constructor').outcome).toBe('match');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('zero-width and bidirectional-override characters cannot fake an identifier', () => {
    const rows = [jira('BACK-7', 'Real target', 'j7'), titled(3, 'see BACK\u200B-7 and \u202EBACK-8')];
    const p = projectionOf(rows);
    // Invisible characters are stripped, so a disguised key is still answered by exact match only:
    // it finds the real item when one exists ...
    expect(search(p, 'BACK\u200B-7')).toMatchObject({ outcome: 'match', selected: { sourceRef: 'jira:BACK#issue/BACK-7' } });
    expect(search(p, '\u202EBACK-7').hits[0]!.tier).toBe('identifier');
    // ... and abstains when none does, instead of fuzzy-matching the PR whose title holds "BACK" and "8".
    expect(search(p, 'BACK\u200B-8').outcome).toBe('no-match');
    expect(search(p, 'BACK\u2060-8').outcome).toBe('no-match');
    // The zero-width key is not a mention of BACK-7; the bidi-prefixed BACK-8 is unresolved.
    const fromPr = relationships(p).edges.filter((e) => e.from.sourceId === GH && e.type === 'mentions');
    expect(fromPr).toEqual([]);
  });

  it('mention spam is de-duplicated and bounded', () => {
    const spam = Array.from({ length: 2000 }, (_, i) => `SPAM-${i % 50}`).join(' ');
    const p = projectionOf([titled(4, spam)]);
    const { value, ms } = timed(() => relationships(p));
    expect(value.unresolved).toHaveLength(50);
    expect(ms).toBeLessThan(1000);
    expect(related(p, { sourceId: GH, sourceRef: `${REPO}#pull/4`, kind: 'pull_request' }).nodes.length).toBeLessThanOrEqual(25);
  });

  it.each([
    ['many hashes', `${'#'.repeat(20_000)}1`],
    ['long key-like run', `${'A'.repeat(20_000)}-1`],
    ['alternating separators', '-#'.repeat(10_000)],
    ['long Arabic run with diacritics', 'تَسْجِيـــل'.repeat(2_000)],
  ])('pathological title (%s) is handled in linear time', (_n, title) => {
    const p = projectionOf([titled(5, title)]);
    const { ms } = timed(() => {
      relationships(p);
      search(p, 'x');
    });
    expect(ms).toBeLessThan(1000);
  });

  it('an over-long query is refused before any matching', () => {
    const p = projectionOf([titled(6, 'anything')]);
    expect(search(p, 'a '.repeat(400)).outcome).toBe('invalid-query');
  });
});

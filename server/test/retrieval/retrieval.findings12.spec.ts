// COG-08 eleventh review (independent Claude reviewer, 2026-11-27, commit 2c93de4) regressions for COG-03:
// number references with separators or trailing punctuation, and a hyphen-like separator in a key, fell
// outside the identifier shapes and reached fuzzy tiers; null arguments threw instead of refusing.
// Plain ASCII source.
import { related } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, jiraIssue, pr, REPO, GH } from '../memory/memory.fixture';
import { projectionOf } from './retrieval.fixture';

const p = projectionOf([
  pr(12, { title: 'Twelve', updatedAt: at('11:00') }, { id: 'p12', observedAt: at('11:55') }),
  pr(16, { title: 'Fix that follows #12 and pr 12', updatedAt: at('11:00') }, { id: 'p16', observedAt: at('11:55') }),
  jiraIssue('BACK-8', { summary: 'Back eight', updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: 'j8', observedAt: at('11:55') }),
]);

describe('number references are exact-only whatever the separator or trailing punctuation', () => {
  it.each(['#12.', 'PR#12', 'PR: 12', 'pr/12', 'pull 12', 'issue#4', '12!'])('%s never reaches a title or fuzzy tier', (q) => {
    const r = search(p, q);
    expect(r.hits.every((h) => h.tier === 'identifier')).toBe(true);
  });
});

describe('a hyphen-like separator in a key is folded', () => {
  it('BACK + U+2043 + 8 finds BACK-8 exactly', () => {
    const r = search(p, `BACK${String.fromCharCode(0x2043)}8`);
    expect(r.hits.every((h) => h.tier === 'identifier')).toBe(true);
  });
});

describe('null arguments are refused, not thrown', () => {
  it('search with null options', () => {
    expect(() => search(p, 'twelve', null as never)).not.toThrow();
  });
  it('related with null options', () => {
    const start = { sourceId: GH, sourceRef: `${REPO}#pull/12`, kind: 'pull_request' } as never;
    expect(() => related(p, start, null as never)).not.toThrow();
    expect(related(p, null as never).outcome).toBe('invalid-request');
  });
});

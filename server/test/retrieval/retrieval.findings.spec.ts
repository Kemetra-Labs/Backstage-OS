// COG-08 independent review (Codex, 2026-11-27, commit 96878ac) regressions for COG-03 (BACK-106):
// identifier spoofing beyond Cf (combining marks, Unicode hyphens, mixed-script lookalikes, long
// numbers) (Medium), unbounded unresolved output and quadratic link building (Medium), and the
// 32-token limit counting distinct terms (Low). Each test failed on 96878ac. Escapes only: the
// source must stay free of raw invisible characters (see retrieval.guard.spec.ts).
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, GH, pr, REPO } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const o = (id: string) => ({ id, observedAt: at('11:55') });
const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, o(`f${n}`));

describe('Codex Medium: identifier-shaped spoofs abstain', () => {
  const p = projectionOf([
    jira('BACK-1', 'Real issue', 'j1'),
    titled(1, 'BACK-8 rollout'),
    titled(2, 'B\u0410CK-9 lookalike'), // Cyrillic A in the title
    titled(3, '1234567890 release'),
  ]);

  it.each([
    ['combining grapheme joiner', 'BACK\u034F-8'],
    ['non-breaking hyphen', 'BACK\u20118'],
    ['en dash', 'BACK\u2013-8'.replace('-', '')],
    ['Cyrillic lookalike', 'B\u0410CK-9'],
    ['ten-digit hash number', '#1234567890'],
    ['ten-digit number', '1234567890'],
  ])('%s is answered by exact match only: no-match here', (_n, q) => {
    expect(search(p, q)).toMatchObject({ outcome: 'no-match', hits: [] });
  });

  it('a spoofed hyphen still finds the real key when it exists', () => {
    expect(search(p, 'BACK\u2011-1'.replace('-', ''))).toMatchObject({ outcome: 'match', selected: { sourceRef: 'jira:BACK#issue/BACK-1' } });
  });

  it('a lookalike key never resolves to the real one', () => {
    expect(search(p, 'B\u0410CK-1').outcome).toBe('no-match');
  });

  it('fullwidth forms still find the real key (positive control)', () => {
    expect(search(p, '\uFF22\uFF21\uFF23\uFF2B\uFF0D\uFF11').selected).toMatchObject({ sourceRef: 'jira:BACK#issue/BACK-1' });
  });
});

describe('Codex Low: the query token limit counts every token', () => {
  it('33 copies of one word are invalid-query', () => {
    expect(search(projectionOf([titled(4, 'timeline')]), Array(33).fill('timeline').join(' ')).outcome).toBe('invalid-query');
  });
});

describe('Codex Medium: relationship work and output are bounded', () => {
  it('traversal caps unresolved mentions and says so', () => {
    const spam = Array.from({ length: 2000 }, (_, i) => `SPAM-${i}`).join(' ');
    const p = projectionOf([titled(5, spam)]);
    const t = related(p, { sourceId: GH, sourceRef: `${REPO}#pull/5`, kind: 'pull_request' }, { maxNodes: 1 });
    expect(t.unresolved.length).toBeLessThanOrEqual(50);
    expect(t.truncated).toBe(true);
  });

  it('many #n mentions across many PRs build in near-linear time', () => {
    const n = 3000;
    const rows = Array.from({ length: n }, (_, i) => titled(i + 10, `follows #${((i + 1) % n) + 10} and #${((i + 7) % n) + 10}`));
    const p = projectionOf(rows);
    const start = performance.now();
    const rel = relationships(p);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(2 * n);
  });
});

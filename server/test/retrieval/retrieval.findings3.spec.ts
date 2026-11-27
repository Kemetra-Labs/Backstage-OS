// COG-08 third independent review (Codex, 2026-11-27, commit 000f603; the run was cut short by the
// provider's content filter after these two reproductions). A 65-digit identifier-shaped query reached
// the title tier (digit counts were capped at 64), and a key next to a combining mark was parsed as a
// mention (word boundaries excluded letters and digits but not marks). Both failed on 000f603.
import { relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, pr } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, { id: `h${n}`, observedAt: at('11:55') });

describe('identifier shapes have no digit-count ceiling within the query bound', () => {
  const long = '1'.repeat(65);
  const p = projectionOf([titled(1, `build ${long} notes`), titled(2, `BACK-${long} notes`)]);

  it.each([
    ['65-digit hash number', `#${long}`],
    ['65-digit number', long],
    ['key with a 65-digit number', `BACK-${long}`],
    ['pr with a 65-digit number', `pr ${long}`],
  ])('%s is no-match, never a title hit', (_n, q) => {
    expect(search(p, q)).toMatchObject({ outcome: 'no-match', hits: [] });
  });
});

describe('a key touching a combining mark is not a mention', () => {
  it.each([
    ['mark after the key', 'see BACK-1\u0301 here'],
    ['mark before the key', 'see \u0301BACK-1 here'],
  ])('%s', (_n, title) => {
    const rel = relationships(projectionOf([titled(3, title), jira('BACK-1', 'target', 'j1')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
    expect(rel.unresolved).toEqual([]);
  });

  it('a key between ordinary spaces still is (control)', () => {
    const rel = relationships(projectionOf([titled(4, 'see BACK-1 here'), jira('BACK-1', 'target', 'j1')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(1);
  });
});

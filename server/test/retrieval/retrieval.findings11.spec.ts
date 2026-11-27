// COG-08 tenth review (Codex, 2026-11-27, commit fecc299) regressions for COG-03: NFD in the shape fold
// expanded Hangul syllables (one code unit to three), pushing a source-ref-shaped query past the shape
// pattern's 400-unit bound so it reached title matching (failed on fecc299); and the decided behaviour for
// accent-decorated owner/repo text, pinned so it cannot drift silently. Plain ASCII source.
import { search } from '../../src/retrieval/retrieval.search';
import { at, pr } from '../memory/memory.fixture';
import { projectionOf } from './retrieval.fixture';

const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, { id: `x${n}`, observedAt: at('11:55') });
const HANGUL = String.fromCharCode(0xac01).repeat(134);

describe('a source-ref-shaped query stays exact-only after decomposition', () => {
  it('github: + 134 Hangul syllables (402 units once decomposed) is no-match, never a title hit', () => {
    const p = projectionOf([titled(1, `github ${HANGUL}`)]);
    expect(search(p, `github:${HANGUL}`)).toMatchObject({ outcome: 'no-match', hits: [] });
  });

  it('the ordinary Hangul title is still found by its words (control)', () => {
    const p = projectionOf([titled(1, `github ${HANGUL}`)]);
    expect(search(p, `github ${HANGUL}`).outcome).toBe('match');
  });
});

describe('accent-decorated owner/repo text is identifier-shaped (decided, R4)', () => {
  it('résumé/guide is answered by exact match only', () => {
    const accented = `r${String.fromCharCode(0xe9)}sum${String.fromCharCode(0xe9)}/guide`;
    const p = projectionOf([titled(2, `R${String.fromCharCode(0xe9)}sum${String.fromCharCode(0xe9)} / Guide`)]);
    expect(search(p, accented)).toMatchObject({ outcome: 'no-match', hits: [] });
    // the same words without the slash are ordinary text (control)
    expect(search(p, accented.replace('/', ' ')).outcome).toBe('match');
  });
});

// COG-08 seventh review (Codex, 2026-11-27, commit 6feac1b) regressions for COG-03: a default-ignorable
// code point that is not a format character (U+2065) counted as visible at a clip cut, so a clipped
// `#1234` linked PR 123; the same gap let it hide an identifier shape from search; U+0085 NEXT LINE
// stopped separating; and duplicate identities in a hand-built projection reported a false cut. Each
// failed on 6feac1b. Plain ASCII source: special characters come from String.fromCharCode.
import { clip } from '../../src/connectors/github/github.observer';
import type { MemoryProjection } from '../../src/memory/memory.types';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, GH, pr, REPO } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const U2065 = String.fromCharCode(0x2065);
const NEL = String.fromCharCode(0x85);
const titled = (n: number, title: string, extra: Record<string, unknown> = {}) => {
  const row = pr(n, { title, updatedAt: at('11:00') }, { id: `u${n}`, observedAt: at('11:55') });
  return { ...row, payload: { ...row.payload, ...extra } };
};
const mentionsOf = (p: MemoryProjection) => relationships(p).edges.filter((e) => e.type === 'mentions');

describe('default-ignorable code points are invisible at a clip cut', () => {
  it('a title clipped right after U+2065 does not link #123', () => {
    const stored = clip(`${'x'.repeat(294)} #123${U2065}4`);
    expect(stored.endsWith(`#123${U2065}`)).toBe(true);
    expect(mentionsOf(projectionOf([titled(1, stored, { textClipped: true }), titled(123, 'target')]))).toEqual([]);
  });
});

describe('default-ignorable code points cannot hide an identifier shape', () => {
  it('BACK<U+2065>-8 with no BACK-8 item is no-match, never a title hit', () => {
    const p = projectionOf([titled(2, 'BACK-8 rollout'), jira('BACK-1', 'real', 'j1')]);
    expect(search(p, `BACK${U2065}-8`)).toMatchObject({ outcome: 'no-match', hits: [] });
  });
});

describe('U+0085 NEXT LINE separates like a newline', () => {
  it('a mention followed by NEL in clipped text is kept', () => {
    const rel = mentionsOf(projectionOf([titled(3, `${'x'.repeat(280)} #123${NEL}more`, { textClipped: true }), titled(123, 'target')]));
    expect(rel).toHaveLength(1);
  });
});

describe('duplicate identities in a hand-built projection', () => {
  it('a duplicated self-only mention reports no cut, even with a full edge budget', () => {
    // A repository with exactly 2000 PRs fills the edge budget; PR 5 of another repository mentions
    // only itself and is duplicated (a hand-built projection; the projector never duplicates).
    const repoRow = { ...titled(0, 'x'), payload: { kind: 'repository', fullName: 'Kemetra-Labs/Backstage-OS', defaultBranch: 'main', archived: false, private: true, pushedAt: '2026-11-24T09:00:00.000Z' }, sourceRef: REPO };
    const self = { ...titled(5, 'see #5 here'), sourceRef: 'github:other/repo#pull/5' };
    const base = projectionOf([repoRow, ...Array.from({ length: 2000 }, (_, i) => titled(i + 1, `item ${i + 1}`)), self]);
    const dupItem = base.items.find((i) => i.sourceRef === 'github:other/repo#pull/5')!;
    const dup: MemoryProjection = { ...base, items: [...base.items, dupItem] };
    expect(relationships(base).truncated).toBe(false); // exactly at the budget: nothing cut
    expect(relationships(dup).truncated).toBe(false);
    expect(related(dup, { sourceId: GH, sourceRef: 'github:other/repo#pull/5', kind: 'pull_request' }).truncated).toBe(false);
  });
});

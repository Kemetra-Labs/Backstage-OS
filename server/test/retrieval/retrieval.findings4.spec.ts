// COG-08 third review, complete rerun (Codex, 2026-11-27, commit 5375068) regressions for COG-03:
// a mark next to whitespace hid an identifier shape; misses from unrelated titles consumed a traversal's
// unresolved allowance; `#n` parsing disagreed with the observer's positive safe-integer range; and a
// zero-width joiner acted as a word boundary. Each failed on 5375068. Escapes only in this source.
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { search } from '../../src/retrieval/retrieval.search';
import { at, GH, pr, REPO } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const titled = (n: number, title: string) => pr(n, { title, updatedAt: at('11:00') }, { id: `k${n}`, observedAt: at('11:55') });
const PR = (n: number) => ({ sourceId: GH, sourceRef: `${REPO}#pull/${n}`, kind: 'pull_request' });

describe('a mark beside whitespace cannot hide an identifier shape', () => {
  const p = projectionOf([titled(1, 'PR 99 rollout and #99 notes')]);
  it.each([
    ['mark between words', 'PR \u034F 99'],
    ['mark before a hash number', '\u0301 #99'],
    ['mark after a hash number', '#99 \u0301'],
  ])('%s is no-match', (_n, q) => {
    expect(search(p, q)).toMatchObject({ outcome: 'no-match', hits: [] });
  });
});

describe('a traversal\'s unresolved allowance belongs to the nodes it visits', () => {
  const spam = Array.from({ length: 51 }, (_, i) => `AA-${i + 1}`).join(' ');
  const p = projectionOf([titled(8, spam), titled(9, 'Prepare BACK-404'), titled(10, 'no mentions here')]);

  it('a visited node keeps its own unresolved mention', () => {
    const t = related(p, PR(9), { depth: 1 });
    expect(t.unresolved.map((u) => u.text)).toEqual(['BACK-404']);
  });

  it('an isolated node with no mentions is not truncated by others', () => {
    // No repository record in this projection, so PR 10 has no edges at all.
    expect(related(p, PR(10), { depth: 1 })).toMatchObject({ nodes: [{ depth: 0 }], unresolved: [], truncated: false });
  });

  it('relationships() still bounds the whole graph and says so', () => {
    const rel = relationships(p);
    expect(rel.unresolved.length).toBeLessThanOrEqual(50);
    expect(rel.truncated).toBe(true);
  });
});

describe('#n mentions follow the observer: positive safe integers', () => {
  it('a 16-digit number that is a visible PR resolves', () => {
    const big = 1000000000000000;
    const rel = relationships(projectionOf([titled(2, `See #${big}`), titled(big, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions').map((e) => e.text)).toEqual([`#${big}`]);
  });

  it('#0 and a number beyond the safe range are not mentions at all', () => {
    const rel = relationships(projectionOf([titled(3, 'See #0 and #90071992547409920')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
    expect(rel.unresolved).toEqual([]);
  });
});

describe('format characters do not make a word boundary', () => {
  it.each([
    ['joiner before the key', 'x\u200DBACK-7 note'],
    ['joiner after the key', 'BACK-7\u200Dx note'],
    ['word joiner before a hash number', 'x\u2060#11 note'],
  ])('%s is not a mention', (_n, title) => {
    const rel = relationships(projectionOf([titled(4, title), jira('BACK-7', 'target', 'j7'), titled(11, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions' && e.from.sourceRef === PR(4).sourceRef)).toEqual([]);
    expect(rel.unresolved.filter((u) => u.from.sourceRef === PR(4).sourceRef)).toEqual([]);
  });

  it('a key between spaces is still a mention (control)', () => {
    const rel = relationships(projectionOf([titled(5, 'see BACK-7 note'), jira('BACK-7', 'target', 'j7')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(1);
  });
});

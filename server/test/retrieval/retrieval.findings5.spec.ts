// COG-08 fourth review (Codex, 2026-11-27, commit 827a210) regressions for COG-03: unresolved mentions
// lost once the edge budget filled; the per-title cap keeping the first 50 by text position instead of
// the first 50 by canonical order; and a mention read across a clipped title's cut. Failed on 827a210.
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { at, JIRA, pr, repo } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const titled = (n: number, title: string, extra: Record<string, unknown> = {}) => {
  const row = pr(n, { title, updatedAt: at('11:00') }, { id: `m${n}`, observedAt: at('11:55') });
  return { ...row, payload: { ...row.payload, ...extra } };
};

describe('unresolved mentions survive a full edge budget', () => {
  const rows = [repo({}, { id: 'r', observedAt: at('11:55') }), ...Array.from({ length: 2001 }, (_, i) => titled(i + 1, `item ${i + 1}`)), jira('ISO-1', 'See MISS-1', 'iso')];
  const p = projectionOf(rows);
  const JI = { sourceId: JIRA, sourceRef: 'jira:ISO#issue/ISO-1', kind: 'jira_issue' };

  it('relationships() keeps the unresolved mention and reports the edge cut', () => {
    const rel = relationships(p);
    expect(rel.unresolved.map((u) => u.text)).toContain('MISS-1');
    expect(rel.truncated).toBe(true);
  });

  it('a traversal untouched by the cut edges is complete', () => {
    expect(related(p, JI, { depth: 1 })).toMatchObject({ nodes: [{ depth: 0 }], unresolved: [{ text: 'MISS-1' }], truncated: false });
  });
});

describe('the per-title cap keeps the canonical first 50, whatever the word order', () => {
  const keys = Array.from({ length: 50 }, (_, i) => `ZZ-${i + 1}`);
  const forward = projectionOf([titled(1, [...keys, 'AA-1'].join(' '))]);
  const backward = projectionOf([titled(1, ['AA-1', ...keys].join(' '))]);

  it('AA-1 is kept in both orders, and both orders give the same set', () => {
    for (const p of [forward, backward]) {
      expect(relationships(p).unresolved.map((u) => u.text)).toContain('AA-1');
      expect(relationships(p).truncated).toBe(true);
    }
    expect(relationships(forward).unresolved).toEqual(relationships(backward).unresolved);
  });
});

describe('a clipped title yields no mention across its cut', () => {
  const head = 'x'.repeat(295);

  it('a mention touching the end of a clipped title is dropped', () => {
    const rel = relationships(projectionOf([titled(1, `${head} #123`, { textClipped: true }), titled(123, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
    expect(rel.unresolved).toEqual([]);
  });

  it('the same text without the clip flag is a mention (control)', () => {
    const rel = relationships(projectionOf([titled(1, `${head} #123`), titled(123, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(1);
  });

  it('a mention well before the cut still counts', () => {
    const rel = relationships(projectionOf([titled(1, `see #123 ${head}`, { textClipped: true }), titled(123, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(1);
  });
});

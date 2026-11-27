// COG-08 sixth review (Codex, 2026-11-27, commit f005f59) regressions for COG-03: after the edge budget
// filled, every mention still filtered and mapped its whole target bucket (mentions x targets work); a
// partly cut bucket flagged traversals that touch no cut edge; and a control character at a clip cut
// counted as a visible separator. Each failed on f005f59. Plain ASCII source: control characters are
// built with String.fromCharCode.
import { project } from '../../src/memory/memory.projector';
import type { MemorySource } from '../../src/memory/memory.types';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { at, GH, JIRA, pr, REPO, request, sources } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const titled = (n: number, title: string, extra: Record<string, unknown> = {}) => {
  const row = pr(n, { title, updatedAt: at('11:00') }, { id: `s${n}`, observedAt: at('11:55') });
  return { ...row, payload: { ...row.payload, ...extra } };
};

describe('work past the edge budget is linear in mentions plus targets', () => {
  const world = (n: number) => {
    const many: MemorySource[] = Array.from({ length: n }, (_, i) => ({ sourceId: `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`, provider: 'jira', purgeHorizon: null }));
    const rows = [...many.map((s, i) => ({ ...jira('AA-1', 'target', `t${i}`), sourceId: s.sourceId })), ...Array.from({ length: n }, (_, i) => titled(i + 1, 'see AA-1 here'))];
    return project(rows, request({ sources: [...sources(), ...many] }));
  };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const timed = (n: number) => {
    const p = world(n);
    return median(
      [0, 1, 2].map(() => {
        const start = performance.now();
        relationships(p);
        return performance.now() - start;
      }),
    );
  };

  it('four times the mentions and targets costs well under sixteen times as much', () => {
    timed(200); // warm-up
    const small = timed(1000);
    const large = timed(4000);
    // Measured on the fix: about 3x. The per-mention bucket scan it replaced: about 7x (mentions x targets).
    expect(large / Math.max(small, 1)).toBeLessThan(5);
  });
});

describe('a partly cut bucket flags only traversals that reach the cut', () => {
  // Edge order: 1998 contains edges (repository and 1998 PRs), then mentions by document order:
  // A (Jira AA-1) mentions XX-1 (the 1999th edge, A to X); then M, in a GitHub source sorted after Jira,
  // mentions AA-1 held by A and B: M to A is the 2000th edge, M to B is cut. The cut edge's endpoints
  // are M and B only. A walk from X that reaches A (but neither M nor B) is complete.
  const LATE_GH = '00000000-0000-4000-8000-0000000000f9';
  const SECOND = '00000000-0000-4000-b000-000000000001';
  const repoRow = { ...titled(0, 'x'), payload: { kind: 'repository', fullName: 'Kemetra-Labs/Backstage-OS', defaultBranch: 'main', archived: false, private: true, pushedAt: '2026-11-24T09:00:00.000Z' }, sourceRef: REPO };
  const rows = [
    repoRow,
    ...Array.from({ length: 1998 }, (_, i) => titled(i + 1, `item ${i + 1}`)),
    jira('AA-1', 'see XX-1', 'ta'),
    jira('XX-1', 'the neighbour', 'tx'),
    { ...jira('AA-1', 'second target', 'tb'), sourceId: SECOND },
    { ...titled(77, 'see AA-1 here'), sourceId: LATE_GH, sourceRef: 'github:late/repo#pull/77' },
  ];
  const p = project(rows, request({ sources: [...sources(), { sourceId: SECOND, provider: 'jira', purgeHorizon: null }, { sourceId: LATE_GH, provider: 'github', purgeHorizon: null }] }));
  const X = { sourceId: JIRA, sourceRef: 'jira:XX#issue/XX-1', kind: 'jira_issue' };
  const M = { sourceId: LATE_GH, sourceRef: 'github:late/repo#pull/77', kind: 'pull_request' };

  it('the scenario holds: the budget is full and one edge of the bucket is kept', () => {
    const rel = relationships(p);
    expect(rel.truncated).toBe(true);
    expect(rel.edges.filter((e) => e.type === 'mentions').map((e) => [e.from.sourceRef, e.to.sourceRef])).toEqual([
      ['jira:AA#issue/AA-1', 'jira:XX#issue/XX-1'],
      ['github:late/repo#pull/77', 'jira:AA#issue/AA-1'],
    ]);
  });

  it('a walk from X that reaches the kept target A, not M or B, is complete', () => {
    expect(related(p, X, { depth: 1 })).toMatchObject({ outcome: 'found', truncated: false });
  });

  it('a walk that reaches M, an endpoint of the cut edge, is flagged', () => {
    expect(related(p, M, { depth: 1 }).truncated).toBe(true);
  });
});

describe('a control character at a clip cut is not a separator', () => {
  it('#123 followed only by a control character up to the cut is dropped', () => {
    const SOH = String.fromCharCode(1);
    const rel = relationships(projectionOf([titled(1, `${'x'.repeat(294)} #123${SOH}`, { textClipped: true }), titled(123, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
  });

  it('a newline after the mention is still a separator (control)', () => {
    const rel = relationships(projectionOf([titled(1, `${'x'.repeat(290)} #123\nmore`, { textClipped: true }), titled(123, 'target')]));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toHaveLength(1);
  });
});

void GH;

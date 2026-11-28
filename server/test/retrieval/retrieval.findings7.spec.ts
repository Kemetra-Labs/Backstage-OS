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
  // Counted, not timed: wall-clock ratios failed CI under parallel load (2026-11-28). The counter sees every
  // array element a built-in method or a for-of loop visits, and every Set insertion and lookup and Map
  // lookup and write, during relationships(); the edge budget's cut loop inserts into a Set. The bucket
  // rescan this replaced (f005f59) filtered and mapped the whole target bucket once per mention, so its count
  // grew with mentions times targets. Blind spot: plain indexed loops that touch no Set or Map are not seen.
  const METHODS = ['filter', 'map', 'flatMap', 'forEach', 'some', 'every', 'find', 'findIndex', 'includes', 'indexOf', 'reduce'] as const;
  const counted = (run: () => void): number => {
    let visits = 0;
    const proto = Array.prototype as unknown as Record<string | symbol, (...a: unknown[]) => unknown>;
    const saved = new Map<string | symbol, (...a: unknown[]) => unknown>([...METHODS, Symbol.iterator].map((m) => [m, proto[m]!]));
    const add = Set.prototype.add;
    const has = Set.prototype.has;
    const get = Map.prototype.get;
    const set = Map.prototype.set;
    try {
      for (const m of METHODS) {
        const original = saved.get(m)!;
        proto[m] = function (this: unknown[], ...a: unknown[]) {
          visits += this.length;
          return original.apply(this, a);
        };
      }
      const iterate = saved.get(Symbol.iterator)!;
      proto[Symbol.iterator] = function (this: unknown[]) {
        const it = iterate.call(this) as Iterator<unknown>;
        return { next: () => (visits++, it.next()), [Symbol.iterator]() { return this; } };
      };
      Set.prototype.add = function (this: Set<unknown>, v: unknown) {
        visits++;
        return add.call(this, v);
      };
      Set.prototype.has = function (this: Set<unknown>, v: unknown) {
        visits++;
        return has.call(this, v);
      };
      Map.prototype.get = function (this: Map<unknown, unknown>, k: unknown) {
        visits++;
        return get.call(this, k);
      };
      Map.prototype.set = function (this: Map<unknown, unknown>, k: unknown, v: unknown) {
        visits++;
        return set.call(this, k, v);
      };
      run();
    } finally {
      for (const [m, f] of saved) proto[m] = f;
      Set.prototype.add = add;
      Set.prototype.has = has;
      Map.prototype.get = get;
      Map.prototype.set = set;
    }
    return visits;
  };
  const work = (n: number) => {
    const p = world(n);
    return counted(() => relationships(p));
  };

  it('four times the mentions and targets costs well under sixteen times as much work', () => {
    const small = work(1000);
    const large = work(4000);
    // Linear work gives about 4x; the per-mention bucket rescan gave about 16x.
    expect(small).toBeGreaterThan(0);
    expect(large / small).toBeLessThan(8);
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

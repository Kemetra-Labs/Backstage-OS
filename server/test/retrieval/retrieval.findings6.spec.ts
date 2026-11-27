// COG-08 fifth review (Codex, 2026-11-27, commit 43ab9f0) regressions for COG-03: a format character
// just before a clip cut hid the cut; titles stored before the clip flag existed (no `textClipped`) still
// produced a mention across the cut; and after the edge budget filled, candidate pairs were still visited
// one by one. Each failed on 43ab9f0. Invisible characters are built with String.fromCharCode, so this
// source stays plain ASCII.
import { project } from '../../src/memory/memory.projector';
import type { MemorySource } from '../../src/memory/memory.types';
import { related, relationships } from '../../src/retrieval/retrieval.relations';
import { at, GH, pr, REPO, request, sources } from '../memory/memory.fixture';
import { jira, projectionOf } from './retrieval.fixture';

const ZWJ = String.fromCharCode(0x200d);
const titled = (n: number, title: string, extra: Record<string, unknown> = {}) => {
  const row = pr(n, { title, updatedAt: at('11:00') }, { id: `q${n}`, observedAt: at('11:55') });
  return { ...row, payload: { ...row.payload, ...extra } };
};
const mentions = (rows: ReturnType<typeof titled>[]) => relationships(projectionOf(rows)).edges.filter((e) => e.type === 'mentions');

describe('a clip cut cannot be hidden behind a format character', () => {
  it('a mention followed only by format characters up to the cut is dropped', () => {
    const title = `${'x'.repeat(294)} #123${ZWJ}`;
    expect(mentions([titled(1, title, { textClipped: true }), titled(123, 'target')])).toEqual([]);
  });
});

describe('titles stored before the clip flag existed', () => {
  const atLimit = `${'x'.repeat(295)} #123`; // 300 code points, the observer's limit

  it('a legacy title at the limit (no flag) is treated as possibly clipped', () => {
    expect(mentions([titled(1, atLimit), titled(123, 'target')])).toEqual([]);
  });

  it('an explicit textClipped: false keeps the terminal mention (control)', () => {
    expect(mentions([titled(1, atLimit, { textClipped: false }), titled(123, 'target')])).toHaveLength(1);
  });

  it('a short legacy title keeps its terminal mention (control)', () => {
    expect(mentions([titled(1, 'see #123'), titled(123, 'target')])).toHaveLength(1);
  });
});

describe('fan-out past the edge budget is recorded per target bucket', () => {
  it('2000 mentions of a key held by 2000 items: bounded work, every origin flagged', () => {
    const many: MemorySource[] = Array.from({ length: 2000 }, (_, i) => ({ sourceId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`, provider: 'jira', purgeHorizon: null }));
    const rows = [
      ...many.map((s, i) => ({ ...jira('AA-1', 'target', `t${i}`), sourceId: s.sourceId })),
      ...Array.from({ length: 2000 }, (_, i) => titled(i + 1, 'see AA-1 here')),
    ];
    const p = project(rows, request({ sources: [...sources(), ...many] }));
    const start = performance.now();
    const rel = relationships(p);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(rel.edges.length).toBe(2000);
    expect(rel.truncated).toBe(true);
    // the last PR's mention was cut: its own traversal says so
    expect(related(p, { sourceId: GH, sourceRef: `${REPO}#pull/2000`, kind: 'pull_request' }, { depth: 1 }).truncated).toBe(true);
  });
});

// BACK-108 (COG-05) pure learning machinery, per cog-05-decisions.md D1-D6. Synthetic episodes only:
// they test the machinery and can never justify a real lesson (D6). No schema, no activation.
import { approve, MIN_EPISODES, readLesson, rollback } from '../../src/learning/learning.core';
import { basisOf, cands, ep, failures, grant, OWNER, rowsOrThrow, visibleAll } from './learning.fixture';

describe('candidate generation (O2, D3)', () => {
  it('abstains below N verified episodes', () => {
    expect(cands(failures(MIN_EPISODES - 1))).toEqual([]);
  });

  it('proposes one candidate at N episodes sharing a key and outcome', () => {
    const eps = failures(MIN_EPISODES);
    const [c, ...rest] = cands(eps);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ applicabilityKey: 'jira_issue|reasoning-v3', outcome: 'failure', contested: false });
    expect(c!.episodeIds).toEqual(eps.map((e) => e.id).sort());
  });

  it('marks a candidate contested when its episodes disagree', () => {
    expect(cands([...failures(MIN_EPISODES), ep(99, 'success')])[0]).toMatchObject({ contested: true });
  });

  it('ignores an episode whose cited evidence is not all visible, so it cannot reach N', () => {
    const eps = failures(MIN_EPISODES);
    const visible = visibleAll(eps);
    visible.delete('o0');
    expect(cands(eps, visible)).toEqual([]);
  });

  it('counts only observation-labelled episodes', () => {
    expect(cands(failures(MIN_EPISODES).map((e, i) => (i === 0 ? { ...e, label: 'hypothesis' as const } : e)))).toEqual([]);
  });

  it('counts a duplicated episode id once', () => {
    expect(cands([...failures(MIN_EPISODES - 1), ep(0, 'failure')])).toEqual([]);
  });

  it('is deterministic regardless of input order', () => {
    const eps = failures(MIN_EPISODES + 2);
    expect(cands([...eps].reverse(), visibleAll(eps))).toEqual(cands(eps));
  });
});

describe('approval (O3, O5, D2)', () => {
  const eps = failures(MIN_EPISODES);
  const cand = cands(eps)[0]!;

  it('only the workspace owner can approve', () => {
    expect(approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z', 'agent'), basisOf(eps))).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('a contested candidate cannot be approved', () => {
    const all = [...eps, ep(99, 'success')];
    expect(approve([], cands(all)[0]!, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'), basisOf(all))).toEqual({ ok: false, reason: 'contested' });
  });

  it('an approval needs an expiry after its approval time', () => {
    expect(approve([], cand, grant('2026-11-27T12:00:00Z', '2026-11-27T12:00:00Z'), basisOf(eps))).toEqual({ ok: false, reason: 'bad-expiry' });
  });

  it('approval appends a new version row citing the previous one, never changing earlier rows', () => {
    const r1 = rowsOrThrow(approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'), basisOf(eps)));
    const r2 = rowsOrThrow(approve(r1, cand, grant('2027-02-01T00:00:00Z', '2026-11-28T12:00:00Z'), basisOf(eps)));
    expect(r2.map((r) => r.version)).toEqual([1, 2]);
    expect(r2[0]!.previous).toBeNull();
    expect(r2[1]!.previous).toBe(r2[0]!.hash);
    expect(r2[0]).toEqual(r1[0]);
    expect(r2[1]!.content.approvedAt).toBe('2026-11-28T12:00:00Z');
  });
});

describe('reading a lesson (O4, O6)', () => {
  const eps = failures(MIN_EPISODES);
  const rows = rowsOrThrow(approve([], cands(eps)[0]!, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'), basisOf(eps)));

  it('an approved, unexpired lesson with all evidence visible is an advisory note', () => {
    expect(readLesson(rows, visibleAll(eps), '2026-12-01T00:00:00Z')).toMatchObject({ state: 'approved', version: 1, effect: 'advisory-note' });
  });

  it('is suspended when any cited evidence is hidden or revoked', () => {
    const v = visibleAll(eps);
    v.delete('d3');
    expect(readLesson(rows, v, '2026-12-01T00:00:00Z')).toEqual({ state: 'suspended' });
  });

  it('is expired at and after its expiry', () => {
    expect(readLesson(rows, visibleAll(eps), '2027-01-01T00:00:00Z')).toEqual({ state: 'expired' });
  });

  it('carries no state, gate, recommendation or rule change', () => {
    const read = readLesson(rows, visibleAll(eps), '2026-12-01T00:00:00Z');
    expect(Object.keys(read).sort()).toEqual(['applicabilityKey', 'effect', 'episodeIds', 'outcome', 'state', 'version']);
  });

  it('with no rows there is no lesson', () => {
    expect(readLesson([], new Set(), '2026-12-01T00:00:00Z')).toEqual({ state: 'none' });
  });

  it('a tampered chain is refused', () => {
    const forged = rows.map((r) => ({ ...r, content: { ...r.content, outcome: 'success' as const } }));
    expect(readLesson(forged, visibleAll(eps), '2026-12-01T00:00:00Z')).toEqual({ state: 'invalid-chain' });
  });
});

describe('rollback (O3)', () => {
  const eps = failures(MIN_EPISODES);
  const cand = cands(eps)[0]!;
  const rows1 = rowsOrThrow(approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'), basisOf(eps)));
  const rows2 = rowsOrThrow(approve(rows1, cand, grant('2027-05-01T00:00:00Z', '2026-11-28T12:00:00Z'), basisOf(eps)));

  it('restores the earlier version byte for byte, as a new appended row', () => {
    const rows3 = rowsOrThrow(rollback(rows2, { reviewer: OWNER, owner: OWNER, toVersion: 1 }));
    expect(rows3).toHaveLength(3);
    expect(rows3.slice(0, 2)).toEqual(rows2);
    expect(rows3[2]!.kind).toBe('rolled-back');
    expect(JSON.stringify(rows3[2]!.content)).toBe(JSON.stringify(rows2[0]!.content));
    expect(readLesson(rows3, visibleAll(eps), '2026-12-01T00:00:00Z')).toMatchObject({ state: 'approved', version: 3 });
  });

  it('only the owner can roll back, and only to an existing version', () => {
    expect(rollback(rows2, { reviewer: 'x', owner: OWNER, toVersion: 1 })).toEqual({ ok: false, reason: 'not-owner' });
    expect(rollback(rows2, { reviewer: OWNER, owner: OWNER, toVersion: 9 })).toEqual({ ok: false, reason: 'no-such-version' });
  });
});

// BACK-108 (COG-05) pure learning machinery, per cog-05-decisions.md D1-D6. Synthetic episodes only:
// they test the machinery and can never justify a real lesson (D6). No schema, no activation.
import { approve, candidatesOf, MIN_EPISODES, readLesson, rollback, type Episode, type LessonRow } from '../../src/learning/learning.core';

const ep = (n: number, outcome: Episode['outcome'], key = 'jira_issue|reasoning-v3', extra: Partial<Episode> = {}): Episode => ({
  id: `e${n}`,
  applicabilityKey: key,
  outcome,
  label: 'observation',
  decisionEvidence: [`d${n}`],
  outcomeEvidence: [`o${n}`],
  ...extra,
});
const visibleAll = (eps: readonly Episode[]) => new Set(eps.flatMap((e) => [...e.decisionEvidence, ...e.outcomeEvidence]));
const failures = (n: number) => Array.from({ length: n }, (_, i) => ep(i, 'failure'));
const OWNER = 'owner-1';
const grant = (expiresAt: string, at: string, reviewer = OWNER) => ({ reviewer, owner: OWNER, expiresAt, at });

describe('candidate generation (O2, D3)', () => {
  it('abstains below N verified episodes', () => {
    const eps = failures(MIN_EPISODES - 1);
    expect(candidatesOf(eps, visibleAll(eps))).toEqual([]);
  });

  it('proposes one candidate at N episodes sharing a key and outcome', () => {
    const eps = failures(MIN_EPISODES);
    const [c, ...rest] = candidatesOf(eps, visibleAll(eps));
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ applicabilityKey: 'jira_issue|reasoning-v3', outcome: 'failure', contested: false });
    expect(c!.episodeIds).toEqual(eps.map((e) => e.id).sort());
  });

  it('marks a candidate contested when its episodes disagree', () => {
    const eps = [...failures(MIN_EPISODES), ep(99, 'success')];
    expect(candidatesOf(eps, visibleAll(eps))[0]).toMatchObject({ contested: true });
  });

  it('ignores an episode whose cited evidence is not all visible, so it cannot reach N', () => {
    const eps = failures(MIN_EPISODES);
    const visible = visibleAll(eps);
    visible.delete('o0');
    expect(candidatesOf(eps, visible)).toEqual([]);
  });

  it('counts only observation-labelled episodes', () => {
    const eps = failures(MIN_EPISODES).map((e, i) => (i === 0 ? { ...e, label: 'hypothesis' as const } : e));
    expect(candidatesOf(eps, visibleAll(eps))).toEqual([]);
  });

  it('counts a duplicated episode id once', () => {
    const eps = [...failures(MIN_EPISODES - 1), ep(0, 'failure')];
    expect(candidatesOf(eps, visibleAll(eps))).toEqual([]);
  });

  it('is deterministic regardless of input order', () => {
    const eps = failures(MIN_EPISODES + 2);
    expect(candidatesOf([...eps].reverse(), visibleAll(eps))).toEqual(candidatesOf(eps, visibleAll(eps)));
  });
});

describe('approval (O3, O5, D2)', () => {
  const eps = failures(MIN_EPISODES);
  const cand = candidatesOf(eps, visibleAll(eps))[0]!;

  it('only the workspace owner can approve', () => {
    expect(approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z', 'agent'))).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('a contested candidate cannot be approved', () => {
    const all = [...eps, ep(99, 'success')];
    const contested = candidatesOf(all, visibleAll(all))[0]!;
    expect(approve([], contested, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'))).toEqual({ ok: false, reason: 'contested' });
  });

  it('an approval needs an expiry after its approval time', () => {
    expect(approve([], cand, grant('2026-11-27T12:00:00Z', '2026-11-27T12:00:00Z'))).toEqual({ ok: false, reason: 'bad-expiry' });
  });

  it('approval appends a new version row citing the previous one, never changing earlier rows', () => {
    const r1 = approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'));
    if (!r1.ok) throw new Error('expected ok');
    const r2 = approve(r1.rows, cand, grant('2027-02-01T00:00:00Z', '2026-11-28T12:00:00Z'));
    if (!r2.ok) throw new Error('expected ok');
    expect(r2.rows.map((r) => r.version)).toEqual([1, 2]);
    expect(r2.rows[0]!.previous).toBeNull();
    expect(r2.rows[1]!.previous).toBe(r2.rows[0]!.hash);
    expect(r2.rows[0]).toEqual(r1.rows[0]);
  });
});

describe('reading a lesson (O4, O6)', () => {
  const eps = failures(MIN_EPISODES);
  const cand = candidatesOf(eps, visibleAll(eps))[0]!;
  const ok = approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'));
  const rows = ok.ok ? ok.rows : [];

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
    const forged: LessonRow[] = rows.map((r) => ({ ...r, content: { ...r.content, outcome: 'success' as const } }));
    expect(readLesson(forged, visibleAll(eps), '2026-12-01T00:00:00Z')).toEqual({ state: 'invalid-chain' });
  });
});

describe('rollback (O3)', () => {
  const eps = failures(MIN_EPISODES);
  const cand = candidatesOf(eps, visibleAll(eps))[0]!;
  const a = approve([], cand, grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z'));
  const rows1 = a.ok ? a.rows : [];
  const b = approve(rows1, cand, grant('2027-06-01T00:00:00Z', '2026-11-28T12:00:00Z'));
  const rows2: LessonRow[] = b.ok ? b.rows : [];

  it('restores the earlier version byte for byte, as a new appended row', () => {
    const r = rollback(rows2, { reviewer: OWNER, owner: OWNER, toVersion: 1, at: '2026-11-29T12:00:00Z' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.rows).toHaveLength(3);
    expect(r.rows.slice(0, 2)).toEqual(rows2);
    expect(JSON.stringify(r.rows[2]!.content)).toBe(JSON.stringify(rows2[0]!.content));
    expect(readLesson(r.rows, visibleAll(eps), '2026-12-01T00:00:00Z')).toMatchObject({ state: 'approved', version: 3 });
  });

  it('only the owner can roll back, and only to an existing version', () => {
    expect(rollback(rows2, { reviewer: 'x', owner: OWNER, toVersion: 1, at: '2026-11-29T12:00:00Z' })).toEqual({ ok: false, reason: 'not-owner' });
    expect(rollback(rows2, { reviewer: OWNER, owner: OWNER, toVersion: 9, at: '2026-11-29T12:00:00Z' })).toEqual({ ok: false, reason: 'no-such-version' });
  });
});

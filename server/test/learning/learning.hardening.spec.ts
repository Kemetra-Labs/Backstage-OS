// BACK-108 (COG-05) read and write path requirements (cog-05-decisions.md, "Requirements for the read
// and write path"), enforced in the pure core before any activation (D6 still blocks activation):
// decision citations are HumanDecisions; approve accepts only the candidate the episodes still yield;
// a lesson with no citation is never shown; the chain is verified in src over exactly the stored
// columns, so a chain read back from the database can be re-verified.
import { approve, candidatesOf, fromStored, MIN_EPISODES, readLesson, type LessonRow, type StoredLesson } from '../../src/learning/learning.core';
import { basisOf, cands, decisionsOf, ep, failures, grant, KEY, OWNER, rowsOrThrow, seal, visibleAll } from './learning.fixture';

const NOW = '2026-12-01T00:00:00Z';
const eps = failures(MIN_EPISODES);
const cand = cands(eps)[0]!;
const approveAt = (rows: readonly LessonRow[], at: string) => rowsOrThrow(approve(rows, cand, grant('2027-01-01T00:00:00Z', at), basisOf(eps)));
const chain = approveAt(approveAt([], '2026-11-27T12:00:00Z'), '2026-11-28T12:00:00Z');
const stored = (r: LessonRow): StoredLesson => ({
  version: r.version,
  previous_hash: r.previous,
  kind: r.kind,
  reviewer_user_id: r.reviewer,
  applicability_key: r.content.applicabilityKey,
  content: JSON.parse(JSON.stringify(r.content)) as unknown,
  hash: r.hash,
});

describe('a decision citation must be a HumanDecision', () => {
  it('an episode whose decision citation is not a visible HumanDecision does not count', () => {
    const decisions = decisionsOf(eps);
    decisions.delete('d0');
    expect(candidatesOf(eps, visibleAll(eps), decisions)).toEqual([]);
  });

  it('an outcome citation does not stand in for a decision', () => {
    const swapped = eps.map((e, i) => (i === 0 ? { ...e, decisionEvidence: e.outcomeEvidence } : e));
    expect(candidatesOf(swapped, visibleAll(swapped), decisionsOf(eps))).toEqual([]);
  });
});

describe('approve accepts only the candidate the episodes still yield', () => {
  const at = grant('2027-01-01T00:00:00Z', '2026-11-27T12:00:00Z');

  it.each([
    ['no citations', { ...cand, evidenceIds: [] }],
    ['no episodes', { ...cand, episodeIds: [] }],
    ['an invented episode', { ...cand, episodeIds: [...cand.episodeIds, 'e-forged'] }],
    ['a flipped outcome', { ...cand, outcome: 'success' as const }],
  ])('refuses a hand-made candidate with %s', (_name, forged) => {
    expect(approve([], forged, at, basisOf(eps))).toEqual({ ok: false, reason: 'not-a-candidate' });
  });

  it('refuses a contested candidate relabelled as uncontested', () => {
    const all = [...eps, ep(99, 'success')];
    expect(approve([], { ...cands(all)[0]!, contested: false }, at, basisOf(all))).toEqual({ ok: false, reason: 'not-a-candidate' });
  });

  it('refuses a candidate whose evidence was hidden since it was shown', () => {
    const visible = visibleAll(eps);
    visible.delete('o2');
    expect(approve([], cand, at, basisOf(eps, visible))).toEqual({ ok: false, reason: 'not-a-candidate' });
  });

  it('refuses to append to another lesson chain', () => {
    const other = failures(MIN_EPISODES).map((e) => ({ ...e, applicabilityKey: 'other|reasoning-v3' }));
    const otherRows = rowsOrThrow(approve([], cands(other)[0]!, at, basisOf(other)));
    expect(approve(otherRows, cand, at, basisOf(eps))).toEqual({ ok: false, reason: 'other-lesson' });
  });
});

describe('a lesson with no citation is never shown', () => {
  const base = chain[0]!;
  it.each([
    ['no evidence', { ...base.content, evidenceIds: [] }],
    ['no episodes', { ...base.content, episodeIds: [] }],
  ])('a validly sealed lesson with %s reads as uncited', (_name, content) => {
    const rows = [seal({ version: 1, previous: null, kind: 'approved', reviewer: OWNER, content })];
    expect(readLesson(rows, visibleAll(eps), NOW)).toEqual({ state: 'uncited' });
  });
});

describe('the chain is verified in src', () => {
  const visible = visibleAll(eps);
  const read = (rows: readonly LessonRow[]) => readLesson(rows, visible, NOW).state;

  it('the hash covers exactly the stored columns', () => {
    expect(chain.map((r) => seal({ version: r.version, previous: r.previous, kind: r.kind, reviewer: r.reviewer, content: r.content }).hash)).toEqual(chain.map((r) => r.hash));
  });

  it('a gap, reordered rows or a broken previous hash is refused', () => {
    expect(read([chain[0]!, seal({ ...chain[1]!, version: 3 })])).toBe('invalid-chain');
    expect(read([chain[1]!, chain[0]!])).toBe('invalid-chain');
    expect(read([chain[0]!, seal({ ...chain[1]!, previous: 'f'.repeat(64) })])).toBe('invalid-chain');
  });

  it.each([
    ['kind', { kind: 'rolled-back' as const }],
    ['reviewer', { reviewer: 'someone-else' }],
  ])('a changed %s without a new hash is refused', (_name, change) => {
    expect(read([chain[0]!, { ...chain[1]!, ...change }])).toBe('invalid-chain');
  });

  it('a changed approval time without a new hash is refused', () => {
    expect(read([chain[0]!, { ...chain[1]!, content: { ...chain[1]!.content, approvedAt: '2026-11-29T00:00:00Z' } }])).toBe('invalid-chain');
  });

  it('a chain cannot switch lesson key between versions', () => {
    const switched = seal({ version: 2, previous: chain[0]!.hash, kind: 'approved', reviewer: OWNER, content: { ...chain[1]!.content, applicabilityKey: 'other|reasoning-v3' } });
    expect(read([chain[0]!, switched])).toBe('invalid-chain');
  });
});

describe('fromStored maps database rows and keeps them verifiable', () => {
  it('a stored chain in any order reads back as the same verified lesson', () => {
    const rows = fromStored([...chain].reverse().map(stored));
    expect(rows).toEqual(chain);
    expect(readLesson(rows!, visibleAll(eps), NOW)).toMatchObject({ state: 'approved', version: 2, applicabilityKey: KEY });
  });

  it.each([
    ['an unknown content key', (s: StoredLesson) => ({ ...s, content: { ...(s.content as object), extra: 1 } })],
    ['a missing content key', (s: StoredLesson) => ({ ...s, content: { ...(s.content as object), approvedAt: undefined } })],
    ['a key column that differs from the content', (s: StoredLesson) => ({ ...s, applicability_key: 'other|reasoning-v3' })],
    ['a non-integer version', (s: StoredLesson) => ({ ...s, version: '1' })],
    ['an unknown kind', (s: StoredLesson) => ({ ...s, kind: 'edited' })],
    ['a non-string evidence id', (s: StoredLesson) => ({ ...s, content: { ...(s.content as object), evidenceIds: [1] } })],
  ])('refuses a stored row with %s', (_name, change) => {
    expect(fromStored([stored(chain[0]!), change(stored(chain[1]!))])).toBeNull();
  });
});

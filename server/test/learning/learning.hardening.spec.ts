// BACK-108 (COG-05) read and write path requirements (cog-05-decisions.md, "Requirements for the read
// and write path"), enforced in the pure core before any activation (D6 still blocks activation):
// decision citations are HumanDecisions; approve accepts only the candidate the episodes still yield;
// a lesson with no citation is never shown; the chain is verified in src over exactly the stored
// columns, so a chain read back from the database can be re-verified.
import { approve, candidatesOf, fromStored, MAX_LESSON_DAYS, MIN_EPISODES, readLesson, rollback, type LessonRow, type StoredLesson } from '../../src/learning/learning.core';
import { basisOf, cands, decisionsOf, ep, failures, grant, KEY, OWNER, rowsOrThrow, seal, visibleAll } from './learning.fixture';

const NOW = '2026-12-01T00:00:00Z';
const eps = failures(MIN_EPISODES);
const cand = cands(eps)[0]!;
const approveAt = (rows: readonly LessonRow[], at: string) => rowsOrThrow(approve(rows, cand, grant('2027-01-01T00:00:00Z', at), basisOf(eps)));
const chain = approveAt(approveAt([], '2026-11-27T12:00:00Z'), '2026-11-28T12:00:00Z');
const SCOPE = { workspaceId: 'ws-1', projectId: 'p-1' };
const stored = (r: LessonRow): StoredLesson => ({
  workspace_id: SCOPE.workspaceId,
  project_id: SCOPE.projectId,
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

  it.each([
    ['a non-ISO approval time', grant('2027-01-01T00:00:00Z', 'Nov 27 2026')],
    ['a non-UTC expiry', grant('2027-01-01T00:00:00+02:00', '2026-11-27T12:00:00Z')],
    ['an impossible date', grant('2027-02-30T00:00:00Z', '2026-11-27T12:00:00Z')],
    [`an expiry more than ${MAX_LESSON_DAYS} days after approval`, grant('2099-01-01T00:00:00Z', '2026-11-27T12:00:00Z')],
  ])('refuses %s', (_name, g) => {
    expect(approve([], cand, g, basisOf(eps))).toEqual({ ok: false, reason: 'bad-expiry' });
  });

  it('refuses to append to another lesson chain', () => {
    const other = failures(MIN_EPISODES).map((e) => ({ ...e, applicabilityKey: 'other|reasoning-v3' }));
    const otherRows = rowsOrThrow(approve([], cands(other)[0]!, at, basisOf(other)));
    expect(approve(otherRows, cand, at, basisOf(eps))).toEqual({ ok: false, reason: 'other-lesson' });
  });
});

describe('malformed or conflicting inputs refuse instead of throwing or depending on order', () => {
  it('two episodes with one id and different content are both dropped, in either order', () => {
    const clash = [...failures(MIN_EPISODES), ep(0, 'success')];
    expect(cands(clash)).toEqual([]);
    expect(cands([...clash].reverse())).toEqual([]);
  });

  it('an exact duplicate still counts once', () => {
    expect(cands([...eps, ep(0, 'failure')])).toEqual(cands(eps));
  });

  it('a malformed episode is ignored, and a malformed row reads as an invalid chain', () => {
    const bad = { ...eps[0]!, decisionEvidence: 'd0' as unknown as string[] };
    expect(() => cands([bad, ...eps.slice(1)])).not.toThrow();
    const broken = [{ ...chain[0]!, content: null as unknown as LessonRow['content'] }];
    expect(readLesson(broken, basisOf(eps), NOW)).toEqual({ state: 'invalid-chain' });
    expect(rollback(broken, { reviewer: OWNER, owner: OWNER, toVersion: 1 })).toEqual({ ok: false, reason: 'invalid-chain' });
  });
});

// The chain hash is unkeyed: anyone able to insert a whole self-consistent chain could seal any content.
// So a lesson is shown only while the current episodes still support exactly what it says.
describe('a lesson is shown only while the current episodes still support it', () => {
  const v1 = chain[0]!;
  const sealedWith = (content: Partial<LessonRow['content']>) => [seal({ version: 1, previous: null, kind: 'approved', reviewer: OWNER, content: { ...v1.content, ...content } })];
  const state = (rows: readonly LessonRow[], basis = basisOf(eps)) => readLesson(rows, basis, NOW).state;

  it('the approved chain is supported (control)', () => {
    expect(state(chain)).toBe('approved');
  });

  it.each([
    ['invented episodes', { episodeIds: ['x1', 'x2', 'x3', 'x4', 'x5'] }],
    ['an invented citation added', { evidenceIds: [...v1.content.evidenceIds, 'forged'].sort() }],
    ['a citation dropped', { evidenceIds: v1.content.evidenceIds.slice(1) }],
    ['a flipped outcome', { outcome: 'success' as const }],
    ['fewer than N episodes', { episodeIds: v1.content.episodeIds.slice(1), evidenceIds: v1.content.evidenceIds.filter((id) => !id.endsWith('0')) }],
    ['a repeated episode', { episodeIds: [v1.content.episodeIds[0]!, ...v1.content.episodeIds] }],
  ])('a self-consistent chain with %s reads as unsupported', (_name, content) => {
    // The forged id is made visible, so the support check is what refuses it, not visibility.
    const basis = basisOf(eps, new Set([...visibleAll(eps), 'forged']));
    expect(state(sealedWith(content), basis)).toBe('unsupported');
  });

  it('a cited episode whose decision is no longer a HumanDecision drops the lesson below N', () => {
    const basis = basisOf(eps);
    const decisions = new Set(basis.decisions);
    decisions.delete('d0');
    expect(state(chain, { ...basis, decisions })).toBe('unsupported');
  });

  it('contrary episodes that make the key contested make the lesson unsupported', () => {
    const contrary = [...eps, ep(90, 'success'), ep(91, 'success')];
    expect(state(chain, basisOf(contrary))).toBe('unsupported');
  });

  it('more agreeing episodes after approval keep it supported', () => {
    const more = [...eps, ep(90, 'failure'), ep(91, 'failure')];
    expect(state(chain, basisOf(more))).toBe('approved');
  });
});

describe('a lesson with no citation is never shown', () => {
  const base = chain[0]!;
  it.each([
    ['no evidence', { ...base.content, evidenceIds: [] }],
    ['no episodes', { ...base.content, episodeIds: [] }],
  ])('a validly sealed lesson with %s reads as uncited', (_name, content) => {
    const rows = [seal({ version: 1, previous: null, kind: 'approved', reviewer: OWNER, content })];
    expect(readLesson(rows, basisOf(eps), NOW)).toEqual({ state: 'uncited' });
  });
});

describe('the chain is verified in src', () => {
  const read = (rows: readonly LessonRow[]) => readLesson(rows, basisOf(eps), NOW).state;

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
    const rows = fromStored([...chain].reverse().map(stored), SCOPE);
    expect(rows).toEqual(chain);
    expect(readLesson(rows!, basisOf(eps), NOW)).toMatchObject({ state: 'approved', version: 2, applicabilityKey: KEY });
  });

  it.each([
    ['an unknown content key', (s: StoredLesson) => ({ ...s, content: { ...(s.content as object), extra: 1 } })],
    ['a missing content key', (s: StoredLesson) => {
      const { approvedAt: _dropped, ...content } = s.content as Record<string, unknown>;
      return { ...s, content };
    }],
    ['a __proto__ content key', (s: StoredLesson) => ({ ...s, content: JSON.parse(`{"__proto__":{},${JSON.stringify(s.content).slice(1)}`) as unknown })],
    ['content with another prototype', (s: StoredLesson) => ({ ...s, content: Object.assign(Object.create({ inherited: 1 }) as object, s.content) })],
    ['another project', (s: StoredLesson) => ({ ...s, project_id: 'p-2' })],
    ['another workspace', (s: StoredLesson) => ({ ...s, workspace_id: 'ws-2' })],
    ['a float version', (s: StoredLesson) => ({ ...s, version: 1.5 })],
    ['a previous hash that is not a sha-256 hex digest', (s: StoredLesson) => ({ ...s, previous_hash: 'x' })],
    ['a reviewer that is not a string', (s: StoredLesson) => ({ ...s, reviewer_user_id: 7 })],
    ['a key column that differs from the content', (s: StoredLesson) => ({ ...s, applicability_key: 'other|reasoning-v3' })],
    ['a non-integer version', (s: StoredLesson) => ({ ...s, version: '1' })],
    ['an unknown kind', (s: StoredLesson) => ({ ...s, kind: 'edited' })],
    ['a non-string evidence id', (s: StoredLesson) => ({ ...s, content: { ...(s.content as object), evidenceIds: [1] } })],
  ])('refuses a stored row with %s', (_name, change) => {
    expect(fromStored([stored(chain[0]!), change(stored(chain[1]!))], SCOPE)).toBeNull();
  });

  it('duplicate versions map, then fail chain verification', () => {
    const rows = fromStored([stored(chain[0]!), stored(chain[0]!)], SCOPE);
    expect(readLesson(rows!, basisOf(eps), NOW)).toEqual({ state: 'invalid-chain' });
  });
});

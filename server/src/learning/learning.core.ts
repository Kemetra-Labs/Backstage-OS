// BACK-108 (COG-05) governed learning, pure machinery only (cog-05-decisions.md D1-D6). Episodes are
// cited evidence; a candidate lesson needs N verified, visible, observation-labelled episodes; approval
// is owner-only and append-only; a lesson is an advisory note that never changes a state, gate,
// recommendation or rule. Activation is blocked (D6): nothing here is wired to a route or to reasoning.
// The read and write path requirements (decision citations are HumanDecisions, at least one citation,
// the chain verified in src, owner-only on write) are enforced here, ahead of any activation.
import { canonicalJson, sha256 } from '../memory/memory.canonical';

export const MIN_EPISODES = 5;
/** Longest a lesson approval may stay valid (conservative and reversible; the owner can change it). */
export const MAX_LESSON_DAYS = 180;
const DAY_MS = 86_400_000;

export interface Episode {
  readonly id: string;
  /** Task kind and rule version the episode applies to (O1). */
  readonly applicabilityKey: string;
  readonly outcome: 'success' | 'failure';
  readonly label: 'observation' | 'correlation' | 'hypothesis';
  readonly decisionEvidence: readonly string[];
  readonly outcomeEvidence: readonly string[];
}

export interface Candidate {
  readonly applicabilityKey: string;
  readonly outcome: Episode['outcome'];
  readonly episodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly contested: boolean;
}

/** What candidates are computed from: the episodes, the visible evidence, and which of it is a HumanDecision. */
export interface Basis {
  readonly episodes: readonly Episode[];
  readonly visible: ReadonlySet<string>;
  readonly decisions: ReadonlySet<string>;
}

export interface LessonContent {
  readonly applicabilityKey: string;
  readonly outcome: Episode['outcome'];
  readonly episodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  /** When the owner approved this content. Inside the content, so the stored hash covers it. */
  readonly approvedAt: string;
  readonly expiresAt: string;
}

export interface LessonRow {
  readonly version: number;
  readonly previous: string | null;
  readonly kind: 'approved' | 'rolled-back';
  readonly reviewer: string;
  readonly content: LessonContent;
  /** sha256 of exactly the stored columns: version, previous, kind, reviewer and content. */
  readonly hash: string;
}

export type LessonRead =
  | { readonly state: 'none' | 'suspended' | 'expired' | 'invalid-chain' | 'uncited' | 'unsupported' }
  | {
      readonly state: 'approved';
      readonly version: number;
      readonly effect: 'advisory-note';
      readonly applicabilityKey: string;
      readonly outcome: Episode['outcome'];
      readonly episodeIds: readonly string[];
    };

type Refusal<R extends string> = { readonly ok: false; readonly reason: R };
type Appended = { readonly ok: true; readonly rows: readonly LessonRow[] };

const order = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1);
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(order);
const citesOf = (e: Episode): string[] => [...e.decisionEvidence, ...e.outcomeEvidence];

/** A malformed input refuses instead of throwing. */
const safely = (check: () => boolean): boolean => {
  try {
    return check();
  } catch {
    return false;
  }
};
const sameJson = (a: unknown, b: unknown): boolean => safely(() => canonicalJson(a) === canonicalJson(b));

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
/** Only a canonical UTC ISO-8601 instant, so what is sealed is unambiguous. */
const instant = (s: unknown): number | null => {
  if (typeof s !== 'string' || !ISO_INSTANT.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString() === (s.length === 20 ? s.replace('Z', '.000Z') : s) ? t : null;
};

// An episode counts only when its decision and outcome are both cited and visible (O1, O4), and every
// decision citation is a HumanDecision.
const counts = (e: Episode, visible: ReadonlySet<string>, decisions: ReadonlySet<string>): boolean =>
  e.label === 'observation' &&
  e.decisionEvidence.length > 0 &&
  e.outcomeEvidence.length > 0 &&
  e.decisionEvidence.every((id) => decisions.has(id)) &&
  citesOf(e).every((id) => visible.has(id));

/** O2: deterministic candidates; abstains below N; disagreeing episodes make a candidate contested. */
export function candidatesOf(episodes: readonly Episode[], visible: ReadonlySet<string>, decisions: ReadonlySet<string>): Candidate[] {
  const byId = new Map<string, Episode | null>();
  for (const e of episodes) {
    if (!safely(() => counts(e, visible, decisions))) continue;
    const seen = byId.get(e.id);
    // The same id with different content is a conflict: drop it, so the result does not depend on order.
    if (seen === undefined) byId.set(e.id, e);
    else if (seen !== null && !sameJson(seen, e)) byId.set(e.id, null);
  }
  const groups = new Map<string, Episode[]>();
  for (const e of byId.values()) if (e) groups.set(e.applicabilityKey, [...(groups.get(e.applicabilityKey) ?? []), e]);

  const out: Candidate[] = [];
  for (const key of sorted(groups.keys())) {
    const group = groups.get(key)!;
    const failures = group.filter((e) => e.outcome === 'failure').length;
    const majority: Episode['outcome'] = failures * 2 >= group.length ? 'failure' : 'success';
    if (group.filter((e) => e.outcome === majority).length < MIN_EPISODES) continue;
    out.push({
      applicabilityKey: key,
      outcome: majority,
      episodeIds: sorted(group.map((e) => e.id)),
      evidenceIds: sorted(group.flatMap(citesOf)),
      contested: group.some((e) => e.outcome !== majority),
    });
  }
  return out;
}

// The hash input is named field by field, so it is exactly what learning_lessons stores, and nothing a
// caller adds to a row object can change it.
const hashOf = (r: Omit<LessonRow, 'hash'>): string =>
  sha256({ version: r.version, previous: r.previous, kind: r.kind, reviewer: r.reviewer, content: r.content });

/** No gaps, each previous hash is the prior version's hash, the hash covers the row, one lesson key throughout. */
const chainOk = (rows: readonly LessonRow[]): boolean =>
  safely(() =>
    rows.every(
      (r, i) =>
        r.version === i + 1 &&
        r.previous === (i === 0 ? null : rows[i - 1]!.hash) &&
        r.content.applicabilityKey === rows[0]!.content.applicabilityKey &&
        r.hash === hashOf(r),
    ),
  );

function append(rows: readonly LessonRow[], kind: LessonRow['kind'], reviewer: string, content: LessonContent): Appended {
  const previous = rows.length ? rows[rows.length - 1]!.hash : null;
  const row = { version: rows.length + 1, previous, kind, reviewer, content };
  return { ok: true, rows: [...rows, { ...row, hash: hashOf(row) }] };
}


export interface Grant {
  readonly reviewer: string;
  /** The workspace owner, read from the workspace row (workspaces.owner_user_id), never from the request. */
  readonly owner: string;
  readonly expiresAt: string;
  /** The approval time, from the server clock at write time, never from the request. */
  readonly at: string;
}

type ApproveRefusal = 'not-owner' | 'contested' | 'bad-expiry' | 'invalid-chain' | 'other-lesson' | 'not-a-candidate';

/**
 * O3 and O5: the workspace owner approves a non-contested candidate with an expiry; append-only. The
 * candidate must be exactly what the basis still yields, so a hand-made or stale candidate is refused,
 * and the sealed content always comes from the derived candidate, not from the caller's object.
 */
export function approve(rows: readonly LessonRow[], candidate: Candidate, grant: Grant, basis: Basis): Appended | Refusal<ApproveRefusal> {
  if (grant.reviewer !== grant.owner) return { ok: false, reason: 'not-owner' };
  if (candidate.contested) return { ok: false, reason: 'contested' };
  const at = instant(grant.at);
  const expires = instant(grant.expiresAt);
  if (at === null || expires === null || expires <= at || expires - at > MAX_LESSON_DAYS * DAY_MS) return { ok: false, reason: 'bad-expiry' };
  if (!chainOk(rows)) return { ok: false, reason: 'invalid-chain' };
  if (rows.length && rows[0]!.content.applicabilityKey !== candidate.applicabilityKey) return { ok: false, reason: 'other-lesson' };
  const current = candidatesOf(basis.episodes, basis.visible, basis.decisions).find((c) => c.applicabilityKey === candidate.applicabilityKey);
  if (!current || current.contested || !sameJson(current, candidate)) return { ok: false, reason: 'not-a-candidate' };
  const { applicabilityKey, outcome, episodeIds, evidenceIds } = current;
  return append(rows, 'approved', grant.reviewer, { applicabilityKey, outcome, episodeIds, evidenceIds, approvedAt: grant.at, expiresAt: grant.expiresAt });
}

/** O3: restores an earlier version's content byte for byte, as a new appended row. */
export function rollback(
  rows: readonly LessonRow[],
  req: { readonly reviewer: string; readonly owner: string; readonly toVersion: number },
): Appended | Refusal<'not-owner' | 'no-such-version' | 'invalid-chain'> {
  if (req.reviewer !== req.owner) return { ok: false, reason: 'not-owner' };
  if (!chainOk(rows)) return { ok: false, reason: 'invalid-chain' };
  const target = rows.find((r) => r.version === req.toVersion);
  if (!target) return { ok: false, reason: 'no-such-version' };
  // A deep copy that keeps key order, so the restored content serializes byte for byte the same.
  const content: LessonContent = { ...target.content, episodeIds: [...target.content.episodeIds], evidenceIds: [...target.content.evidenceIds] };
  return append(rows, 'rolled-back', req.reviewer, content);
}

/**
 * The current episodes still support this content: every cited episode still counts (visible, observation,
 * HumanDecision), there are at least N of them, the evidence is exactly their citations, and the key's
 * current candidate has the same outcome and is not contested. A cited subset of the currently agreeing
 * episodes is accepted, so more agreeing episodes since the approval do not demote a lesson. This is what
 * makes the unkeyed chain safe to read: a self-consistent chain cannot claim what the episodes do not show.
 */
function supported(content: LessonContent, basis: Basis): boolean {
  // Only this key's episodes matter, so the read costs what this lesson's episodes cost.
  const own = basis.episodes.filter((e) => e.applicabilityKey === content.applicabilityKey);
  const current = candidatesOf(own, basis.visible, basis.decisions)[0];
  if (!current || current.contested || current.outcome !== content.outcome) return false;
  const live = new Set(current.episodeIds);
  const cited = content.episodeIds;
  if (cited.length < MIN_EPISODES || !sameJson(sorted(cited), cited) || !cited.every((id) => live.has(id))) return false;
  const citedSet = new Set(cited);
  // From the counting episodes only, the same set the candidate was built from.
  const citations = own.filter((e) => citedSet.has(e.id) && counts(e, basis.visible, basis.decisions)).flatMap(citesOf);
  return sameJson(sorted(citations), content.evidenceIds);
}

const validWindow = (c: LessonContent): boolean => {
  const at = instant(c.approvedAt);
  const expires = instant(c.expiresAt);
  return at !== null && expires !== null && expires > at && expires - at <= MAX_LESSON_DAYS * DAY_MS;
};

/**
 * What approve() and rollback() enforce outside the content: the workspace owner reviewed every row, the
 * first row is an approval, every approval has a valid window, and a rollback restores the content of an
 * earlier version. `owner` must come from the workspace row (workspaces.owner_user_id).
 */
const governed = (rows: readonly LessonRow[], owner: string): boolean =>
  rows.every(
    (r, i) =>
      r.reviewer === owner &&
      validWindow(r.content) &&
      (r.kind === 'approved' ? true : i > 0 && rows.slice(0, i).some((earlier) => sameJson(earlier.content, r.content))),
  );

/**
 * O4 and O6: the current version, read against the current basis (episodes, visible evidence and
 * HumanDecisions) and the workspace owner. Invalid if the chain is broken or could not have been written by
 * approve() and rollback(); suspended if any cited evidence is not visible; unsupported if the current
 * episodes no longer support it; expired at its expiry; otherwise an advisory note only.
 */
export function readLesson(rows: readonly LessonRow[], basis: Basis, now: string, owner: string): LessonRead {
  if (!rows.length) return { state: 'none' };
  if (!chainOk(rows) || !safely(() => governed(rows, owner))) return { state: 'invalid-chain' };
  const { version, content } = rows[rows.length - 1]!;
  // A lesson needs at least one citation and one episode, or it is not shown.
  if (!safely(() => strings(content.evidenceIds) && strings(content.episodeIds) && content.evidenceIds.length > 0 && content.episodeIds.length > 0)) return { state: 'uncited' };
  if (!safely(() => content.evidenceIds.every((id) => basis.visible.has(id)))) return { state: 'suspended' };
  if (!safely(() => supported(content, basis))) return { state: 'unsupported' };
  if (!(Date.parse(now) < Date.parse(content.expiresAt))) return { state: 'expired' };
  return { state: 'approved', version, effect: 'advisory-note', applicabilityKey: content.applicabilityKey, outcome: content.outcome, episodeIds: content.episodeIds };
}

/** A learning_lessons row as the database returns it. Every field is checked before use. */
export interface StoredLesson {
  readonly workspace_id: unknown;
  readonly project_id: unknown;
  readonly version: unknown;
  readonly previous_hash: unknown;
  readonly kind: unknown;
  readonly reviewer_user_id: unknown;
  readonly applicability_key: unknown;
  readonly content: unknown;
  readonly hash: unknown;
}

const CONTENT_KEYS = ['applicabilityKey', 'approvedAt', 'episodeIds', 'evidenceIds', 'expiresAt', 'outcome'].join();
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function contentOf(v: unknown): LessonContent | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.getPrototypeOf(o) !== Object.prototype || Object.keys(o).sort(order).join() !== CONTENT_KEYS) return null;
  const { applicabilityKey, outcome, episodeIds, evidenceIds, approvedAt, expiresAt } = o;
  if (typeof applicabilityKey !== 'string' || (outcome !== 'success' && outcome !== 'failure')) return null;
  if (!strings(episodeIds) || !strings(evidenceIds) || typeof approvedAt !== 'string' || typeof expiresAt !== 'string') return null;
  return { applicabilityKey, outcome, episodeIds, evidenceIds, approvedAt, expiresAt };
}

/** The workspace and project the reader asked for. The hash does not cover them, so they are checked here. */
export interface LessonScope {
  readonly workspaceId: string;
  readonly projectId: string;
}

function rowOf(s: StoredLesson, scope: LessonScope): LessonRow | null {
  if (s.workspace_id !== scope.workspaceId || s.project_id !== scope.projectId) return null;
  const content = contentOf(s.content);
  if (!content || s.applicability_key !== content.applicabilityKey) return null;
  if (typeof s.version !== 'number' || !Number.isInteger(s.version)) return null;
  if (s.previous_hash !== null && !(typeof s.previous_hash === 'string' && /^[0-9a-f]{64}$/.test(s.previous_hash))) return null;
  if ((s.kind !== 'approved' && s.kind !== 'rolled-back') || typeof s.reviewer_user_id !== 'string' || typeof s.hash !== 'string') return null;
  return { version: s.version, previous: s.previous_hash, kind: s.kind, reviewer: s.reviewer_user_id, content, hash: s.hash };
}

/**
 * Maps the stored rows of one lesson in one project to chain rows in version order, or null when any row
 * is malformed or belongs to another workspace or project. The result still goes through readLesson,
 * which verifies the chain: the database checks the shape of each row, and src checks that the rows
 * form one unbroken, untampered chain. The chain is tamper-evidence, not authentication: its hash is
 * unkeyed (cog-05-decisions.md, before activation).
 */
export function fromStored(stored: readonly StoredLesson[], scope: LessonScope): LessonRow[] | null {
  const rows: LessonRow[] = [];
  for (const s of stored) {
    const row = rowOf(s, scope);
    if (!row) return null;
    rows.push(row);
  }
  return rows.sort((a, b) => a.version - b.version);
}

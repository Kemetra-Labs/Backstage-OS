// BACK-108 (COG-05) governed learning, pure machinery only (cog-05-decisions.md D1-D6). Episodes are
// cited evidence; a candidate lesson needs N verified, visible, observation-labelled episodes; approval
// is owner-only and append-only; a lesson is an advisory note that never changes a state, gate,
// recommendation or rule. Activation is blocked (D6): nothing here is wired to a route or to reasoning.
import { sha256 } from '../memory/memory.canonical';

export const MIN_EPISODES = 5;

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

export interface LessonContent {
  readonly applicabilityKey: string;
  readonly outcome: Episode['outcome'];
  readonly episodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly expiresAt: string;
}

export interface LessonRow {
  readonly version: number;
  readonly previous: string | null;
  readonly kind: 'approved' | 'rolled-back';
  readonly reviewer: string;
  readonly at: string;
  readonly content: LessonContent;
  readonly hash: string;
}

export type LessonRead =
  | { readonly state: 'none' | 'suspended' | 'expired' | 'invalid-chain' }
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

/** O2: deterministic candidates; abstains below N; disagreeing episodes make a candidate contested. */
export function candidatesOf(episodes: readonly Episode[], visible: ReadonlySet<string>): Candidate[] {
  const byId = new Map<string, Episode>();
  for (const e of episodes) {
    const cites = citesOf(e);
    // An episode exists only when its decision and outcome are both cited and visible (O1, O4).
    if (e.label !== 'observation' || !e.decisionEvidence.length || !e.outcomeEvidence.length || !cites.every((id) => visible.has(id))) continue;
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  const groups = new Map<string, Episode[]>();
  for (const e of byId.values()) groups.set(e.applicabilityKey, [...(groups.get(e.applicabilityKey) ?? []), e]);

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

const sealed = (row: Omit<LessonRow, 'hash'>): LessonRow => ({ ...row, hash: sha256(row) });

const chainOk = (rows: readonly LessonRow[]): boolean =>
  rows.every((r, i) => {
    const { hash, ...rest } = r;
    return r.version === i + 1 && r.previous === (i === 0 ? null : rows[i - 1]!.hash) && hash === sha256(rest);
  });

function append(rows: readonly LessonRow[], kind: LessonRow['kind'], reviewer: string, at: string, content: LessonContent): Appended {
  const previous = rows.length ? rows[rows.length - 1]!.hash : null;
  return { ok: true, rows: [...rows, sealed({ version: rows.length + 1, previous, kind, reviewer, at, content })] };
}

export interface Grant {
  readonly reviewer: string;
  readonly owner: string;
  readonly expiresAt: string;
  readonly at: string;
}

/** O3 and O5: the workspace owner approves a non-contested candidate with an expiry; append-only. */
export function approve(rows: readonly LessonRow[], candidate: Candidate, grant: Grant): Appended | Refusal<'not-owner' | 'contested' | 'bad-expiry' | 'invalid-chain'> {
  if (grant.reviewer !== grant.owner) return { ok: false, reason: 'not-owner' };
  if (candidate.contested) return { ok: false, reason: 'contested' };
  const at = Date.parse(grant.at);
  const expires = Date.parse(grant.expiresAt);
  if (!Number.isFinite(at) || !Number.isFinite(expires) || expires <= at) return { ok: false, reason: 'bad-expiry' };
  if (!chainOk(rows)) return { ok: false, reason: 'invalid-chain' };
  const { applicabilityKey, outcome, episodeIds, evidenceIds } = candidate;
  return append(rows, 'approved', grant.reviewer, grant.at, { applicabilityKey, outcome, episodeIds, evidenceIds, expiresAt: grant.expiresAt });
}

/** O3: restores an earlier version's content byte for byte, as a new appended row. */
export function rollback(
  rows: readonly LessonRow[],
  req: { readonly reviewer: string; readonly owner: string; readonly toVersion: number; readonly at: string },
): Appended | Refusal<'not-owner' | 'no-such-version' | 'invalid-chain'> {
  if (req.reviewer !== req.owner) return { ok: false, reason: 'not-owner' };
  if (!chainOk(rows)) return { ok: false, reason: 'invalid-chain' };
  const target = rows.find((r) => r.version === req.toVersion);
  if (!target) return { ok: false, reason: 'no-such-version' };
  // A deep copy that keeps key order, so the restored content serializes byte for byte the same.
  const content: LessonContent = { ...target.content, episodeIds: [...target.content.episodeIds], evidenceIds: [...target.content.evidenceIds] };
  return append(rows, 'rolled-back', req.reviewer, req.at, content);
}

/** O4 and O6: the current version, suspended if any cited evidence is not visible; advisory only. */
export function readLesson(rows: readonly LessonRow[], visible: ReadonlySet<string>, now: string): LessonRead {
  if (!rows.length) return { state: 'none' };
  if (!chainOk(rows)) return { state: 'invalid-chain' };
  const { version, content } = rows[rows.length - 1]!;
  if (!content.evidenceIds.every((id) => visible.has(id))) return { state: 'suspended' };
  if (!(Date.parse(now) < Date.parse(content.expiresAt))) return { state: 'expired' };
  return { state: 'approved', version, effect: 'advisory-note', applicabilityKey: content.applicabilityKey, outcome: content.outcome, episodeIds: content.episodeIds };
}

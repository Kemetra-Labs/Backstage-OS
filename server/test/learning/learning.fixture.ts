// Shared synthetic episodes for the COG-05 learning tests (BACK-108). Synthetic only: they test the
// machinery and can never justify a real lesson (D6).
import { sha256 } from '../../src/memory/memory.canonical';
import { candidatesOf, type Basis, type Episode, type LessonRow } from '../../src/learning/learning.core';

export const OWNER = 'owner-1';
export const KEY = 'jira_issue|reasoning-v3';

export const ep = (n: number, outcome: Episode['outcome'], key = KEY, extra: Partial<Episode> = {}): Episode => ({
  id: `e${n}`,
  applicabilityKey: key,
  outcome,
  label: 'observation',
  decisionEvidence: [`d${n}`],
  outcomeEvidence: [`o${n}`],
  ...extra,
});
export const failures = (n: number): Episode[] => Array.from({ length: n }, (_, i) => ep(i, 'failure'));
export const visibleAll = (eps: readonly Episode[]) => new Set(eps.flatMap((e) => [...e.decisionEvidence, ...e.outcomeEvidence]));
/** The visible HumanDecision evidence ids: every decision citation of these synthetic episodes. */
export const decisionsOf = (eps: readonly Episode[]) => new Set(eps.flatMap((e) => e.decisionEvidence));
export const basisOf = (eps: readonly Episode[], visible = visibleAll(eps)): Basis => ({ episodes: eps, visible, decisions: decisionsOf(eps) });
export const cands = (eps: readonly Episode[], visible = visibleAll(eps)) => candidatesOf(eps, visible, decisionsOf(eps));
export const grant = (expiresAt: string, at: string, reviewer = OWNER) => ({ reviewer, owner: OWNER, expiresAt, at });

/** Seals a row the way the stored hash is defined: exactly the stored columns, nothing else. */
export const seal = (row: Omit<LessonRow, 'hash'>): LessonRow => ({
  ...row,
  hash: sha256({ version: row.version, previous: row.previous, kind: row.kind, reviewer: row.reviewer, content: row.content }),
});

export function rowsOrThrow(r: { ok: true; rows: readonly LessonRow[] } | { ok: false; reason: string }): readonly LessonRow[] {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.rows;
}

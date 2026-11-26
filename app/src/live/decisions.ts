// Record a decision (BACK-51 P3, owner decisions D4 and D5 (a), 2026-11-26). Live mode only: nothing here is called in the default
// build. The form's rules mirror the server's (server/src/evidence/evidence.body.ts), counted in UTF-16 code units like its
// `v.length` check, so a long Arabic text and the server agree. The one POST goes through src/live/http.ts, which this file and
// session.ts/reads.ts alone may import (src/live/live.guard.test.ts).
//
// The server gives no reason for a 400 (an empty body), and answers 401 and 404 alike, so the result is one word and the form
// says what it can. A decision records what a person decided; it runs nothing and never reads as Approved.
import { apiRequest, type Fetcher } from './http';

export const DECISION_MAX = 2000;
export const RATIONALE_MAX = 4000;
export const EVIDENCE_MAX = 50;

export interface DecisionDraft {
  readonly decision: string;
  readonly rationale: string;
  /** Ids of the records this decision cites (0 to 50). */
  readonly evidenceIds: readonly string[];
}

export const EMPTY_DRAFT: DecisionDraft = { decision: '', rationale: '', evidenceIds: [] };

export type DraftProblem = 'decisionBlank' | 'decisionTooLong' | 'rationaleBlank' | 'rationaleTooLong' | 'tooManyEvidence' | 'unstorable';

/** A high surrogate with no low one after it, or a low one with no high one before it. */
const UNPAIRED_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** The server's storableText(): no NUL and no unpaired surrogate (PostgreSQL jsonb would reject them later with a 500). */
const storable = (v: string): boolean => !v.includes(String.fromCharCode(0)) && !UNPAIRED_SURROGATE.test(v);

/** What the server would refuse in this draft, so the form can say so before sending. Empty: it is sendable. */
export function draftProblems(d: DecisionDraft): readonly DraftProblem[] {
  const out: DraftProblem[] = [];
  if (d.decision.trim().length === 0) out.push('decisionBlank');
  else if (d.decision.length > DECISION_MAX) out.push('decisionTooLong');
  if (d.rationale.trim().length === 0) out.push('rationaleBlank');
  else if (d.rationale.length > RATIONALE_MAX) out.push('rationaleTooLong');
  if (d.evidenceIds.length > EVIDENCE_MAX) out.push('tooManyEvidence');
  if (!storable(d.decision) || !storable(d.rationale)) out.push('unstorable');
  return out;
}

export type SubmitResult = 'recorded' | 'invalid' | 'not_found' | 'rate_limited' | 'unavailable' | 'error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The UUID `id` of an investigation body (GET /investigations/:id), or null. No request path is built from anything else. */
export function investigationIdOf(body: unknown): string | null {
  const id = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as { id?: unknown }).id : undefined;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

/**
 * POST /investigations/:id/decisions. Only a 201 is `recorded`. A draft the server would refuse, or an id that is not a UUID,
 * is `invalid` with no request. The text is sent as typed (not trimmed), so what the owner sees is what is stored.
 */
export async function submitDecision(investigationId: string, d: DecisionDraft, signal?: AbortSignal, fetcher?: Fetcher): Promise<SubmitResult> {
  if (!UUID.test(investigationId) || draftProblems(d).length > 0) return 'invalid';
  const r = await apiRequest(`/api/investigations/${investigationId}/decisions`, {
    method: 'POST',
    body: { decision: d.decision, rationale: d.rationale, evidenceIds: d.evidenceIds },
    signal,
    fetcher,
  });
  if (r.ok) return r.status === 201 ? 'recorded' : 'error';
  return r.failure === 'invalid' || r.failure === 'not_found' || r.failure === 'rate_limited' || r.failure === 'unavailable' ? r.failure : 'error';
}

/**
 * D5 (a), client side: one submit at a time. A second call while one is in flight does nothing (null), so a double click or a
 * retry in the same tick records one decision. Free again when the call settles, failure included.
 */
export function createSubmitGuard(): { run<T>(f: () => Promise<T>): Promise<T> | null } {
  let busy = false;
  return {
    run<T>(f: () => Promise<T>): Promise<T> | null {
      if (busy) return null;
      busy = true;
      return f().finally(() => { busy = false; });
    },
  };
}

/** What a submit does with the current draft and the ids of the records that can still be cited. */
export type SubmitPlan =
  | { readonly kind: 'problems' }
  | { readonly kind: 'citationsChanged'; readonly sendable: DecisionDraft }
  | { readonly kind: 'send'; readonly sendable: DecisionDraft };

/**
 * A record that left the list since it was ticked is pruned from the draft, and nothing is sent: the owner sees the change before
 * anything is recorded with fewer citations than they chose. A draft the server would refuse sends nothing either.
 */
export function planSubmit(draft: DecisionDraft, citable: readonly string[]): SubmitPlan {
  const sendable: DecisionDraft = { ...draft, evidenceIds: draft.evidenceIds.filter((id) => citable.includes(id)) };
  if (draftProblems(sendable).length > 0) return { kind: 'problems' };
  return sendable.evidenceIds.length !== draft.evidenceIds.length ? { kind: 'citationsChanged', sendable } : { kind: 'send', sendable };
}

/**
 * After which answers the decision list is read again: a recorded decision, and the two where the server may have recorded it
 * anyway (the answer was lost or was a server error), so the check the copy asks for ("check the decision list") can be made.
 * The server has no duplicate check yet (D5 (a)), so a retry without that check could record a second decision.
 */
export const refreshesList = (r: SubmitResult): boolean => r === 'recorded' || r === 'unavailable' || r === 'error';

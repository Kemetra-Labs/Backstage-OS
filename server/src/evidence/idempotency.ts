// Idempotency for the two evidence write routes (BACK-172 G3, owner decisions H(a) and I). Pure helpers: the
// optional `Idempotency-Key` header, the key hash and the canonical request hash. The record itself is the
// write's own audit row (metadata.idempotency_key_hash and metadata.request_hash), looked up by the repository
// under an advisory lock; there is no schema of its own. The raw key is never stored or logged.
import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { DecisionInput, NoteInput } from './evidence.repository';

/** How long a key is remembered (owner decision I). */
export const IDEMPOTENCY_WINDOW_SECONDS = 24 * 60 * 60;

const KEY = /^[A-Za-z0-9-]{8,64}$/;

/** The audit action each idempotent write already records. */
export type IdempotentAction = 'decision.recorded' | 'note.recorded';

export interface IdempotencyClaim {
  /** SHA-256 of `${action}:${key}`, hex. */
  readonly keyHash: string;
  /** SHA-256 of the stable JSON of the validated input, hex. */
  readonly requestHash: string;
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The header is absent (undefined) or one value of 8-64 characters [A-Za-z0-9-]; anything else, repeated or empty included, is a 400. */
export function parseIdempotencyKey(header: string | string[] | undefined): string | undefined {
  if (header === undefined) return undefined;
  if (typeof header !== 'string' || !KEY.test(header)) throw new BadRequestException();
  return header;
}

/** Lower-cased, de-duplicated, sorted: the same citations in another order are the same request. */
const citations = (ids: readonly string[]): string[] => [...new Set(ids.map((id) => id.toLowerCase()))].sort();

/** Fixed key order, so equal inputs always serialise to the same text. */
function canonical(action: IdempotentAction, input: DecisionInput | NoteInput): string {
  const common = { action, investigationId: input.investigationId.toLowerCase(), evidenceIds: citations(input.evidenceIds) };
  if (action === 'decision.recorded') {
    const d = input as DecisionInput;
    return JSON.stringify({ ...common, decision: d.decision, rationale: d.rationale });
  }
  const n = input as NoteInput;
  return JSON.stringify({ ...common, type: n.type, text: n.text });
}

export function idempotencyClaim(action: IdempotentAction, key: string, input: DecisionInput | NoteInput): IdempotencyClaim {
  return { keyHash: sha256(`${action}:${key}`), requestHash: sha256(canonical(action, input)) };
}

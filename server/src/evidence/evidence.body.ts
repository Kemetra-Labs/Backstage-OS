// Request-body validation for the evidence write routes (decisions BACK-55, notes BACK-50). Pure
// functions: a bad body throws 400 before any database work. Shared rules: non-blank text within a
// length, no NUL and no unpaired surrogate (PostgreSQL jsonb would reject them later with a 500), and
// at most 50 citation ids. Whether the ids exist or are visible is the repository's job (404).
import { BadRequestException } from '@nestjs/common';
import type { DecisionInput, NoteInput } from './evidence.repository';
import { NOTE_TYPES, type NoteType } from './evidence.types';

const MAX_CITATIONS = 50;

/** No NUL and no unpaired surrogate. */
export function storableText(v: string): boolean {
  return !v.includes(String.fromCharCode(0)) && (v as unknown as { isWellFormed(): boolean }).isWellFormed();
}

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max && storableText(v);

function fields(body: unknown): Record<string, unknown> {
  return (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
}

function citations(v: unknown, min: number): string[] {
  if (!Array.isArray(v) || v.length < min || v.length > MAX_CITATIONS || !v.every((id) => typeof id === 'string')) {
    throw new BadRequestException();
  }
  return v as string[];
}

export function decisionBody(body: unknown, investigationId: string): DecisionInput {
  const { decision, rationale, evidenceIds } = fields(body);
  if (!text(decision, 2000) || !text(rationale, 4000)) throw new BadRequestException();
  return { investigationId, decision, rationale, evidenceIds: citations(evidenceIds, 0) };
}

/**
 * A note needs an explicit `type` (BACK-54: no save without one), Correlation or Hypothesis only, its
 * text, and at least one cited evidence id.
 */
export function noteBody(body: unknown, investigationId: string): NoteInput {
  const { type, text: note, evidenceIds } = fields(body);
  if (typeof type !== 'string' || !(NOTE_TYPES as readonly string[]).includes(type)) throw new BadRequestException();
  if (!text(note, 4000)) throw new BadRequestException();
  return { investigationId, type: type as NoteType, text: note, evidenceIds: citations(evidenceIds, 1) };
}

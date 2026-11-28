// Request-body validation for POST /investigations (BACK-148 decision M). Pure: a bad body throws 400 before any database
// work, with the same text rules as the evidence writes (src/evidence/evidence.body.ts). Whether the project exists or is
// visible is the repository's job (404), so a project id that is a string but not a UUID answers 404 like an absent one.
import { BadRequestException } from '@nestjs/common';
import { storableText } from '../evidence/evidence.body';
import type { InvestigationInput } from '../evidence/evidence.repository';

/** The investigations.title CHECK is 1-300 characters; counting UTF-16 code units here is never looser than that. */
export const TITLE_MAX = 300;

export function investigationBody(body: unknown): InvestigationInput {
  const { projectId, title } = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  if (typeof projectId !== 'string') throw new BadRequestException();
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > TITLE_MAX || !storableText(title)) throw new BadRequestException();
  return { projectId, title };
}

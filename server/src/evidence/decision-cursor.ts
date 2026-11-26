// Opaque GET /decisions cursor (BACK-100 follow-up). A keyset position (received_at, id) in the list's order,
// newest first, bound to the query it was issued for: the workspace, the reader and the investigation filter.
// It is not signed: a client that forges a position only moves where the next page starts, and the visibility
// rule still runs on every page, so a forged cursor can never reveal a hidden decision. Anything that is not
// exactly a cursor this server issued for this query is refused (the caller maps it to 400), never read as
// "start from the first page".
import { createHash } from 'node:crypto';
import { UUID } from './evidence.types';

/** A keyset position: `at` keeps the database's microseconds, which a JS Date would drop. */
export interface DecisionPosition {
  /** UTC, `YYYY-MM-DDTHH:MM:SS.ffffffZ` (always six fractional digits). */
  readonly at: string;
  readonly id: string;
}

/** Who and what a cursor was issued for. */
export interface DecisionCursorScope {
  readonly workspaceId: string;
  readonly userId: string;
  readonly investigationId?: string;
}

const VERSION = 1;
/** Far above any cursor this server issues (about 170 characters), so the decoder never parses a large input. */
const MAX_LENGTH = 512;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;
/** Exactly these keys, no more and no fewer. */
const KEYS: readonly string[] = ['v', 't', 'id', 's'];

/** Thrown for any cursor that is malformed or was issued for another query. */
export class InvalidCursorError extends Error {}

/** A short digest of the scope: binds the cursor to its query without putting the ids in it. */
function scopeTag(scope: DecisionCursorScope): string {
  // The workspace and reader ids are kept exactly as the session gives them (never case-folded). Only the
  // investigation filter is a user-typed uuid, so only it is folded; "no filter" and an empty filter differ.
  const filter = scope.investigationId === undefined ? 'none' : `inv:${scope.investigationId.toLowerCase()}`;
  const parts = [scope.workspaceId, scope.userId, filter];
  return createHash('sha256').update(`kawalys:decisions:v${VERSION}|${parts.join('|')}`).digest('base64url').slice(0, 22);
}

/** A real calendar instant: rejects 2026-02-30 and 25:61, which the pattern alone accepts. */
function validAt(at: string): boolean {
  const m = AT.exec(at);
  if (!m) return false;
  const ms = `${at.slice(0, 23)}Z`;
  const d = new Date(ms);
  return !Number.isNaN(d.getTime()) && d.toISOString() === ms && Number(m[1]) >= 1;
}

export function encodeDecisionCursor(position: DecisionPosition, scope: DecisionCursorScope): string {
  if (!validAt(position.at) || !UUID.test(position.id)) throw new TypeError('invalid decision position');
  return Buffer.from(JSON.stringify({ v: VERSION, t: position.at, id: position.id.toLowerCase(), s: scopeTag(scope) })).toString('base64url');
}

/** The position in `cursor`, or InvalidCursorError when it is malformed or belongs to another query. */
export function decodeDecisionCursor(cursor: string, scope: DecisionCursorScope): DecisionPosition {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_LENGTH || !BASE64URL.test(cursor)) throw new InvalidCursorError();
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new InvalidCursorError();
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k)) || b['v'] !== VERSION) throw new InvalidCursorError();
  const { t, id, s } = b;
  if (typeof t !== 'string' || !validAt(t) || typeof id !== 'string' || !UUID.test(id) || s !== scopeTag(scope)) throw new InvalidCursorError();
  // Re-encoding must give back the same text: no padding, no other spelling of the same cursor.
  if (encodeDecisionCursor({ at: t, id }, scope) !== cursor) throw new InvalidCursorError();
  return { at: t, id: id.toLowerCase() };
}

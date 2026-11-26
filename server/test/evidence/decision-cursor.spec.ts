// GET /decisions cursor codec (BACK-100 follow-up), without a database. The DB spec decisions-db.spec.ts proves
// paging end to end; this pins the encoding rules so a change to them fails fast.
import { randomUUID } from 'node:crypto';
import { decodeDecisionCursor, encodeDecisionCursor, InvalidCursorError, type DecisionCursorScope } from '../../src/evidence/decision-cursor';

const scope: DecisionCursorScope = { workspaceId: randomUUID(), userId: randomUUID(), investigationId: randomUUID() };
const position = { at: '2026-11-25T12:00:00.123456Z', id: randomUUID() };
const json = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const refused = (cursor: string, s: DecisionCursorScope = scope) => expect(() => decodeDecisionCursor(cursor, s)).toThrow(InvalidCursorError);

describe('decision cursor', () => {
  it('round-trips the position to the microsecond', () => {
    expect(decodeDecisionCursor(encodeDecisionCursor(position, scope), scope)).toEqual(position);
  });

  it('is base64url only, with no padding', () => {
    expect(encodeDecisionCursor(position, scope)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts the investigation filter in any case, and nothing else of another scope', () => {
    const cursor = encodeDecisionCursor(position, scope);
    expect(decodeDecisionCursor(cursor, { ...scope, investigationId: scope.investigationId!.toUpperCase() })).toEqual(position);
    refused(cursor, { ...scope, investigationId: randomUUID() });
    refused(cursor, { ...scope, investigationId: undefined });
    refused(cursor, { ...scope, investigationId: '' });
    refused(cursor, { ...scope, userId: randomUUID() });
    refused(cursor, { ...scope, workspaceId: randomUUID() });
    refused(encodeDecisionCursor(position, { ...scope, investigationId: undefined }), { ...scope, investigationId: '' });
  });

  it('refuses every malformed form', () => {
    const good = encodeDecisionCursor(position, scope);
    const body = JSON.parse(Buffer.from(good, 'base64url').toString('utf8')) as Record<string, unknown>;
    for (const cursor of [
      '',
      'abc',
      `${good}=`,
      good.toUpperCase(),
      'A'.repeat(600),
      json(null),
      json([]),
      json({ ...body, v: 2 }),
      json({ ...body, extra: 1 }),
      json({ ...body, t: '2026-02-30T10:00:00.000000Z' }),
      json({ ...body, t: '0000-01-01T00:00:00.000000Z' }),
      json({ ...body, t: '2026-11-25T12:00:00.123Z' }),
      json({ ...body, id: String(body['id']).toUpperCase() }),
      json({ ...body, id: 'x' }),
      json({ s: body['s'], t: body['t'], id: body['id'], v: body['v'] }),
    ]) refused(cursor);
  });

  it('refuses to encode an invalid position', () => {
    expect(() => encodeDecisionCursor({ ...position, at: '2026-11-25T12:00:00.123Z' }, scope)).toThrow(TypeError);
    expect(() => encodeDecisionCursor({ ...position, id: 'x' }, scope)).toThrow(TypeError);
  });
});

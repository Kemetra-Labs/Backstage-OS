// BACK-172 G1: the audit correlation id is always server generated (unit level; the database side is
// request-id-audit-db.spec.ts).
import { requestIdMiddleware, type RequestWithId } from '../../src/http/request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function run(header: string | string[] | undefined) {
  const req: RequestWithId = { headers: header === undefined ? {} : { 'x-request-id': header } };
  const headers: Record<string, string> = {};
  requestIdMiddleware(req, { setHeader: (n, v) => void (headers[n] = v), status: () => ({ json: () => undefined }) }, () => undefined);
  return { req, headers };
}

describe('requestIdMiddleware', () => {
  it('always uses a fresh server UUID, even for a well-formed client id, and never echoes the client value', () => {
    const { req, headers } = run('client-req-12345');
    expect(req.requestId).toMatch(UUID);
    expect(headers['x-request-id']).toBe(req.requestId);
    expect(headers['x-request-id']).not.toBe('client-req-12345');
    expect(req.clientRequestId).toBe('client-req-12345');
  });

  it('keeps a client id only when it passes the format check', () => {
    for (const bad of ['short', 'a'.repeat(65), 'has space in it', 'semi;colon-1234', ['client-req-12345', 'client-req-67890']]) {
      const { req } = run(bad);
      expect(req.clientRequestId).toBeUndefined();
      expect(req.requestId).toMatch(UUID);
    }
    expect(run(undefined).req.clientRequestId).toBeUndefined();
  });

  it('gives each request its own id', () => {
    expect(run('client-req-12345').req.requestId).not.toBe(run('client-req-12345').req.requestId);
  });
});

import { isErrorEnvelope } from '../../src/errors/envelope';
import {
  SAFE_MESSAGES,
  STATUS_FOR,
  requestIdFrom,
  safeErrorEnvelope,
  type SafeErrorCode,
} from '../../src/errors/safe-error';

const codes = Object.keys(SAFE_MESSAGES) as SafeErrorCode[];

describe('safeErrorEnvelope', () => {
  it('returns the fixed message and no details for every code', () => {
    for (const code of codes) {
      const env = safeErrorEnvelope(code, 'req-1234abcd');
      expect(env.error.code).toBe(code);
      expect(env.error.message).toBe(SAFE_MESSAGES[code]);
      expect(env.error.request_id).toBe('req-1234abcd');
      expect('details' in env.error).toBe(false);
      expect(isErrorEnvelope(env)).toBe(true);
    }
  });

  it('does not offer forbidden or unauthorized', () => {
    expect(Object.keys(SAFE_MESSAGES).sort()).toEqual([
      'internal_error',
      'not_found',
      'rate_limited',
      'validation_error',
    ]);
    expect(Object.keys(STATUS_FOR).sort()).toEqual(Object.keys(SAFE_MESSAGES).sort());
  });

  it('maps codes to HTTP statuses', () => {
    expect(STATUS_FOR).toEqual({
      not_found: 404,
      validation_error: 400,
      rate_limited: 429,
      internal_error: 500,
    });
  });
});

describe('requestIdFrom', () => {
  it('keeps a well-formed id', () => {
    expect(requestIdFrom('req-1234abcd')).toBe('req-1234abcd');
  });

  it('rejects CR/LF, too long, too short, arrays and undefined', () => {
    const bad: Array<string | string[] | undefined> = [
      'abc\r\nSet-Cookie: x=1',
      'req-1234abcd\n',
      'a'.repeat(65),
      'short',
      ['req-1234abcd', 'req-5678efgh'],
      undefined,
    ];
    for (const input of bad) {
      const out = requestIdFrom(input);
      expect(out).toMatch(/^[0-9a-f-]{36}$/);
      expect(out).not.toEqual(input);
    }
  });
});

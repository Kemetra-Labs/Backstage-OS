// BACK-172 G2: the write limiter, unit level.
import { WriteRateLimiter, WRITE_LIMIT_PER_MINUTE, writeLimitKey } from '../../src/http/write-rate-limiter';

describe('WriteRateLimiter', () => {
  it('allows 30 per 60 s per key and refuses the 31st', () => {
    let now = 0;
    const l = new WriteRateLimiter(() => now);
    expect(WRITE_LIMIT_PER_MINUTE).toBe(30);
    for (let i = 0; i < 30; i++) expect(l.tryAcquire('k')).toBe(true);
    expect(l.tryAcquire('k')).toBe(false);
    now = 59_999;
    expect(l.tryAcquire('k')).toBe(false);
    now = 60_000;
    expect(l.tryAcquire('k')).toBe(true);
  });

  it('keys by workspace, user and action, so another principal, workspace or action is unaffected', () => {
    const l = new WriteRateLimiter(() => 0);
    for (let i = 0; i < 30; i++) l.tryAcquire(writeLimitKey('w1', 'u1', 'decision.create'));
    expect(l.tryAcquire(writeLimitKey('w1', 'u1', 'decision.create'))).toBe(false);
    expect(l.tryAcquire(writeLimitKey('w1', 'u2', 'decision.create'))).toBe(true);
    expect(l.tryAcquire(writeLimitKey('w2', 'u1', 'decision.create'))).toBe(true);
    expect(l.tryAcquire(writeLimitKey('w1', 'u1', 'note.create'))).toBe(true);
  });

  it('keeps a bounded map: ended windows are swept and the key count has a hard cap (fail closed)', () => {
    let now = 0;
    const l = new WriteRateLimiter(() => now, 30, 5);
    for (let i = 0; i < 5; i++) expect(l.tryAcquire(`k${i}`)).toBe(true);
    expect(l.tryAcquire('another')).toBe(false); // full: a new key is refused, never stored
    expect(l.size()).toBe(5);
    expect(l.tryAcquire('k0')).toBe(true); // an existing key still counts normally
    now = 60_000;
    expect(l.tryAcquire('another')).toBe(true); // the ended windows were swept
    expect(l.size()).toBe(1);
  });
});

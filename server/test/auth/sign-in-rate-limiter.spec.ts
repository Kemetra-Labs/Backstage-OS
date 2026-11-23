import { SignInRateLimiter } from '../../src/auth/sign-in-rate-limiter';
import { FakeClock } from './_helpers';

describe('SignInRateLimiter', () => {
  it('allows the limit within one minute, refuses the next', () => {
    const clock = new FakeClock();
    const limiter = new SignInRateLimiter(clock.now, 3);
    expect([1, 2, 3].map(() => limiter.tryAcquire('a'))).toEqual([true, true, true]);
    expect(limiter.tryAcquire('a')).toBe(false);
  });

  it('a new window starts 60 s after the first attempt', () => {
    const clock = new FakeClock();
    const limiter = new SignInRateLimiter(clock.now, 1);
    expect(limiter.tryAcquire('a')).toBe(true);
    clock.advance(59_999);
    expect(limiter.tryAcquire('a')).toBe(false);
    clock.advance(1);
    expect(limiter.tryAcquire('a')).toBe(true);
  });

  it('keys are independent', () => {
    const limiter = new SignInRateLimiter(new FakeClock().now, 1);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);
    expect(limiter.tryAcquire('b')).toBe(true);
  });

  it('memory stays bounded: expired keys are dropped', () => {
    const clock = new FakeClock();
    const limiter = new SignInRateLimiter(clock.now, 5);
    for (let i = 0; i < 1000; i++) limiter.tryAcquire(`k${i}`);
    expect(limiter.size()).toBe(1000);
    clock.advance(61_000);
    limiter.tryAcquire('fresh');
    expect(limiter.size()).toBe(1);
  });
});

// BACK-154: a per-user rate limit does not bound how many memory reads run at once. A fixed number of
// slots does: past it, a read is refused at once instead of queueing for a pooled connection.
import { COGNITION_READS_IN_FLIGHT, ReadSlots } from '../../src/cognition/read-slots';

describe('read slots', () => {
  it('grants up to max, refuses past it, and frees a slot on release', () => {
    const s = new ReadSlots(2);
    expect([s.tryAcquire(), s.tryAcquire(), s.tryAcquire()]).toEqual([true, true, false]);
    expect(s.inFlight).toBe(2);
    s.release();
    expect(s.inFlight).toBe(1);
    expect(s.tryAcquire()).toBe(true);
  });

  it('a release without a slot never goes below zero', () => {
    const s = new ReadSlots(1);
    s.release();
    expect(s.inFlight).toBe(0);
    expect([s.tryAcquire(), s.tryAcquire()]).toEqual([true, false]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses a max of %p', (max) => {
    expect(() => new ReadSlots(max)).toThrow(RangeError);
  });

  it('the cognition cap stays below the app pool of 10 connections', () => {
    expect(COGNITION_READS_IN_FLIGHT).toBeGreaterThan(0);
    expect(COGNITION_READS_IN_FLIGHT).toBeLessThan(10);
  });
});

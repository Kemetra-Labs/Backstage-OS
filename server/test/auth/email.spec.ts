import { isAsciiEmail } from '../../src/auth/email';

describe('isAsciiEmail', () => {
  it('accepts ordinary ASCII addresses', () => {
    for (const v of ['owner@example.test', 'O.wner+tag@sub.example.co']) expect(isAsciiEmail(v)).toBe(true);
  });

  it('refuses non-ASCII, missing or repeated @, and dotless or dot-edged domains', () => {
    for (const v of ['Kate@example.test', 'owner', '@example.test', 'a@b@example.test', 'a@localhost', 'a@.example', 'a@example.', 'a b@example.test', '']) {
      expect(isAsciiEmail(v)).toBe(false);
    }
  });

  it('stays fast on long adversarial input (no backtracking)', () => {
    const start = Date.now();
    isAsciiEmail(`${'a'.repeat(300)}@${'.'.repeat(15)}`);
    isAsciiEmail('a@' + 'a.'.repeat(150) + '!');
    expect(Date.now() - start).toBeLessThan(50);
  });
});

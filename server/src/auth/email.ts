// ASCII-only email check (BACK-56), linear time: no backtracking regex.
// ASCII is checked on the raw value, before any lower-casing (toLowerCase folds some
// non-ASCII characters, such as U+212A, into ASCII).
const PRINTABLE_ASCII = /^[\x21-\x7e]{3,320}$/;

export function isAsciiEmail(value: string): boolean {
  if (!PRINTABLE_ASCII.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  return domain.length >= 3 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

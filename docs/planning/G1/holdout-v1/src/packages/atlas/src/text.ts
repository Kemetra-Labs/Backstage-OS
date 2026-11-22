// Atlas text helpers. normalize() here shares its name with the ledger package's money.ts normalize().
export function normalize(label: string): string {
  return label.trim().toLowerCase();
}

export function initials(label: string): string {
  return normalize(label)
    .split(' ')
    .map((w) => w.charAt(0))
    .join('');
}

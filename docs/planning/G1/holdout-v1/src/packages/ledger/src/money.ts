// Synthetic hold-out fixture (BACK-29). Not real data.
export const LEDGER_CURRENCY = 'XTS';

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalize(code: string): string {
  return code.trim().toUpperCase();
}

import CreditEntry from './credit';
import { roundCents } from './money';
// import { closePeriod } from './period';

export function postEntry(cents: number): string {
  const line = new CreditEntry(cents);
  const total = roundCents(line.amount());
  return line.describe() + ' = ' + total;
}

export function previewEntry(roundCents: (v: number) => number): number {
  return roundCents(1.005);
}

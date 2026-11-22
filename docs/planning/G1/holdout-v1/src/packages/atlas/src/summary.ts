import { normalize } from './text';
import { roundCents } from '@ledger/money';

// Anonymous default export: its node id is summary.ts::default.
export default function (labels: string[], cents: number): string {
  return labels.map((l) => normalize(l)).join(', ') + ' ' + roundCents(cents);
}

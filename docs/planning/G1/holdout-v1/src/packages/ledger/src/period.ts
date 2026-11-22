import { auditTrail } from './audit';
import { postEntry } from './journal';

@auditTrail
export class PeriodCloser {
  close(cents: number[]): string[] {
    return cents.map((c) => postEntry(c));
  }
}

export function closePeriod(cents: number[]): string[] {
  return new PeriodCloser().close(cents);
}

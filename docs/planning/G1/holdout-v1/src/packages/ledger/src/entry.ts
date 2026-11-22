// Base class for ledger lines (inheritance case).
export class BaseEntry {
  constructor(protected readonly cents: number) {}

  amount(): number {
    return this.cents / 100;
  }

  describe(): string {
    return `entry ${this.amount()}`;
  }
}

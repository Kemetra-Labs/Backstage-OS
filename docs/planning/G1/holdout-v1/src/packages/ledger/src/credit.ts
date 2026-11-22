import { BaseEntry } from './entry';

// Default export of a subclass. describe() overrides the base method and reaches it through super.
export default class CreditEntry extends BaseEntry {
  describe(): string {
    return 'credit ' + super.describe();
  }
}

// FIXTURE CASE: ESM named import with cross-file calls, a type-only import, a class method call,
// and a commented-out import (negative).
import { computeTotal, Cart } from './pricing';
import type { OrderDraft } from './types';
// import { formatMoney } from './format';

export function buildOrder(draft: OrderDraft): number {
  const cart = new Cart();
  for (const item of draft.items) {
    cart.addItem(item.sku, item.qty, item.unitPrice);
  }
  return computeTotal(draft.items);
}

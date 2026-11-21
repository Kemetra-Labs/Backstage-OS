// FIXTURE CASE: types-only module; target of a type-only import (erased at runtime).
export interface OrderItem {
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface OrderDraft {
  customerId: string;
  items: OrderItem[];
}

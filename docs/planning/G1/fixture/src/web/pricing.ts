// FIXTURE CASE: leaf module. Exported function and a class whose method is called from another file.
const TAX_RATE = 0.2;

export function computeTotal(items: { unitPrice: number; qty: number }[]): number {
  let sum = 0;
  for (const it of items) {
    sum += it.unitPrice * it.qty;
  }
  return sum * (1 + TAX_RATE);
}

export class Cart {
  private lines: { sku: string; qty: number; unitPrice: number }[] = [];

  addItem(sku: string, qty: number, unitPrice: number): number {
    this.lines.push({ sku, qty, unitPrice });
    return this.lines.length;
  }
}

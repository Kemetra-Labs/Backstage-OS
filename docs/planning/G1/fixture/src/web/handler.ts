// FIXTURE CASE: TypeScript handler that serves POST /orders. The Python gateway calls this path over
// HTTP; that relation is cross-runtime and not statically verifiable.
import { buildOrder } from './orders';

export const ORDERS_ROUTE = '/orders';

export function createOrderHandler(req: { body: any }, res: { json(v: unknown): void }) {
  res.json({ total: buildOrder(req.body) });
}

// FIXTURE CASE: .tsx component that consumes a module through the barrel, plus a string literal
// that looks like an import (negative) and an external package import (out of scope).
import React from 'react';
import { buildOrder } from './index';

const DOC_EXAMPLE = "import { createOrderHandler } from './handler'";

export function OrderList(props: { drafts: { customerId: string; items: [] }[] }) {
  const totals = props.drafts.map((d) => buildOrder(d));
  return (
    <ul data-doc={DOC_EXAMPLE}>
      {totals.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

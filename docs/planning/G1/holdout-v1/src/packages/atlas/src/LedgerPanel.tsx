import { useState } from 'react';
import { postEntry } from '@ledger/journal';
import { LEDGER_CURRENCY } from '@ledger';
import makeSummary from './summary';
import { initials } from '~atlas/text';

const HELP_TEXT = "import { closePeriod } from '@ledger/period'";

export default function LedgerPanel({ owner }: { owner: string }) {
  const [rows, setRows] = useState<string[]>([]);
  const add = (cents: number) => setRows([...rows, postEntry(cents)]);
  const close = () => fetch('/api/ledger/close', { method: 'POST' });
  return (
    <section title={HELP_TEXT}>
      <h2>{initials(owner)} {LEDGER_CURRENCY}</h2>
      <p>{makeSummary(rows, rows.length)}</p>
      <button onClick={() => add(1250)}>add</button>
      <button onClick={close}>close</button>
    </section>
  );
}

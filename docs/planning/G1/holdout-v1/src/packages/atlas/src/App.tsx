import { createRoot } from 'react-dom/client';
import LedgerPanel from './LedgerPanel';

// Route table: the panel is referenced here, never called.
export const routes = [{ path: '/', view: LedgerPanel }];

export async function openMonthly(): Promise<string> {
  return (await import('./views/monthly')).render();
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(<main data-routes={routes.length} />);
}

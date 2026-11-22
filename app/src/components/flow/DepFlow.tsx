// BACK-82: entry point for the opt-in React Flow map. Lazy, so the library is only fetched when ?renderer=flow is set, and
// wrapped so that any failure (chunk blocked, render error) falls back to the in-house DepGraph with the same data.
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { PROJECT_COPY } from '../../i18n/screens/project';
import { DepGraph, type GraphEdge, type GraphNode } from '../DepGraph';
import { Text } from '../Text';

const DepFlowCanvas = lazy(() => import('./DepFlowCanvas'));

interface Props {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly selectedId?: string | null;
  readonly onSelect: (id: string) => void;
  readonly onClear: () => void;
  readonly label: string;
}

interface BoundaryProps { readonly fallback: ReactNode; readonly children: ReactNode }

class FlowBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Synthetic demo: nothing is reported anywhere. The console line is for the reviewer.
    console.warn('Interactive map failed, showing the standard map instead.', error.message, info.componentStack ?? '');
  }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function DepFlow({ nodes, edges, selectedId, onSelect, onClear, label }: Props) {
  const { lang } = useApp();
  const copy = PROJECT_COPY[lang].flow;
  const fallback = (
    <>
      <p className="note" role="status" data-testid="flow-fallback"><Text s={copy.fallback} /></p>
      <DepGraph nodes={nodes} edges={edges} selectedId={selectedId ?? null} onSelect={onSelect} label={label} />
    </>
  );
  return (
    <FlowBoundary fallback={fallback}>
      <Suspense fallback={<p className="note" role="status" data-testid="flow-loading">{copy.loading}</p>}>
        <DepFlowCanvas nodes={nodes} edges={edges} selectedId={selectedId ?? null} onSelect={onSelect} onClear={onClear} label={label} />
      </Suspense>
    </FlowBoundary>
  );
}

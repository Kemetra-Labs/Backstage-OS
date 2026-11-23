// A failed lazy lens (chunk blocked, render error) shows its fallback and leaves every other screen working. Shared by the
// Mission Map and the Source Observatory lenses (BACK-87, BACK-88).
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { readonly fallback: ReactNode; readonly label: string; readonly children: ReactNode }

export class LensBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Synthetic demo: nothing is reported anywhere. The console line is for the reviewer.
    console.warn(`${this.props.label} failed to load.`, error.message, info.componentStack ?? '');
  }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

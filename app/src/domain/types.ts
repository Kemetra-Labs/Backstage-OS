// Canonical synthetic domain model for the INV-DEMO-7 overlap (BACK-71). V1 and V2 are projections of this one fixture.
// Demo data only: nothing here is live telemetry.
import type {
  Connectivity, EvidenceReference, Freshness, Health, NodeId, SourceAuthority, TruthLabel,
} from '../contract/types';

export type ComponentId = NodeId;

export interface DomainComponent {
  readonly id: ComponentId;
  readonly health: Health;
  readonly connectivity: Connectivity;
  readonly freshness: Freshness;
  /** Evidence ids the claimed health rests on. */
  readonly basis: readonly string[];
  /** Evidence ids the component is backed by. */
  readonly evidence: readonly string[];
  readonly check?: 'failing';
}

export interface DomainDependency {
  readonly from: ComponentId;
  readonly to: ComponentId;
  readonly truth: TruthLabel | 'unknown';
  readonly evidence: readonly string[];
}

export interface DomainFixture {
  readonly investigationId: string;
  readonly now: string;
  readonly sources: readonly SourceAuthority[];
  readonly evidence: Readonly<Record<string, EvidenceReference>>;
  readonly components: readonly DomainComponent[];
  readonly dependencies: readonly DomainDependency[];
}

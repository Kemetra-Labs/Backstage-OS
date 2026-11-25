// BACK-84: the runtime authority for which canonical records a persona may read. Both consumers (host view/authorize.ts and lens
// lenses/logic/authorize.ts) ask this module about the INV-DEMO-7 overlap instead of applying their own visibility rule to it.
// Persona is a display switch, not authorization: this scopes synthetic demo data only, and no server-side identity, tenant or
// X02/X04 enforcement exists or is claimed.
//
// One decision per record. An id the canonical fixture owns is 'visible' or 'withheld' according to scopeFixture and nothing else;
// an id it does not own is 'foreign', and the caller's own rule still decides it (host isWithheld, lens keepRef). So no overlap record
// is filtered twice, and disabling scopeFixture changes what both consumers show.
import type { Persona } from '../contract/types';
import { DOMAIN } from './fixture';
import { scopeFixture } from './scope';
import type { DomainComponent, DomainDependency, DomainFixture } from './types';

export type EvidenceVerdict = 'visible' | 'withheld' | 'foreign';

export type DependencyVerdict =
  | { readonly kind: 'foreign' }
  | { readonly kind: 'withheld' }
  | { readonly kind: 'visible'; readonly dependency: DomainDependency };

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The canonical fixture as this persona may read it. The one place the runtime scopes it. */
export const canonicalFor = (persona: Persona): DomainFixture => scopeFixture(DOMAIN, persona);

export function evidenceVerdict(persona: Persona, id: string): EvidenceVerdict {
  if (!has(DOMAIN.evidence, id)) return 'foreign';
  return has(canonicalFor(persona).evidence, id) ? 'visible' : 'withheld';
}

/** The scoped canonical component, or undefined when the canonical fixture does not own this id. */
export const canonicalComponent = (persona: Persona, id: string): DomainComponent | undefined =>
  DOMAIN.components.some((c) => c.id === id) ? canonicalFor(persona).components.find((c) => c.id === id) : undefined;

export function dependencyVerdict(persona: Persona, from: string, to: string): DependencyVerdict {
  const owns = DOMAIN.dependencies.some((d) => d.from === from && d.to === to);
  if (!owns) return { kind: 'foreign' };
  const seen = canonicalFor(persona).dependencies.find((d) => d.from === from && d.to === to);
  return seen ? { kind: 'visible', dependency: seen } : { kind: 'withheld' };
}

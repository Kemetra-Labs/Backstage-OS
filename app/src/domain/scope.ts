// Persona scoping of the canonical fixture. Persona is a display switch, not authorization: this scopes the synthetic demo
// data only, and no server-side identity, tenant or access enforcement exists or is claimed. Rules mirror lens authorizedWorld.
import type { EvidenceReference, Persona } from '../contract/types';
import type { DomainComponent, DomainDependency, DomainFixture } from './types';

const memo = new WeakMap<DomainFixture, Map<Persona, DomainFixture>>();

const keepRef = (r: EvidenceReference): boolean => r.visibility !== 'technical';

function scopeComponent(c: DomainComponent, visible: (id: string) => boolean): DomainComponent {
  const basis = c.basis.filter(visible);
  const evidence = c.evidence.filter(visible);
  // A claim that rested only on withheld evidence is unknown, never healthy. Components carry no provider, so freshness has
  // no authorized source to fall back to.
  const lostBasis = c.basis.length > 0 && basis.length === 0;
  return { ...c, basis, evidence, ...(lostBasis ? { health: 'unknown' as const, freshness: 'unknown' as const } : {}) };
}

function scopeDependency(d: DomainDependency, visible: (id: string) => boolean): DomainDependency {
  return { ...d, evidence: d.evidence.filter(visible) };
}

function build(f: DomainFixture): DomainFixture {
  const evidence = Object.fromEntries(Object.entries(f.evidence).filter(([, r]) => keepRef(r)));
  const visible = (id: string): boolean => evidence[id] !== undefined;
  return {
    ...f,
    evidence,
    components: f.components.map((c) => scopeComponent(c, visible)),
    // A link whose only evidence was withheld is removed. Links that never had evidence stay.
    dependencies: f.dependencies.filter((d) => d.evidence.length === 0 || d.evidence.some(visible)).map((d) => scopeDependency(d, visible)),
  };
}

/** The fixture as this persona may see it. Technical gets the input itself. */
export function scopeFixture(f: DomainFixture, persona: Persona): DomainFixture {
  if (persona === 'technical') return f;
  let byPersona = memo.get(f);
  if (!byPersona) { byPersona = new Map(); memo.set(f, byPersona); }
  let scoped = byPersona.get(persona);
  if (!scoped) { scoped = build(f); byPersona.set(persona, scoped); }
  return scoped;
}

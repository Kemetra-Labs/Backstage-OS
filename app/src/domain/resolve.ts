import type { EvidenceReference } from '../contract/types';
import type { DomainFixture } from './types';

/** Resolve evidence ids to the fixture's evidence objects, skipping ids it does not hold. */
export const resolveEvidence = (f: DomainFixture, ids: readonly string[]): EvidenceReference[] =>
  ids.flatMap((id) => { const e = f.evidence[id]; return e ? [e] : []; });

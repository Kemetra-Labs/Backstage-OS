// Test-only: a policy that approves ANY identity for ANY project key, for the tests that exercise generic
// multi-source behaviour and do not care about the approved-identity rule (BACK-131). It lives under test/ and
// is never imported by src/ (source-callers.guard.spec.ts enforces that).
//
// The policy port returns a list of identities, so "every identity" cannot be enumerated. The repository checks
// membership only through `.some(...)` (see isApproved in evidence.repository.ts); this list answers every such
// check with true. Production code has no wildcard: the configured policy returns plain arrays.
import type { SourceApprovalPolicy, SourceIdentity } from '../../src/evidence/source-approval';

class EveryIdentity extends Array<SourceIdentity> {
  override some(): boolean {
    return true;
  }
}

export function approveAll(): SourceApprovalPolicy {
  return { approvedIdentities: () => new EveryIdentity() };
}

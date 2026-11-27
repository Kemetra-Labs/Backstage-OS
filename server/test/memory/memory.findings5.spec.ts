// COG-08 seventh review (Codex, 2026-11-27, commit 6feac1b) regression for COG-02: the as-of view's known
// times changed without a policy-version bump and without entering the fingerprint, so validateAtRead
// accepted a projection whose cited known times had changed. Failed on 6feac1b.
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { MEMORY_POLICY_VERSION } from '../../src/memory/memory.policy';
import { at, repo, request } from './memory.fixture';

describe('the fingerprint covers the current run known times', () => {
  it('a change only in the first row receipt changes the fingerprint', () => {
    const req = request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') });
    const rows = (firstReceived: string) => [repo({}, { id: 'a', observedAt: at('11:40'), receivedAt: firstReceived }), repo({}, { id: 'b', observedAt: at('11:55'), receivedAt: at('11:56') })];
    const before = project(rows(at('11:41')), req);
    expect(validateAtRead(before, rows(at('11:58')), req)).toBe(false);
  });

  it('the policy version records the change', () => {
    // v3 or later: the change is recorded, whatever later changes add.
    expect(['memory-v1', 'memory-v2']).not.toContain(MEMORY_POLICY_VERSION);
  });
});

// COG-08 eighth review (Codex, 2026-11-27, commit d8f8a02) regression for COG-02: the known times of the
// returned history runs were not in the fingerprint, though retrieval uses firstKnownAt to choose the
// fallback text when there is no current revision. Failed on d8f8a02.
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { MEMORY_POLICY_VERSION } from '../../src/memory/memory.policy';
import { at, ghIssue, request } from './memory.fixture';

describe('the fingerprint covers returned history known times', () => {
  it('a receipt change inside a history run changes the fingerprint', () => {
    const req = request({ effectiveAt: at('12:00'), knownAt: at('12:00'), evaluationAt: at('12:00') });
    // A conflict (same updatedAt, different titles): no current run, so history drives retrieval's fallback.
    const rows = (laterReceipt: string) => [
      ghIssue(9, { updatedAt: at('11:00'), title: 'alpha' }, { id: 'k1', observedAt: at('11:40'), receivedAt: at('11:40') }),
      ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'k2', observedAt: at('11:45'), receivedAt: at('11:45') }),
      ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'k3', observedAt: at('11:50'), receivedAt: laterReceipt }),
    ];
    const before = project(rows(at('11:51')), req);
    expect(before.items[0]!.current).toBeNull();
    expect(validateAtRead(before, rows(at('11:44')), req)).toBe(false);
  });

  it('the policy version records the change', () => {
    expect(MEMORY_POLICY_VERSION).toBe('memory-v4');
  });
});

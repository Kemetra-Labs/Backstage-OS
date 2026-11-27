// COG-08 ninth review (Codex, 2026-11-27, commit 896dc43) regression for COG-02: the observation times of
// returned history runs were not in the fingerprint, so a changed observation time (which search reports
// as lastObservedAt) passed validateAtRead in the pure projector. Failed on 896dc43.
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { at, ghIssue, request } from './memory.fixture';

describe('the fingerprint covers returned history observation times', () => {
  it('a changed last observation time inside a history run changes the fingerprint', () => {
    const req = request();
    const rows = (lastObserved: string) => [
      ghIssue(9, { updatedAt: at('11:00'), title: 'alpha' }, { id: 'a1', observedAt: at('11:40'), receivedAt: at('11:40') }),
      ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'b1', observedAt: at('11:45'), receivedAt: at('11:52') }),
      ghIssue(9, { updatedAt: at('11:00'), title: 'beta' }, { id: 'b2', observedAt: lastObserved, receivedAt: at('11:53') }),
    ];
    const before = project(rows(at('11:50')), req);
    expect(before.items[0]!.current).toBeNull();
    expect(validateAtRead(before, rows(at('11:49')), req)).toBe(false);
  });
});

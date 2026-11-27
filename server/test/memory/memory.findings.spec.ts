// COG-08 independent review (Codex, 2026-11-27, commit 96878ac) regression for COG-02 (BACK-105 D5):
// a late, identical observation merged into the current run outside the returned history changed the
// run's first evidence id (which COG-04 cites) without changing the fingerprint. Failed on 96878ac.
import { project, validateAtRead } from '../../src/memory/memory.projector';
import { at, jiraIssue, request } from './memory.fixture';

describe('Codex Medium: the fingerprint covers the cited current run even outside returned history', () => {
  it('validateAtRead detects a late commit that extends the current run backwards', () => {
    const req = request({ historyCap: 1, effectiveAt: at('12:00'), knownAt: at('12:00'), evaluationAt: at('12:00') });
    const current = jiraIssue('BACK-1', { updatedAt: at('11:00') }, { id: 'a', observedAt: at('11:55') });
    const lagging = jiraIssue('BACK-1', { updatedAt: at('10:00') }, { id: 'b', observedAt: at('11:58') });
    const before = project([current, lagging], req);
    expect(before.items[0]!.current!.firstEvidenceId).toBe('a');
    expect(before.items[0]!.history.map((r) => r.firstEvidenceId)).toEqual(['b']); // current is outside the cap

    const late = jiraIssue('BACK-1', { updatedAt: at('11:00') }, { id: 'c', observedAt: at('11:52') });
    const after = project([late, current, lagging], req);
    expect(after.items[0]!.current!.firstEvidenceId).toBe('c');
    expect(validateAtRead(before, [late, current, lagging], req)).toBe(false);
  });
});

// COG-08 fifth review (Codex, 2026-11-27, commit 43ab9f0) regressions for COG-02: a historical repository
// read compared failure markers with the run's last observation (after E), so a failed read before E was
// ignored; an exact-first read reported the run's earliest receipt instead of the first row's; and the
// worst state did not follow the shared evidence precedence. Each failed on 43ab9f0.
import { project } from '../../src/memory/memory.projector';
import { at, GH, REPO, repo, request, status } from './memory.fixture';

describe('a historical repository read sees failures before E', () => {
  it('ok 11:40, failed read 11:43, ok 11:55; read at 11:45 is unknown', () => {
    const rows = [
      repo({}, { id: 'a', observedAt: at('11:40') }),
      status(GH, REPO, 'error', 'timeout', { id: 'f', observedAt: at('11:43') }),
      repo({}, { id: 'b', observedAt: at('11:55') }),
    ];
    const item = project(rows, request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') })).items[0]!;
    expect(item.status).toBe('unknown');
  });

  it('without the failed read it is verified (control)', () => {
    const rows = [repo({}, { id: 'a', observedAt: at('11:40') }), repo({}, { id: 'b', observedAt: at('11:55') })];
    expect(project(rows, request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') })).items[0]!.status).toBe('verified');
  });
});

describe('the run as known by E carries the first row, not run-wide aggregates', () => {
  it('an exact-first read reports the first row receipt as its known time', () => {
    const rows = [
      repo({}, { id: 'a', observedAt: at('11:40'), receivedAt: at('11:58') }),
      repo({}, { id: 'b', observedAt: at('11:55'), receivedAt: at('11:56') }),
    ];
    const item = project(rows, request({ effectiveAt: at('11:40'), knownAt: at('12:00'), evaluationAt: at('11:41') })).items[0]!;
    expect(item.current).toMatchObject({ firstEvidenceId: 'a', lastEvidenceId: 'a', lastKnownAt: at('11:58') });
  });

  it('the worst state follows the shared evidence precedence (denied over error)', () => {
    const rows = [
      repo({}, { id: 'a', observedAt: at('11:40'), state: 'error' }),
      repo({}, { id: 'b', observedAt: at('11:50'), state: 'denied' }),
      repo({}, { id: 'c', observedAt: at('11:55') }),
    ];
    const item = project(rows, request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') })).items[0]!;
    expect(item).toMatchObject({ status: 'unknown', reason: 'row-state-denied' });
  });
});

// COG-08 fourth review (Codex, 2026-11-27, commit 827a210) regression for COG-02: a historical read of a
// repository record (no provider order) inside a run reported the run's last observation, made after
// the effective time, so a stale-then-ok run read as verified at E and cited a later row. Failed on 827a210.
import { project } from '../../src/memory/memory.projector';
import type { MemoryRow } from '../../src/memory/memory.types';
import { at, repo, request } from './memory.fixture';

const readAt1145 = (rows: MemoryRow[]) => project(rows, request({ effectiveAt: at('11:45'), knownAt: at('12:00'), evaluationAt: at('11:46') })).items[0]!;

describe('a repository read inside a run is the run as known by the effective time', () => {
  it('stale at 11:40 then ok at 11:55, read at 11:45: stale, citing only the 11:40 row', () => {
    const item = readAt1145([repo({}, { id: 'a', observedAt: at('11:40'), state: 'stale' }), repo({}, { id: 'b', observedAt: at('11:55') })]);
    expect(item.status).toBe('stale');
    expect(item.current).toMatchObject({ firstEvidenceId: 'a', lastEvidenceId: 'a', lastObservedAt: at('11:40') });
  });

  it('ok at both, read at 11:45: verified, still citing only the 11:40 row (control)', () => {
    const item = readAt1145([repo({}, { id: 'a', observedAt: at('11:40') }), repo({}, { id: 'b', observedAt: at('11:55') })]);
    expect(item.status).toBe('verified');
    expect(item.current).toMatchObject({ firstEvidenceId: 'a', lastEvidenceId: 'a' });
  });

  it('read after the whole run: the latest observation, as before (control)', () => {
    const item = project(
      [repo({}, { id: 'a', observedAt: at('11:40'), state: 'stale' }), repo({}, { id: 'b', observedAt: at('11:55') })],
      request({ effectiveAt: at('12:00'), knownAt: at('12:00'), evaluationAt: at('12:00') }),
    ).items[0]!;
    expect(item.status).toBe('verified');
    expect(item.current).toMatchObject({ lastEvidenceId: 'b' });
  });
});

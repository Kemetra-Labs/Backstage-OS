// COG-08 fourth review (Codex, 2026-11-27, commit 827a210), observer side: a title clipped to 300
// characters cut `#1234` to `#123`, and retrieval linked the wrong PR. Observers now flag clipped text
// (`textClipped: true`) so retrieval can ignore a mention at the cut. Failed on 827a210.
import { randomUUID } from 'node:crypto';
import { observeRepository } from '../../../src/connectors/github/github.observer';
import { project } from '../../../src/memory/memory.projector';
import type { MemoryRow } from '../../../src/memory/memory.types';
import { relationships } from '../../../src/retrieval/retrieval.relations';
import { at, GH, pr, request } from '../../memory/memory.fixture';
import { happyScript, OWNER_REPO, ok, ScriptedTransport } from './github.fixture';

const now = new Date('2026-11-25T11:55:00Z');

async function observed(title: string): Promise<MemoryRow> {
  const script = happyScript();
  script[`/repos/${OWNER_REPO}/pulls`] = ok([{ number: 1, title, state: 'open', draft: false, updated_at: '2026-11-25T11:00:00Z', html_url: null }]);
  const items = await observeRepository(new ScriptedTransport(script), { sourceId: randomUUID(), externalRef: OWNER_REPO }, now);
  const o = items.find((i) => i.payload['kind'] === 'pull_request')!;
  return { id: 'p1', sourceId: GH, type: 'Observation', state: o.state, sourceRef: o.sourceRef, observedAt: now.toISOString(), receivedAt: now.toISOString(), payload: o.payload };
}

describe('clipped titles are flagged and never yield a mention at the cut', () => {
  it('a long title is clipped and flagged; a short one is not flagged', async () => {
    const long = await observed(`${'x'.repeat(295)} #1234`);
    expect((long.payload['title'] as string).endsWith(' #123')).toBe(true);
    expect(long.payload['textClipped']).toBe(true);
    expect((await observed('short #1234')).payload['textClipped']).toBe(false);
  });

  it('end to end: the clipped #1234 does not link PR 123', async () => {
    const target = pr(123, { title: 'target', updatedAt: at('11:00') }, { id: 'p123', observedAt: at('11:55') });
    const rel = relationships(project([await observed(`${'x'.repeat(295)} #1234`), target], request()));
    expect(rel.edges.filter((e) => e.type === 'mentions')).toEqual([]);
  });
});

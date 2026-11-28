// COG-08 second independent review (Codex, 2026-11-27, commit b980034), High: the observer stored a
// missing or malformed `draft` flag as `false`, so a pending task needing an open PR was recommended.
// The flag is now kept only when the provider sent a boolean; anything else is stored as null, which
// COG-04 treats as no-value. End to end: observer -> memory projection -> reasoning. Failed on b980034.
import { randomUUID } from 'node:crypto';
import { observeRepository } from '../../../src/connectors/github/github.observer';
import { project } from '../../../src/memory/memory.projector';
import type { MemoryRow } from '../../../src/memory/memory.types';
import { evaluate } from '../../../src/reasoning/reasoning.evaluator';
import { at, GH, JIRA, jiraIssue, request } from '../../memory/memory.fixture';
import { happyScript, OWNER_REPO, REPO_ID, ok, ScriptedTransport } from './github.fixture';

const now = new Date('2026-11-25T11:55:00Z');
const pullsWith = (draft: unknown) => {
  const script = happyScript();
  const pr: Record<string, unknown> = { number: 12, title: 'A PR', state: 'open', updated_at: '2026-11-25T11:00:00Z', html_url: null };
  if (draft !== undefined) pr['draft'] = draft;
  script[`/repos/${OWNER_REPO}/pulls`] = ok([pr]);
  return script;
};

async function observedPr(draft: unknown): Promise<MemoryRow> {
  const items = await observeRepository(new ScriptedTransport(pullsWith(draft)), { sourceId: randomUUID(), externalRef: OWNER_REPO, repositoryId: REPO_ID }, now);
  const pr = items.find((i) => i.payload['kind'] === 'pull_request')!;
  return { id: 'p12', sourceId: GH, type: 'Observation', state: pr.state, sourceRef: pr.sourceRef, observedAt: now.toISOString(), receivedAt: now.toISOString(), payload: pr.payload };
}

describe('observer keeps an unknown draft flag unknown', () => {
  it.each([
    ['omitted', undefined, null],
    ['the string "false"', 'false', null],
    ['null', null, null],
    ['a number', 0, null],
    ['true', true, true],
    ['false', false, false],
  ])('draft %s is stored as %p', async (_n, sent, stored) => {
    expect((await observedPr(sent)).payload['draft']).toBe(stored);
  });

  it.each([
    ['omitted', undefined, 'unknown'],
    ['the string "false"', 'false', 'unknown'],
    ['explicit false', false, 'ready'],
  ])('end to end: a task needing PR 12 open is %s -> %s', async (_n, sent, state) => {
    const rows = [jiraIssue('BACK-1', { updatedAt: at('11:00'), statusCategory: 'indeterminate' }, { id: 'j1', observedAt: at('11:55') }), await observedPr(sent)];
    const r = evaluate(project(rows, request()), {
      specVersion: 'draft-e2e',
      tasks: [
        {
          id: 'T',
          task: { sourceId: JIRA, sourceRef: 'jira:BACK#issue/BACK-1', kind: 'jira_issue' },
          requirements: [{ id: 'c', kind: 'check', target: { sourceId: GH, sourceRef: `github:${OWNER_REPO}#pull/12`, kind: 'pull_request' }, expected: 'open' }],
        },
      ],
    });
    expect(r.tasks[0]!.state).toBe(state);
  });
});

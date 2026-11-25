// Test-only canned Jira Cloud REST answers and a scripted read transport (BACK-53 mock slice).
// No network: every answer below is synthetic. Shapes follow the public Jira Cloud REST v3 document
// for GET /rest/api/3/search/jql, and deliberately include personal and free-text fields
// (description, assignee, reporter, emailAddress, accountId) so tests can prove they are dropped.
import { searchPath } from '../../../src/connectors/jira/jira.observer';
import { JiraTransportFailure, type JiraReadTransport, type JiraResponse } from '../../../src/connectors/jira/jira.transport';

export const SITE = 'https://kemetra-synthetic.atlassian.net';
export const NOW = new Date('2026-11-25T12:00:00Z');

const person = { accountId: '5b10ac8d82e05b22cc7d4ef5', emailAddress: 'person@example.com', displayName: 'Synthetic Person' };

export const issue = (key: string, over: Record<string, unknown> = {}) => ({
  id: '10001',
  key,
  self: `https://evil.example/rest/api/3/issue/${key}`,
  fields: {
    summary: `Synthetic summary for ${key}`,
    status: { name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    updated: '2026-11-24T08:00:00.000+0000',
    description: 'Private description that must not be stored',
    assignee: person,
    reporter: person,
    ...over,
  },
});

export const backIssues = { issues: [issue('BACK-53'), issue('BACK-52', { status: { statusCategory: { key: 'done' } } })], isLast: true };
export const opsIssues = { issues: [issue('OPS-7', { status: { statusCategory: { key: 'new' } } })], isLast: true };

export type Script = Record<string, JiraResponse | JiraTransportFailure | Error>;

export const ok = (body: unknown, headers: Record<string, string> = {}): JiraResponse => ({ status: 200, body, headers });

/** Answers each full path from the script; records every call so tests can assert what was (not) requested. */
export class ScriptedTransport implements JiraReadTransport {
  readonly calls: string[] = [];
  constructor(private readonly script: Script) {}

  async get(path: string): Promise<JiraResponse> {
    this.calls.push(path);
    const answer = this.script[path];
    if (answer === undefined) throw new Error(`unscripted path ${path}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export const happyScript = (): Script => ({
  [searchPath('BACK')]: ok(backIssues),
  [searchPath('OPS')]: ok(opsIssues),
});

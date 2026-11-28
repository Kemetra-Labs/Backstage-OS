// Test-only canned GitHub REST responses and a scripted read transport (BACK-52 mock slice).
// No network: every response below is synthetic. The shapes follow the public GitHub REST v3
// documents for GET /repos/{owner}/{repo}, /pulls and /issues, and deliberately include
// personal fields (body, user.login, emails, avatar_url) so tests can prove they are dropped.
import { GitHubTransportFailure, type GitHubReadTransport, type GitHubResponse } from '../../../src/connectors/github/github.transport';

export const OWNER_REPO = 'kemetra-labs/backstage-os';
/** The pinned numeric repository id of the synthetic repository (BACK-52 Q); `repoBody.id` carries it. */
export const REPO_ID = 424242;

const person = { login: 'octo-person', id: 1, avatar_url: 'https://avatars.example/u/1', email: 'person@example.com' };

export const repoBody = {
  id: REPO_ID,
  full_name: 'Kemetra-Labs/Backstage-OS',
  private: true,
  default_branch: 'main',
  archived: false,
  pushed_at: '2026-11-24T09:00:00Z',
  owner: person,
  description: 'Private description that must not be stored',
};

export const pullsBody = [
  {
    number: 12,
    title: 'Add the portfolio route',
    state: 'open',
    draft: false,
    updated_at: '2026-11-24T08:00:00Z',
    html_url: 'https://github.com/Kemetra-Labs/Backstage-OS/pull/12',
    body: 'PR body with person@example.com',
    user: person,
  },
];

export const issuesBody = [
  {
    number: 7,
    title: 'Map overlaps at 320 px',
    state: 'open',
    updated_at: '2026-11-23T08:00:00Z',
    html_url: 'https://github.com/Kemetra-Labs/Backstage-OS/issues/7',
    body: 'Issue body',
    user: person,
    assignee: person,
  },
  // The issues endpoint also returns pull requests; the observer must skip these.
  { number: 12, title: 'Add the portfolio route', state: 'open', updated_at: '2026-11-24T08:00:00Z', pull_request: { url: 'x' }, user: person },
];

export type Script = Record<string, GitHubResponse | GitHubTransportFailure | Error>;

export const ok = (body: unknown): GitHubResponse => ({ status: 200, body, headers: {} });

/** Answers each path from the script; records every call so tests can assert what was (not) requested. */
export class ScriptedTransport implements GitHubReadTransport {
  readonly calls: string[] = [];
  constructor(private readonly script: Script) {}

  async get(path: string): Promise<GitHubResponse> {
    this.calls.push(path);
    const key = path.split('?')[0]!;
    const answer = this.script[key];
    if (answer === undefined) throw new Error(`unscripted path ${key}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export const happyScript = (): Script => ({
  [`/repos/${OWNER_REPO}`]: ok(repoBody),
  [`/repos/${OWNER_REPO}/pulls`]: ok(pullsBody),
  [`/repos/${OWNER_REPO}/issues`]: ok(issuesBody),
});

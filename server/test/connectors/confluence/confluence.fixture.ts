// Test-only canned Confluence Cloud REST v2 answers and a scripted read transport (BACK-53 mock
// slice). No network: every answer below is synthetic. Shapes follow the public Confluence v2
// documents for GET /wiki/api/v2/spaces and /spaces/{id}/pages, and deliberately include personal and
// free-text fields (body, authorId, ownerId, version.message) so tests can prove they are dropped.
import { pagesPath, spacePath } from '../../../src/connectors/confluence/confluence.observer';
import {
  ConfluenceTransportFailure,
  type ConfluenceReadTransport,
  type ConfluenceResponse,
} from '../../../src/connectors/confluence/confluence.transport';

export const SITE = 'https://kemetra-synthetic.atlassian.net';
export const NOW = new Date('2026-11-25T12:00:00Z');
export const ENG_ID = '98304';
export const OPS_ID = '98305';

export const space = (key: string, id: string) => ({ results: [{ id, key, name: `Synthetic ${key}`, authorId: '5b10ac8d82e05b22cc7d4ef5' }], _links: {} });

export const page = (id: string, spaceId: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'current',
  title: `Synthetic page ${id}`,
  spaceId,
  authorId: '5b10ac8d82e05b22cc7d4ef5',
  ownerId: '5b10ac8d82e05b22cc7d4ef5',
  body: { storage: { value: '<p>Private body with person@example.com</p>' } },
  version: { number: 3, createdAt: '2026-11-24T08:00:00.000Z', message: 'edited by person@example.com', authorId: '5b10ac8d82e05b22cc7d4ef5' },
  _links: { webui: `/spaces/X/pages/${id}`, base: 'https://evil.example/wiki' },
  ...over,
});

export type Script = Record<string, ConfluenceResponse | ConfluenceTransportFailure | Error>;

export const ok = (body: unknown, headers: Record<string, string> = {}): ConfluenceResponse => ({ status: 200, body, headers });

/** Answers each full path from the script; records every call so tests can assert what was (not) requested. */
export class ScriptedTransport implements ConfluenceReadTransport {
  readonly calls: string[] = [];
  constructor(private readonly script: Script) {}

  async get(path: string): Promise<ConfluenceResponse> {
    this.calls.push(path);
    const answer = this.script[path];
    if (answer === undefined) throw new Error(`unscripted path ${path}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export const happyScript = (): Script => ({
  [spacePath('ENG')]: ok(space('ENG', ENG_ID)),
  [pagesPath(ENG_ID)]: ok({ results: [page('1001', ENG_ID), page('1002', ENG_ID, { version: { number: 1, createdAt: '2026-11-20T08:00:00Z' } })] }),
  [spacePath('OPS')]: ok(space('OPS', OPS_ID)),
  [pagesPath(OPS_ID)]: ok({ results: [page('2001', OPS_ID)] }),
});

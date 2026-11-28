// Grant-guarded refresh runner (BACK-52 slice A) against a real PostgreSQL 18.7 in a disposable container.
// Fakes only: a scripted transport, or a fake fetch behind the real fetch transport and token provider. No network.
import { randomUUID } from 'node:crypto';
import type { GitHubReadTransport, GitHubResponse } from '../../../src/connectors/github/github.transport';
import { githubTransportFactory } from '../../../src/connectors/github/github.wiring';
import { refreshSource, SourceRevokedError, type GitHubTarget } from '../../../src/connectors/github/github.runner';
import { EvidenceRepository } from '../../../src/evidence/evidence.repository';
import { configuredApprovalPolicy, type SourceApprovalPolicy } from '../../../src/evidence/source-approval';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../../db/kawalys-db';
import { makeWorkspace } from '../../db/store-harness';
import { approveAll } from '../../evidence/approve-all-policy';
import { fakeFetch, json } from './fake-fetch';
import { happyScript, OWNER_REPO, REPO_ID, ScriptedTransport } from './github.fixture';
import { makeTestKey } from './test-key';

const FAKE_TOKEN = 'ghs_TESTTOKEN123';
const now = () => new Date('2026-11-28T12:00:00Z');
const approved = (id = REPO_ID) => configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: `backstage-os=github:${OWNER_REPO}#${id}` });

let db: KawalysDb;
let repo: EvidenceRepository;
const owner = randomUUID();
const stranger = randomUUID();

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1), ($2)', [owner, stranger]);
  // Connecting is not under test here: an approve-all repository policy binds the sources; the runner gets its own policy.
  repo = new EvidenceRepository(db.app, approveAll());
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

interface Fresh {
  readonly ws: string;
  readonly sourceId: string;
}

/** A new workspace owned by `owner`, with one project and one connected source of `provider`/`ref`. */
async function fresh(provider: 'github' | 'jira' = 'github', ref = OWNER_REPO): Promise<Fresh> {
  const ws = randomUUID();
  await makeWorkspace(db, ws, owner);
  const projectId = await repo.createProject(ws, owner, { key: 'backstage-os', name: 'Backstage OS' });
  const sourceId = await repo.connectSource(ws, owner, { projectId, provider, externalRef: ref });
  return { ws, sourceId };
}

/** Counts calls and runs a hook after each one. */
class Spy implements GitHubReadTransport {
  readonly inner = new ScriptedTransport(happyScript());
  constructor(private readonly after: (n: number) => Promise<void> = async () => undefined) {}
  get calls(): string[] {
    return this.inner.calls;
  }
  async get(path: string): Promise<GitHubResponse> {
    const res = await this.inner.get(path);
    await this.after(this.inner.calls.length);
    return res;
  }
}

const run = (f: Fresh, over: { spy?: Spy; policy?: SourceApprovalPolicy; actor?: string; workspaceId?: string; sourceId?: string; targets?: GitHubTarget[] } = {}) => {
  const spy = over.spy ?? new Spy();
  const targets = over.targets ?? [];
  const result = refreshSource({
    repo,
    policy: over.policy ?? approved(),
    workspaceId: over.workspaceId ?? f.ws,
    actor: over.actor ?? owner,
    sourceId: over.sourceId ?? f.sourceId,
    makeTransport: (t) => (targets.push(t), spy),
    now,
  });
  return { spy, targets, result };
};

const evidenceCount = async (ws: string): Promise<number> =>
  Number((await db.admin.query('SELECT count(*) AS n FROM kawalys.evidence WHERE workspace_id = $1', [ws])).rows[0].n);

describe('refreshSource', () => {
  it('reads the approved repository and ingests the observations, readable through the evidence list', async () => {
    const f = await fresh();
    const { spy, targets, result } = run(f);
    expect(await result).toEqual({ status: 'ingested', count: 5 });
    expect(targets).toEqual([{ repo: OWNER_REPO, repositoryId: REPO_ID }]);
    expect(spy.calls).toHaveLength(3);
    const listed = await repo.list(f.ws, owner, { sourceId: f.sourceId });
    expect(listed.map((e) => e.sourceRef)).toEqual(expect.arrayContaining([`github:${OWNER_REPO}`, `github:${OWNER_REPO}#pull/12`, `github:${OWNER_REPO}#issue/7`]));
    expect(listed.find((e) => e.sourceRef === `github:${OWNER_REPO}`)!.payload).toMatchObject({ kind: 'repository', repositoryId: REPO_ID });
  });

  it('refuses with zero transport calls (and builds no transport) when the grant was revoked before the run', async () => {
    const f = await fresh();
    await repo.disconnectSource(f.ws, owner, f.sourceId);
    const { spy, targets, result } = run(f);
    expect(await result).toEqual({ status: 'refused' });
    expect(spy.calls).toHaveLength(0);
    expect(targets).toHaveLength(0);
    expect(await evidenceCount(f.ws)).toBe(0);
  });

  it('stops at the next request when the grant is revoked between two calls: result revoked_mid_run, nothing readable', async () => {
    const f = await fresh();
    const spy = new Spy(async (n) => {
      if (n === 1) await repo.disconnectSource(f.ws, owner, f.sourceId);
    });
    const { result } = run(f, { spy });
    expect(await result).toEqual({ status: 'revoked_mid_run' });
    expect(spy.calls).toHaveLength(1); // the repository read only: no pulls, no issues after the revoke
    expect(await evidenceCount(f.ws)).toBe(0);
    expect(await repo.list(f.ws, owner, { sourceId: f.sourceId })).toEqual([]);
  });

  it('a revoke that lands after the last call but before the write still stores nothing', async () => {
    const f = await fresh();
    const spy = new Spy(async (n) => {
      if (n === 3) await repo.disconnectSource(f.ws, owner, f.sourceId);
    });
    const { result } = run(f, { spy });
    expect(await result).toEqual({ status: 'revoked_mid_run' });
    expect(await evidenceCount(f.ws)).toBe(0);
  });

  it.each([
    ['an identity that is not approved at all', () => configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: 'backstage-os=github:kemetra-labs/other#9' })],
    ['an approved name without a pinned id', () => configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: `backstage-os=github:${OWNER_REPO}` })],
    ['an approved identity under another project key', () => configuredApprovalPolicy({ KAWALYS_APPROVED_SOURCES: `other-project=github:${OWNER_REPO}#${REPO_ID}` })],
    ['an empty policy', () => configuredApprovalPolicy({})],
  ])('refuses with zero calls for %s', async (_label, policy) => {
    const f = await fresh();
    const { spy, targets, result } = run(f, { policy: policy() });
    expect(await result).toEqual({ status: 'refused' });
    expect(spy.calls).toHaveLength(0);
    expect(targets).toHaveLength(0);
    expect(await evidenceCount(f.ws)).toBe(0);
  });

  it('refuses for an actor who holds no grant on the source', async () => {
    const f = await fresh();
    const { spy, result } = run(f, { actor: stranger });
    expect(await result).toEqual({ status: 'refused' });
    expect(spy.calls).toHaveLength(0);
  });

  it('refuses a source id of another workspace (RLS hides it), with zero calls', async () => {
    const a = await fresh();
    const b = await fresh();
    const { spy, targets, result } = run(b, { sourceId: a.sourceId });
    expect(await result).toEqual({ status: 'refused' });
    expect(spy.calls).toHaveLength(0);
    expect(targets).toHaveLength(0);
    expect(await evidenceCount(a.ws)).toBe(0);
    expect(await evidenceCount(b.ws)).toBe(0);
  });

  it('refuses a source that is not GitHub, and a malformed or unknown source id', async () => {
    const jira = await fresh('jira', 'back');
    const g = await fresh();
    for (const [f, sourceId] of [[jira, jira.sourceId], [g, randomUUID()], [g, 'not-a-uuid']] as const) {
      const { spy, result } = run(f, { sourceId });
      expect(await result).toEqual({ status: 'refused' });
      expect(spy.calls).toHaveLength(0);
    }
  });

  it('records an id mismatch as an error observation (nothing ok) and still ingests the status', async () => {
    const f = await fresh();
    const { spy, result } = run(f, { policy: approved(REPO_ID + 1) });
    expect(await result).toEqual({ status: 'ingested', count: 1 });
    expect(spy.calls).toHaveLength(1);
    const listed = await repo.list(f.ws, owner, { sourceId: f.sourceId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ state: 'error', payload: { kind: 'source_status', reason: 'id_mismatch' } });
  });

  it('SourceRevokedError carries a fixed message', () => {
    expect(new SourceRevokedError().message).toBe('source no longer approved or granted');
  });
});

describe('no secret leaks anywhere (real fetch transport and token provider over a fake fetch)', () => {
  const captured: string[] = [];
  const restores: Array<() => void> = [];

  beforeEach(() => {
    captured.length = 0;
    const grab =
      (name: 'log' | 'error' | 'warn' | 'info' | 'debug') =>
      (...args: unknown[]) => {
        captured.push(`${name}: ${args.map(String).join(' ')}`);
      };
    for (const name of ['log', 'error', 'warn', 'info', 'debug'] as const) {
      const original = console[name];
      console[name] = grab(name);
      restores.push(() => {
        console[name] = original;
      });
    }
    for (const stream of [process.stdout, process.stderr]) {
      const original = stream.write.bind(stream);
      stream.write = ((chunk: unknown, ...rest: unknown[]) => {
        captured.push(String(chunk));
        return (original as (...a: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof stream.write;
      restores.push(() => {
        stream.write = original as typeof stream.write;
      });
    }
  });

  afterEach(() => {
    while (restores.length > 0) restores.pop()!();
  });

  async function everythingStored(): Promise<string> {
    const audit = await db.admin.query('SELECT row_to_json(a)::text AS t FROM kawalys.audit_events a');
    const evidence = await db.admin.query('SELECT payload::text AS t, source_ref AS r FROM kawalys.evidence');
    return JSON.stringify([audit.rows, evidence.rows]);
  }

  it('a happy run: the token and the key appear in no audit row, no observation payload and no log line', async () => {
    const key = await makeTestKey();
    const body = happyScript();
    const f = fakeFetch((c) => {
      if (c.url.includes('/access_tokens')) return json(201, { token: FAKE_TOKEN, expires_at: new Date(now().getTime() + 3_600_000).toISOString() });
      const answer = body[new URL(c.url).pathname];
      return json(200, (answer as GitHubResponse).body);
    });
    const makeTransport = githubTransportFactory({ appId: 1, installationId: 2, privateKeyPem: key.pem }, f.fetch, now);
    const fr = await fresh();
    const result = await refreshSource({ repo, policy: approved(), workspaceId: fr.ws, actor: owner, sourceId: fr.sourceId, makeTransport, now });
    expect(result).toEqual({ status: 'ingested', count: 5 });
    // One mint (down-scoped to the pinned id), then three GETs that carried the token.
    const mints = f.calls.filter((c) => c.url.includes('/access_tokens'));
    expect(mints).toHaveLength(1);
    expect(mints[0]!.init.body).toContain(`"repository_ids":[${REPO_ID}]`);
    const gets = f.calls.filter((c) => c.init.method === 'GET');
    expect(gets).toHaveLength(3);
    expect(gets.every((c) => (c.init.headers as Record<string, string>)['Authorization'] === `Bearer ${FAKE_TOKEN}`)).toBe(true);
    const everything = (await everythingStored()) + captured.join('\n');
    const keyBody = key.pem.split('\n').filter((l) => l && !l.startsWith('-----'))[0]!;
    for (const secret of [FAKE_TOKEN, keyBody, 'Bearer ']) expect(everything).not.toContain(secret);
  });

  it('a failing run (fetch errors that carry the token) records a status and leaks nothing', async () => {
    const key = await makeTestKey();
    const f = fakeFetch((c) => {
      if (c.url.includes('/access_tokens')) return json(201, { token: FAKE_TOKEN, expires_at: new Date(now().getTime() + 3_600_000).toISOString() });
      throw new TypeError(`socket hang up while sending ${FAKE_TOKEN}`);
    });
    const makeTransport = githubTransportFactory({ appId: 1, installationId: 2, privateKeyPem: key.pem }, f.fetch, now);
    const fr = await fresh();
    expect(await refreshSource({ repo, policy: approved(), workspaceId: fr.ws, actor: owner, sourceId: fr.sourceId, makeTransport, now })).toEqual({ status: 'ingested', count: 1 });
    const listed = await repo.list(fr.ws, owner, { sourceId: fr.sourceId });
    expect(listed[0]).toMatchObject({ state: 'unknown', payload: { kind: 'source_status', reason: 'network' } });
    expect((await everythingStored()) + captured.join('\n')).not.toContain(FAKE_TOKEN);
  });

  it('a refused mint is recorded as denied and nothing is read', async () => {
    const key = await makeTestKey();
    const f = fakeFetch(() => json(401, { message: `Bad credentials ${FAKE_TOKEN}` }));
    const makeTransport = githubTransportFactory({ appId: 1, installationId: 2, privateKeyPem: key.pem }, f.fetch, now);
    const fr = await fresh();
    expect(await refreshSource({ repo, policy: approved(), workspaceId: fr.ws, actor: owner, sourceId: fr.sourceId, makeTransport, now })).toEqual({ status: 'ingested', count: 1 });
    const listed = await repo.list(fr.ws, owner, { sourceId: fr.sourceId });
    expect(listed[0]).toMatchObject({ state: 'denied', payload: { kind: 'source_status', reason: 'denied' } });
    expect(f.calls.every((c) => c.init.method === 'POST')).toBe(true);
    expect((await everythingStored()) + captured.join('\n')).not.toContain(FAKE_TOKEN);
  });
});

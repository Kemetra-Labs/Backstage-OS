// The portfolio read model is GitHub-repository-shaped: Jira and Confluence sources (BACK-99) are neither
// listed nor counted, so they cannot make a project read as unknown / never_read. Disposable Docker
// Postgres only; read batches come from the real mappers over canned responses.
import { randomUUID } from 'node:crypto';
import { observeConfluenceSpaces } from '../../src/connectors/confluence/confluence.observer';
import { observeRepository } from '../../src/connectors/github/github.observer';
import { observeJiraProjects } from '../../src/connectors/jira/jira.observer';
import { runWithWorkspaceContext } from '../../src/db/workspace-context';
import { EvidenceRepository } from '../../src/evidence/evidence.repository';
import { PortfolioRepository } from '../../src/portfolio/portfolio.repository';
import { happyScript as confluenceScript, ScriptedTransport as ConfluenceTransport } from '../connectors/confluence/confluence.fixture';
import { happyScript as githubScript, OWNER_REPO, ScriptedTransport as GitHubTransport } from '../connectors/github/github.fixture';
import { happyScript as jiraScript, NOW, ScriptedTransport as JiraTransport, SITE } from '../connectors/jira/jira.fixture';
import { startKawalysDb, stopKawalysDb, type KawalysDb } from '../db/kawalys-db';
import { approveAll } from '../evidence/approve-all-policy';

let db: KawalysDb | undefined;
let evidence: EvidenceRepository;
let portfolio: PortfolioRepository;
const owner = randomUUID();
const ws = randomUUID();
let mixed = '';
let atlassianOnly = '';
let githubSource = '';
let jiraSource = '';

beforeAll(async () => {
  db = await startKawalysDb();
  await db.admin.query('INSERT INTO kawalys.users (id) VALUES ($1)', [owner]);
  await runWithWorkspaceContext(db.app, ws, async (c) => {
    await c.query('INSERT INTO workspaces (id, owner_user_id) VALUES ($1, $2)', [ws, owner]);
    await c.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [ws, owner]);
  });
  evidence = new EvidenceRepository(db.app, approveAll());
  portfolio = new PortfolioRepository(db.app);

  mixed = await evidence.createProject(ws, owner, { key: 'a-mixed', name: 'GitHub and Jira' });
  githubSource = await evidence.connectSource(ws, owner, { projectId: mixed, provider: 'github', externalRef: OWNER_REPO });
  jiraSource = await evidence.connectSource(ws, owner, { projectId: mixed, provider: 'jira', externalRef: 'kemetra-synthetic.atlassian.net' });
  await evidence.ingest(ws, await observeRepository(new GitHubTransport(githubScript()), { sourceId: githubSource, externalRef: OWNER_REPO }, NOW));
  await evidence.ingest(ws, await observeJiraProjects(new JiraTransport(jiraScript()), { sourceId: jiraSource, site: SITE, projectKeys: ['BACK', 'OPS'] }, NOW));

  atlassianOnly = await evidence.createProject(ws, owner, { key: 'b-docs', name: 'Docs only' });
  const confluenceSource = await evidence.connectSource(ws, owner, { projectId: atlassianOnly, provider: 'confluence', externalRef: 'kemetra-synthetic.atlassian.net' });
  await evidence.ingest(
    ws,
    await observeConfluenceSpaces(new ConfluenceTransport(confluenceScript()), { sourceId: confluenceSource, site: SITE, spaceKeys: ['ENG', 'OPS'] }, NOW),
  );
}, 180_000);

afterAll(async () => {
  await stopKawalysDb(db);
}, 60_000);

describe('the portfolio lists GitHub sources only', () => {
  it('a project with a GitHub and a Jira source shows only the GitHub source, and its state is the GitHub read', async () => {
    const [p] = await portfolio.list(ws, owner, { projectId: mixed, withItems: true });
    expect(p!.sources.map((s) => [s.id, s.provider, s.state])).toEqual([[githubSource, 'github', 'ok']]);
    expect(p!.state).toBe('ok');
  });

  it('a project whose only granted sources are Jira or Confluence is not in the portfolio (and takes no slot)', async () => {
    expect((await portfolio.list(ws, owner, { withItems: false })).map((p) => p.id)).toEqual([mixed]);
    expect(await portfolio.list(ws, owner, { projectId: atlassianOnly, withItems: true })).toEqual([]);
  });

  it('the Jira and Confluence evidence is still stored and readable through the evidence API', async () => {
    const jira = await evidence.list(ws, owner, { sourceId: jiraSource });
    expect(jira).toHaveLength(3);
    expect(await evidence.list(ws, owner, { projectId: atlassianOnly })).toHaveLength(3);
  });

  it('negative: once the GitHub grant is revoked, a remaining Jira grant does not keep the project in the portfolio', async () => {
    await evidence.disconnectSource(ws, owner, githubSource);
    expect(await portfolio.list(ws, owner, { withItems: false })).toEqual([]);
    expect(await evidence.list(ws, owner, { sourceId: jiraSource })).toHaveLength(3);
  });
});

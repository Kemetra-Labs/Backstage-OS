// Operator command (BACK-52 slice A, decision T): `npm run source:connect` builds, then runs this.
//   node dist/ops/source-connect.js
// Connects the approved GitHub source(s) for the bound owner through EvidenceRepository.connectSource, so the BACK-131
// policy decides (approved identity only, one project key, no second identity). It refuses unless every approved GitHub
// entry pins a repository id (`github:owner/repo#id`), because the refresh runner will not read without it.
// It prints source ids only: no secret exists in its output. No HTTP route does this.
import { basename } from 'node:path';
import { WorkspaceResolver } from '../auth/workspace-resolver';
import { ConfigError, loadDatabaseConfig } from '../config/database-config';
import { openDatabase } from '../db/open-database';
import { ownerRefreshActor } from '../connectors/github/github.wiring';
import { EvidenceRepository } from '../evidence/evidence.repository';
import { approvedSourceEntries, configuredApprovalPolicy, type ApprovedEntry } from '../evidence/source-approval';
import type { RefreshActor } from '../connectors/github/github.scheduler';

/** A refusal with a fixed, operator-readable message (no value from the environment). */
export class ConnectRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectRefusedError';
  }
}

/** The GitHub entries to connect. Refuses when there are none, or when any entry has no repository id. */
export function githubEntriesToConnect(entries: readonly ApprovedEntry[]): ApprovedEntry[] {
  const github = entries.filter((e) => e.identity.provider === 'github');
  if (github.length === 0) throw new ConnectRefusedError('KAWALYS_APPROVED_SOURCES has no github entry to connect');
  if (github.some((e) => e.identity.repositoryId === undefined)) {
    throw new ConnectRefusedError('every approved github entry must pin its repository id (github:owner/repo#id) before it is connected');
  }
  return github;
}

export interface ConnectDeps {
  readonly repo: EvidenceRepository;
  readonly entries: readonly ApprovedEntry[];
  readonly target: RefreshActor;
}

/** Connects each entry (creating its project by key when missing); returns the source ids in order. */
export async function connectApprovedGithubSources(deps: ConnectDeps): Promise<string[]> {
  const entries = githubEntriesToConnect(deps.entries);
  const { repo, target } = deps;
  const ids: string[] = [];
  for (const { projectKey, identity } of entries) {
    const projectId =
      (await repo.projectIdByKey(target.workspaceId, projectKey)) ?? (await repo.createProject(target.workspaceId, target.actor, { key: projectKey, name: projectKey }));
    ids.push(await repo.connectSource(target.workspaceId, target.actor, { projectId, provider: 'github', externalRef: identity.externalRef }));
  }
  return ids;
}

async function main(): Promise<void> {
  const entries = githubEntriesToConnect(approvedSourceEntries(process.env));
  const config = loadDatabaseConfig(process.env);
  if (config === null) throw new ConfigError('KAWALYS_DATABASE_URL_APP and KAWALYS_DATABASE_URL_AUTH are required');
  const database = await openDatabase(config);
  try {
    const target = await ownerRefreshActor(database.authPool, new WorkspaceResolver(database.appPool, database.authPool));
    if (target === null) throw new ConnectRefusedError('no owner is bound yet: the owner must sign in once first');
    const repo = new EvidenceRepository(database.appPool, configuredApprovalPolicy(process.env));
    for (const id of await connectApprovedGithubSources({ repo, entries, target })) console.log(id);
  } finally {
    await database.close();
  }
}

// Run only as a command (node dist/ops/source-connect.js), never when a test imports this file.
if (basename(process.argv[1] ?? '') === 'source-connect.js') {
  main().catch((err: unknown) => {
    // Fixed messages from this tool and ConfigError (variable names only) are safe to print; nothing else is.
    const safe = err instanceof ConnectRefusedError || err instanceof ConfigError;
    console.error(`source-connect: ${safe ? (err as Error).message : 'failed'}`);
    process.exitCode = 1;
  });
}

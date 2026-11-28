// Wiring of the real GitHub path (BACK-52 slice A): the transport factory the runner and scheduler share, and the
// owner lookup. Pure assembly: no policy decision lives here (the runner decides), and nothing here reads the
// environment.
import type pg from 'pg';
import type { WorkspaceResolver } from '../../auth/workspace-resolver';
import type { GithubAppConfig } from '../../config/github-app';
import { createAppTokenProvider } from './github.app-token';
import { createFetchTransport, type FetchFn, type InstallationTokenSource } from './github.fetch-transport';
import type { GitHubTarget } from './github.runner';
import type { RefreshActor } from './github.scheduler';
import type { GitHubReadTransport } from './github.transport';

/** The global fetch, narrowed to the shape the GitHub path uses. */
export const globalFetch: FetchFn = (url, init) => fetch(url, init);

/**
 * Builds a read-only transport for one approved repository. One token provider per repository id is kept, so the
 * installation token is reused until 5 minutes before it expires instead of minted on every refresh.
 */
export function githubTransportFactory(config: GithubAppConfig, doFetch: FetchFn, now: () => Date = () => new Date()): (target: GitHubTarget) => GitHubReadTransport {
  const providers = new Map<number, InstallationTokenSource>();
  return ({ repo, repositoryId }) => {
    let tokens = providers.get(repositoryId);
    if (tokens === undefined) {
      tokens = createAppTokenProvider({
        fetch: doFetch,
        appId: config.appId,
        installationId: config.installationId,
        privateKeyPem: config.privateKeyPem,
        repositoryId,
        now,
      });
      providers.set(repositoryId, tokens);
    }
    return createFetchTransport({ fetch: doFetch, tokens, repo });
  };
}

/**
 * The bound owner and their workspace, or null before the owner has signed in once. The same lookup the sign-in
 * path uses (owner_binding on the auth login, then the workspace principal); it never creates an owner.
 */
export async function ownerRefreshActor(authPool: pg.Pool, workspaces: WorkspaceResolver): Promise<RefreshActor | null> {
  const { rows } = await authPool.query<{ user_id: string }>('SELECT user_id FROM owner_binding LIMIT 1');
  const userId = rows[0]?.user_id;
  if (userId === undefined) return null;
  const principal = await workspaces.forUser(userId);
  return principal === null ? null : { workspaceId: principal.workspaceId, actor: principal.userId };
}

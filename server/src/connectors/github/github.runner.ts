// Grant-guarded refresh of ONE GitHub source (BACK-52 slice A, plan A4). Kawalys-owned BUILD, and the one sanctioned
// production caller of EvidenceRepository.ingest besides the repository itself and the local seed
// (test/evidence/source-callers.guard.spec.ts).
//
// Before any provider call the runner requires, in this order: the source is visible in the workspace and is a GitHub
// source; its identity is in the approved set of its project WITH a pinned repository id; the actor holds an active
// grant. The transport it hands to the observer is wrapped so EVERY request first re-checks approval and the grant:
// after a revoke the wrapper throws SourceRevokedError and makes no call. If that happened, nothing is ingested.
//
// Limit that cannot be removed from here: a revoke that commits between the check and the request leaves at most the
// one request already being issued. The check itself is one read inside the workspace context, so the window is
// the time between that read and the send.
import type { EvidenceRepository } from '../../evidence/evidence.repository';
import type { SourceApprovalPolicy, SourceIdentity } from '../../evidence/source-approval';
import { observeRepository } from './github.observer';
import type { GitHubReadTransport, GitHubResponse } from './github.transport';

/** Thrown by the guarded transport when approval or the grant is gone. Fixed message. */
export class SourceRevokedError extends Error {
  constructor() {
    super('source no longer approved or granted');
    this.name = 'SourceRevokedError';
  }
}

/** What a transport is built for: the approved repository only. */
export interface GitHubTarget {
  readonly repo: string;
  readonly repositoryId: number;
  /** Approval and grant check the transport awaits right before it dispatches a request (after the token). */
  readonly beforeSend: () => Promise<void>;
}

export type RefreshResult =
  | { readonly status: 'ingested'; readonly count: number }
  | { readonly status: 'refused' }
  | { readonly status: 'revoked_mid_run' };

export interface RefreshDeps {
  readonly repo: EvidenceRepository;
  readonly policy: SourceApprovalPolicy;
  readonly workspaceId: string;
  readonly actor: string;
  readonly sourceId: string;
  readonly makeTransport: (target: GitHubTarget) => GitHubReadTransport;
  readonly now: () => Date;
}

/** The approved GitHub identity for this project key and reference, only when it pins a repository id. */
function pinnedIdentity(policy: SourceApprovalPolicy, projectKey: string, identity: SourceIdentity): (SourceIdentity & { repositoryId: number }) | undefined {
  const found = policy.approvedIdentities(projectKey).find((i) => i.provider === 'github' && i.externalRef === identity.externalRef);
  return found !== undefined && typeof found.repositoryId === 'number' ? { ...found, repositoryId: found.repositoryId } : undefined;
}

export async function refreshSource(deps: RefreshDeps): Promise<RefreshResult> {
  const { repo, policy, workspaceId, actor, sourceId } = deps;
  const source = await repo.sourceForRefresh(workspaceId, sourceId);
  if (source === null || source.identity.provider !== 'github') return { status: 'refused' };
  const approved = pinnedIdentity(policy, source.projectKey, source.identity);
  if (approved === undefined) return { status: 'refused' };
  if (!(await repo.hasActiveGrant(workspaceId, actor, sourceId))) return { status: 'refused' };

  let revoked = false;
  // A revoke already seen stops everything after it, without another read.
  const check = async (): Promise<void> => {
    if (revoked || pinnedIdentity(policy, source.projectKey, source.identity) === undefined || !(await repo.hasActiveGrant(workspaceId, actor, sourceId))) {
      revoked = true;
      throw new SourceRevokedError();
    }
  };
  const inner = deps.makeTransport({ repo: approved.externalRef, repositoryId: approved.repositoryId, beforeSend: check });
  const guarded: GitHubReadTransport = {
    async get(path: string): Promise<GitHubResponse> {
      // Before the token is even requested (a slow mint must not start for a revoked source)...
      await check();
      // ...and again inside the transport, after the token resolves and just before the request is sent.
      return inner.get(path);
    },
  };

  const observations = await observeRepository(guarded, { sourceId, externalRef: approved.externalRef, repositoryId: approved.repositoryId }, deps.now());
  // Whatever was read before the revoke is dropped, not stored: the revoked batch is not evidence.
  if (revoked) return { status: 'revoked_mid_run' };
  try {
    const ids = await repo.ingest(workspaceId, observations);
    return { status: 'ingested', count: ids.length };
  } catch (err) {
    // ingest share-locks the grant: a revoke that won the race between the last call and the write lands here.
    if (!(await repo.hasActiveGrant(workspaceId, actor, sourceId))) return { status: 'revoked_mid_run' };
    throw err;
  }
}

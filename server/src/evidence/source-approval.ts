// Approved source identities and explicit reauthorization (BACK-131, Blueprint SEC-01). Kawalys-owned BUILD.
//
// KAWALYS_APPROVED_SOURCES (server configuration, public repository names only, no secret) is a comma-separated
// list of `<project-key>=<provider>:<owner>/<repo>`, for example
//   retail-tower=github:kemetra-labs/backstage-os
// A project key may appear several times: the policy returns a SET of approved identities per project key.
// `connectSource` creates a source only for an identity in that set; with the variable unset or empty nothing is
// approved and every connect is refused (fail-closed). A malformed entry throws a ConfigError at startup and is
// never ignored; the error names the variable and never echoes the value. References are lower-cased.
import { ConfigError } from '../config/database-config';
import { REPO_REF } from '../connectors/github/github.observer';
import { SOURCE_PROVIDERS, type SourceProvider } from './evidence.types';

const NAME = 'KAWALYS_APPROVED_SOURCES';
const PROJECT_KEY = /^[a-z0-9][a-z0-9-]{0,62}$/; // the CHECK on projects.key (migrations/0003)
const OTHER_REF = /^[a-z0-9][a-z0-9._/-]{0,298}$/;

/** One external source. `externalRef` is already trimmed and lower-case, as stored in sources.external_ref. */
export interface SourceIdentity {
  readonly provider: SourceProvider;
  readonly externalRef: string;
}

export interface SourceApprovalPolicy {
  /** The identities that may be bound to the project with this key (empty: none). */
  approvedIdentities(projectKey: string): readonly SourceIdentity[];
}

/** How recent the actor's sign-in must be for a reconnect: the owner signs in again, then reconnects. */
export const REAUTH_MAX_AGE_MS = 5 * 60 * 1000;

/** Instances made by `fromSessionIssuedAt`, and nothing else: a lookalike (plain object, prototype trick) is not in it. */
const genuine = new WeakSet<object>();

/**
 * Proof that the actor signed in recently, built from the sign-in time of their current session. It is a class
 * with a private constructor, frozen, and tracked in a module-private set, so neither a boolean nor a lookalike
 * object nor a mutated copy can stand in for it, and no caller can switch the freshness rule off. The repository
 * reads the clock itself: no call takes a time.
 */
export class Reauthorization {
  private constructor(readonly issuedAtMs: number) {
    Object.freeze(this);
  }

  static fromSessionIssuedAt(issuedAtMs: number): Reauthorization {
    if (!Number.isFinite(issuedAtMs)) throw new TypeError('reauthorization needs a finite session issue time');
    const made = new Reauthorization(issuedAtMs);
    genuine.add(made);
    return made;
  }

  /** True only for an instance created by `fromSessionIssuedAt` in this process. */
  static isGenuine(value: unknown): value is Reauthorization {
    return typeof value === 'object' && value !== null && genuine.has(value);
  }

  /** Within [0, REAUTH_MAX_AGE_MS] of `nowMs`; an issue time in the future is refused. */
  isFreshAt(nowMs: number): boolean {
    const age = nowMs - this.issuedAtMs;
    return age >= 0 && age <= REAUTH_MAX_AGE_MS;
  }
}

function invalid(): ConfigError {
  return new ConfigError(`${NAME} must be a comma-separated list of <project-key>=<provider>:<owner>/<repo>`);
}

function parseEntry(entry: string): [string, SourceIdentity] {
  const eq = entry.indexOf('=');
  if (eq < 0) throw invalid();
  const key = entry.slice(0, eq).trim();
  const target = entry.slice(eq + 1).trim();
  const colon = target.indexOf(':');
  if (!PROJECT_KEY.test(key) || colon < 0) throw invalid();
  const provider = target.slice(0, colon).trim();
  const externalRef = target.slice(colon + 1).trim().toLowerCase();
  if (!(SOURCE_PROVIDERS as readonly string[]).includes(provider)) throw invalid();
  if (!(provider === 'github' ? REPO_REF : OTHER_REF).test(externalRef)) throw invalid();
  return [key, { provider: provider as SourceProvider, externalRef }];
}

function fromEntries(entries: readonly [string, SourceIdentity][]): SourceApprovalPolicy {
  const byKey = new Map<string, SourceIdentity[]>();
  for (const [key, id] of entries) {
    const set = byKey.get(key) ?? [];
    if (!set.some((s) => s.provider === id.provider && s.externalRef === id.externalRef)) set.push(id);
    byKey.set(key, set);
  }
  return { approvedIdentities: (projectKey) => byKey.get(projectKey) ?? [] };
}

/** Fail-closed: unset or blank approves nothing; any malformed entry throws. */
export function configuredApprovalPolicy(env: NodeJS.ProcessEnv): SourceApprovalPolicy {
  const raw = (env[NAME] ?? '').trim();
  if (raw === '') return fromEntries([]);
  return fromEntries(raw.split(',').map((e) => parseEntry(e.trim())));
}

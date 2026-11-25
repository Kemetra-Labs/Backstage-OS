// GitHub observation mapper (BACK-52 mock slice). Turns read-only GitHub REST answers for ONE
// repository into typed Observations for EvidenceRepository.ingest(). Kawalys-owned BUILD; the
// error classes adapt the Retail Tower pattern noted in github.transport.ts.
//
// Rules:
// - Every failure becomes a `source_status` Observation with state denied/unknown/error, never ok,
//   and a fixed reason code: GitHub's message text, URLs and thrown messages are never stored.
// - observedAt is the time of the read; the item's own update time is kept as payload.updatedAt.
//   A status record is therefore "fresh" too: readers must let `state` win over freshness.
// - Only allow-listed fields are kept (X04): no bodies, logins, emails, avatars or descriptions.
import type { ObservationInput } from '../../evidence/evidence.repository';
import type { EvidenceState } from '../../evidence/evidence.types';
import { GitHubTransportFailure, type GitHubReadTransport, type GitHubResponse } from './github.transport';

/** Stored lower-case `owner/repo` (migrations/0003 lower-cases external_ref). No dots-only repo names. */
export const REPO_REF = /^[a-z0-9](?:[a-z0-9-]{0,38})\/(?!\.{1,2}$)[a-z0-9._-]{1,100}$/;

export const PAGE_SIZE = 20;
const TITLE_MAX = 300;
const ITEM_STATES = new Set(['open', 'closed']);

export type Endpoint = 'repository' | 'pull_requests' | 'issues';
export type StatusReason =
  | 'denied'
  | 'not_visible'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'unexpected_status'
  | 'transport_error'
  | 'malformed'
  | 'ref_mismatch'
  | 'invalid_ref';

export interface GitHubSource {
  readonly sourceId: string;
  /** owner/repo as stored on the source row. */
  readonly externalRef: string;
}

type Outcome = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly state: EvidenceState; readonly reason: StatusReason };

class Malformed extends Error {}
class RefMismatch extends Error {}

/** HTTP status (or thrown failure) to evidence state. Nothing here can produce `ok`. */
function classify(response: GitHubResponse): Outcome {
  const s = response.status;
  if (s >= 200 && s < 300) return { ok: true, body: response.body };
  // Primary limit: 403 with x-ratelimit-remaining 0. Secondary limit: 403 with retry-after.
  const limited = s === 403 && (response.headers['x-ratelimit-remaining'] === '0' || response.headers['retry-after'] !== undefined);
  if (s === 429 || limited) return { ok: false, state: 'unknown', reason: 'rate_limited' };
  if (s === 401 || s === 403) return { ok: false, state: 'denied', reason: 'denied' };
  // Absent and not permitted look the same on GitHub; we do not try to tell them apart.
  if (s === 404) return { ok: false, state: 'denied', reason: 'not_visible' };
  if (s >= 500 && s < 600) return { ok: false, state: 'unknown', reason: 'unavailable' };
  return { ok: false, state: 'error', reason: 'unexpected_status' };
}

async function read(transport: GitHubReadTransport, path: string): Promise<Outcome> {
  try {
    return classify(await transport.get(path));
  } catch (err) {
    if (err instanceof GitHubTransportFailure) return { ok: false, state: 'unknown', reason: err.kind };
    return { ok: false, state: 'error', reason: 'transport_error' };
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isoDate(v: unknown): string {
  if (typeof v !== 'string') throw new Malformed();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Malformed();
  return d.toISOString();
}

function optionalIsoDate(v: unknown): string | null {
  return v === null || v === undefined ? null : isoDate(v);
}

/**
 * Text safe for PostgreSQL jsonb: no NUL, no unpaired surrogate (replaced by U+FFFD), cut on whole
 * code points so a cut can never split an emoji. jsonb rejects either, and ingest() is all-or-nothing.
 */
export function clip(s: string, max = TITLE_MAX): string {
  const wellFormed = (s.replaceAll(String.fromCharCode(0), '') as unknown as { toWellFormed(): string }).toWellFormed();
  return Array.from(wellFormed).slice(0, max).join('');
}

/**
 * Keep a GitHub web URL only if it points into this repository, rebuilt from its path alone: no
 * credentials, port, query or fragment survive, and the stored value is capped.
 */
function ownUrl(v: unknown, ref: string): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    const ok =
      u.protocol === 'https:' &&
      u.hostname === 'github.com' &&
      u.username === '' &&
      u.password === '' &&
      u.port === '' &&
      u.pathname.toLowerCase().startsWith(`/${ref}/`);
    const url = `https://github.com${u.pathname}`;
    return ok && url.length <= TITLE_MAX ? url : null;
  } catch {
    return null;
  }
}

function repositoryPayload(body: unknown, ref: string): Record<string, unknown> {
  if (!isObject(body)) throw new Malformed();
  const { full_name, default_branch, archived, private: isPrivate, pushed_at } = body;
  if (typeof full_name !== 'string' || typeof default_branch !== 'string' || typeof archived !== 'boolean' || typeof isPrivate !== 'boolean') {
    throw new Malformed();
  }
  // A renamed or redirected repository must not be stored under this source.
  if (full_name.toLowerCase() !== ref) throw new RefMismatch();
  return {
    kind: 'repository',
    fullName: clip(full_name),
    defaultBranch: clip(default_branch),
    archived,
    private: isPrivate,
    pushedAt: optionalIsoDate(pushed_at),
  };
}

function itemPayload(kind: 'pull_request' | 'issue', item: unknown, ref: string): Record<string, unknown> {
  if (!isObject(item)) throw new Malformed();
  const { number, title, state, updated_at, html_url, draft } = item;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) throw new Malformed();
  if (typeof title !== 'string' || typeof state !== 'string' || !ITEM_STATES.has(state)) throw new Malformed();
  const base = { kind, number, title: clip(title), state };
  const tail = { updatedAt: isoDate(updated_at), url: ownUrl(html_url, ref) };
  return kind === 'pull_request' ? { ...base, draft: draft === true, ...tail } : { ...base, ...tail };
}

function list(body: unknown): unknown[] {
  if (!Array.isArray(body)) throw new Malformed();
  return body;
}

export async function observeRepository(transport: GitHubReadTransport, source: GitHubSource, now: Date): Promise<ObservationInput[]> {
  const at = new Date(now.getTime());
  const observation = (state: EvidenceState, sourceRef: string, payload: Record<string, unknown>): ObservationInput => ({
    sourceId: source.sourceId,
    type: 'Observation',
    state,
    sourceRef,
    observedAt: at,
    payload,
  });
  const failure = (endpoint: Endpoint, sourceRef: string, state: EvidenceState, reason: StatusReason) =>
    observation(state, sourceRef, { kind: 'source_status', endpoint, reason });

  const ref = source.externalRef;
  if (!REPO_REF.test(ref)) return [failure('repository', 'github:invalid-ref', 'error', 'invalid_ref')];
  const root = `github:${ref}`;
  const base = `/repos/${ref}`;
  const query = `?state=open&sort=updated&direction=desc&per_page=${PAGE_SIZE}`;

  const repo = await read(transport, base);
  if (!repo.ok) return [failure('repository', root, repo.state, repo.reason)];
  let repoPayload: Record<string, unknown>;
  try {
    repoPayload = repositoryPayload(repo.body, ref);
  } catch (err) {
    return [failure('repository', root, 'error', err instanceof RefMismatch ? 'ref_mismatch' : 'malformed')];
  }
  const out: ObservationInput[] = [observation('ok', root, repoPayload)];

  const lists: readonly [Endpoint, 'pull_request' | 'issue', string, string][] = [
    ['pull_requests', 'pull_request', 'pulls', 'pull'],
    ['issues', 'issue', 'issues', 'issue'],
  ];
  for (const [endpoint, kind, segment, refPart] of lists) {
    const answer = await read(transport, `${base}/${segment}${query}`);
    const statusRef = `${root}#${segment}`;
    if (!answer.ok) {
      out.push(failure(endpoint, statusRef, answer.state, answer.reason));
      continue;
    }
    try {
      // The issues endpoint also lists pull requests; they are observed through /pulls.
      const items = list(answer.body).filter((i) => !(kind === 'issue' && isObject(i) && 'pull_request' in i));
      const mapped = items.map((i) => itemPayload(kind, i, ref));
      out.push(...mapped.map((p) => observation('ok', `${root}#${refPart}/${p['number'] as number}`, p)));
    } catch {
      // One bad item poisons its endpoint: a partial list would look complete.
      out.push(failure(endpoint, statusRef, 'error', 'malformed'));
    }
  }
  return out;
}

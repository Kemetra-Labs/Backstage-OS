// Confluence observation mapper (BACK-53 mock slice). Turns read-only Confluence Cloud REST v2
// answers for the configured space keys into typed Observations for EvidenceRepository.ingest().
//
// Reuse: ADAPT of server/src/connectors/github/github.observer.ts (76a9a13): the space read plays the
// repository read (a failure stops that space), the page list plays a GitHub list endpoint.
//
// Rules:
// - Every failure becomes a `source_status` Observation with state denied/unknown/error, never ok.
//   Confluence's error text, URLs and thrown messages are never stored.
// - A page list whose `date` header is older than the TTL yields `stale` pages, never `ok`.
// - observedAt is the time of the read; the page's own last modification is payload.lastModified.
// - Only page id, title, space key, last modified and version number are kept (X04): no body,
//   author, owner, account ids or emails.
// - A link is built only on the configured site, and only when it is https://<name>.atlassian.net.
import type { ObservationInput } from '../../evidence/evidence.repository';
import {
  clip,
  isClipped,
  DEFAULT_TTL_MS,
  isObject,
  isoDate,
  list,
  Malformed,
  PAGE_SIZE,
  read,
  RefMismatch,
  siteBase,
  validKeys,
  validTtl,
  type Make,
  type StatusReason,
} from '../atlassian/atlassian.read';
import type { ConfluenceReadTransport } from './confluence.transport';

/** Confluence space key as configured (upper case letters and digits). Personal spaces (~) are out. */
export const SPACE_KEY = /^[A-Z0-9]{1,32}$/;
/** Confluence v2 ids are decimal strings; checked before one is put into a request path. */
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

export interface ConfluenceSource {
  readonly sourceId: string;
  /** The configured site, e.g. `https://example.atlassian.net`. Used for links only. */
  readonly site: string;
  readonly spaceKeys: readonly string[];
}

export interface ObserveOptions {
  readonly ttlMs?: number;
}

type Endpoint = 'space' | 'pages';

const statusPayload = (endpoint: Endpoint, reason: StatusReason, space?: string) =>
  space === undefined ? { kind: 'source_status', endpoint, reason } : { kind: 'source_status', endpoint, space, reason };

export const spacePath = (key: string) => `/wiki/api/v2/spaces?keys=${encodeURIComponent(key)}&limit=1`;
export const pagesPath = (spaceId: string) => `/wiki/api/v2/spaces/${spaceId}/pages?status=current&sort=-modified-date&limit=${PAGE_SIZE}`;

/** The space's id, or not visible when the answer lists no space. */
function spaceId(body: unknown, key: string): string | null {
  if (!isObject(body) || !Array.isArray(body['results']) || body['results'].length > 1) throw new Malformed();
  const space: unknown = body['results'][0];
  if (space === undefined) return null;
  if (!isObject(space) || typeof space['key'] !== 'string' || typeof space['id'] !== 'string' || !NUMERIC_ID.test(space['id'])) throw new Malformed();
  if (space['key'] !== key) throw new RefMismatch();
  return space['id'];
}

function pagePayload(item: unknown, key: string, id: string, base: string | null): Record<string, unknown> {
  if (!isObject(item) || !isObject(item['version'])) throw new Malformed();
  const { id: pageId, title, spaceId: pageSpace } = item;
  const { number, createdAt } = item['version'];
  if (typeof pageId !== 'string' || !NUMERIC_ID.test(pageId) || typeof title !== 'string') throw new Malformed();
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) throw new Malformed();
  // A page from another space must not be stored under this one.
  if (pageSpace !== id) throw new RefMismatch();
  return {
    kind: 'confluence_page',
    pageId,
    title: clip(title),
    ...(isClipped(title) ? { textClipped: true } : {}),
    spaceKey: key,
    lastModified: isoDate(createdAt),
    version: number,
    url: base === null ? null : `${base}/wiki/spaces/${key}/pages/${pageId}`,
  };
}

const failure = (err: unknown): StatusReason => (err instanceof RefMismatch ? 'ref_mismatch' : 'malformed');

async function observeSpace(
  transport: ConfluenceReadTransport,
  key: string,
  base: string | null,
  now: Date,
  ttlMs: number,
  make: Make,
): Promise<ObservationInput[]> {
  const root = `confluence:${key}`;
  const space = await read(transport, spacePath(key), now, ttlMs);
  if (!space.ok) return [make(space.state, root, statusPayload('space', space.reason, key))];
  let id: string | null;
  try {
    id = spaceId(space.body, key);
  } catch (err) {
    return [make('error', root, statusPayload('space', failure(err), key))];
  }
  if (id === null) return [make('denied', root, statusPayload('space', 'not_visible', key))];

  const pagesRef = `${root}#pages`;
  const pages = await read(transport, pagesPath(id), now, ttlMs);
  if (!pages.ok) return [make(pages.state, pagesRef, statusPayload('pages', pages.reason, key))];
  try {
    const payloads = list(pages.body, 'results').map((p) => pagePayload(p, key, id, base));
    if (new Set(payloads.map((p) => p['pageId'])).size !== payloads.length) throw new Malformed();
    const state = pages.fresh ? 'ok' : 'stale';
    return payloads.map((p) => make(state, `${root}#page/${p['pageId'] as string}`, p));
  } catch (err) {
    // One bad page poisons its space: a partial list would look complete.
    return [make('error', pagesRef, statusPayload('pages', failure(err), key))];
  }
}

/**
 * Observe the configured Confluence spaces through a read-only transport: each space, then up to 20
 * most recently modified current pages. Never throws for an upstream failure: every failure is a
 * `source_status` Observation that is never `ok`, isolated to its space. Invalid space keys make no
 * request at all.
 */
export async function observeConfluenceSpaces(
  transport: ConfluenceReadTransport,
  source: ConfluenceSource,
  now: Date,
  options: ObserveOptions = {},
): Promise<ObservationInput[]> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  validTtl(ttlMs);
  const at = new Date(now.getTime());
  const make: Make = (state, sourceRef, payload) => ({ sourceId: source.sourceId, type: 'Observation', state, sourceRef, observedAt: at, payload });

  if (!validKeys(source.spaceKeys, SPACE_KEY)) return [make('error', 'confluence:invalid-ref', statusPayload('space', 'invalid_ref'))];
  const base = siteBase(source.site);
  const out: ObservationInput[] = [];
  for (const key of source.spaceKeys) out.push(...(await observeSpace(transport, key, base, at, ttlMs, make)));
  return out;
}

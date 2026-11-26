// The S2 read (BACK-105): ONE statement that returns the reader's active grants, the database clock,
// the collapsed runs and the read markers, so evidence, grants and time come from one snapshot
// (READ COMMITTED: one statement, one snapshot; design D3). It must equal collapse() in
// memory.collapse.ts for the same rows; test/memory/memory-db.spec.ts proves it.
//
// Parameters: $1 reader user id, $2 project id, $3 knownAt (NULL = now()), $4 item kinds,
// $5 purge-horizon source ids, $6 purge horizons (same order).
import { PROJECT_VISIBLE } from '../evidence/visibility';
import { CONTENT_FIELDS, ITEM_KINDS } from './memory.policy';

const SAFE = /^[A-Za-z]+$/;

/** CASE kind -> jsonb array of the provider-owned content fields (D2), built from the policy table. */
function contentSignature(): string {
  const cases = Object.entries(CONTENT_FIELDS).map(([kind, fields]) => {
    if (!SAFE.test(kind.replaceAll('_', '')) || !fields.every((f) => SAFE.test(f))) throw new Error('memory.sql: unsafe policy identifier');
    return `WHEN '${kind}' THEN jsonb_build_array(${fields.map((f) => `payload->'${f}'`).join(', ')})`;
  });
  return `CASE kind ${cases.join(' ')} END`;
}

const ORDER_ASC = 'obs, rcv, id';
const IDENTITY = 'source_id, source_ref, kind';
const NULLS = (n: number) => Array.from({ length: n }, () => 'NULL').join(', ');

export const ITEM_KIND_LIST: readonly string[] = [...ITEM_KINDS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export const MEMORY_READ_SQL = `
WITH
clock AS (SELECT now() AS now_at, COALESCE($3::timestamptz, now()) AS known_at),
granted AS (
  SELECT g.id AS grant_id, s.id AS source_id, s.provider
    FROM sources s
    JOIN source_grants g ON g.source_id = s.id AND g.user_id = $1 AND g.revoked_at IS NULL
   WHERE s.project_id = $2 AND ${PROJECT_VISIBLE('s.project_id')}
),
v AS (
  SELECT e.id, e.source_id, e.state, e.source_ref, e.payload, e.payload->>'kind' AS kind,
         date_trunc('milliseconds', e.observed_at) AS obs, date_trunc('milliseconds', e.received_at) AS rcv
    FROM evidence e
    JOIN granted gr ON gr.source_id = e.source_id
   WHERE e.project_id = $2
     AND e.type = 'Observation'
     AND date_trunc('milliseconds', e.received_at) <= (SELECT known_at FROM clock)
     AND (e.payload->>'kind' = ANY($4::text[]) OR e.payload->>'kind' IN ('source_status', 'list_page'))
),
items AS (
  SELECT v.*, (h.horizon IS NOT NULL AND v.obs < h.horizon) AS retained, ${contentSignature()} AS sig
    FROM v
    LEFT JOIN unnest($5::uuid[], $6::timestamptz[]) AS h(source_id, horizon) ON h.source_id = v.source_id
   WHERE v.kind = ANY($4::text[])
),
marked AS (
  SELECT items.*,
         CASE WHEN retained OR COALESCE(lag(retained) OVER w, true) OR lag(sig) OVER w IS DISTINCT FROM sig THEN 1 ELSE 0 END AS starts
    FROM items
  WINDOW w AS (PARTITION BY ${IDENTITY} ORDER BY ${ORDER_ASC})
),
numbered AS (
  SELECT marked.*, sum(starts) OVER (PARTITION BY ${IDENTITY} ORDER BY ${ORDER_ASC} ROWS UNBOUNDED PRECEDING) AS run_no
    FROM marked
),
run_agg AS (
  SELECT ${IDENTITY}, run_no, count(*)::int AS n,
         array_agg(DISTINCT state COLLATE "C" ORDER BY state COLLATE "C") AS states,
         min(rcv) AS first_rcv, max(rcv) AS last_rcv, bool_or(retained) AS retained
    FROM numbered
   GROUP BY ${IDENTITY}, run_no
),
run_first AS (
  SELECT DISTINCT ON (${IDENTITY}, run_no) ${IDENTITY}, run_no, id AS first_id, obs AS first_obs
    FROM numbered ORDER BY ${IDENTITY}, run_no, obs, rcv, id
),
run_last AS (
  SELECT DISTINCT ON (${IDENTITY}, run_no) ${IDENTITY}, run_no, id AS last_id, obs AS last_obs, state AS last_state, payload AS last_payload
    FROM numbered ORDER BY ${IDENTITY}, run_no, obs DESC, rcv DESC, id DESC
),
failures AS (
  SELECT DISTINCT ON (source_id, source_ref) * FROM v
   WHERE kind = 'source_status' AND state <> 'ok'
   ORDER BY source_id, source_ref, obs DESC, id DESC
),
pages AS (
  SELECT DISTINCT ON (source_id, source_ref) * FROM v
   WHERE kind = 'list_page' AND state = 'ok'
   ORDER BY source_id, source_ref, obs DESC, id DESC
),
scope_items AS (
  SELECT DISTINCT ON (source_id, split_part(source_ref, '#', 1)) * FROM v
   WHERE kind = ANY($4::text[]) AND state IN ('ok', 'stale')
   ORDER BY source_id, split_part(source_ref, '#', 1), obs DESC, id ASC
),
heads AS (
  SELECT v.*, count(*) OVER (PARTITION BY v.source_id, v.rcv, v.obs) AS batch_heads
    FROM v JOIN granted gr ON gr.source_id = v.source_id
   WHERE gr.provider = 'github' AND position('#' IN v.source_ref) = 0 AND v.kind IN ('repository', 'source_status')
),
ambiguous AS (
  SELECT DISTINCT ON (source_id, rcv, obs) * FROM heads WHERE batch_heads > 1 ORDER BY source_id, rcv, obs, id
)
SELECT 'grant'::text AS role, grant_id AS id, source_id, NULL::text AS source_ref, provider::text AS kind, NULL::text AS state,
       NULL::timestamptz AS obs, NULL::timestamptz AS rcv, NULL::jsonb AS payload, NULL::uuid AS first_id,
       NULL::timestamptz AS first_obs, NULL::timestamptz AS first_rcv, NULL::timestamptz AS last_rcv,
       NULL::int AS n, NULL::text[] AS states, NULL::boolean AS retained
  FROM granted
UNION ALL
SELECT 'clock', NULL, NULL, NULL, NULL, NULL, now_at, known_at, ${NULLS(8)} FROM clock
UNION ALL
SELECT 'run', l.last_id, a.source_id, a.source_ref, a.kind, l.last_state, l.last_obs, NULL, l.last_payload,
       f.first_id, f.first_obs, a.first_rcv, a.last_rcv, a.n, a.states, a.retained
  FROM run_agg a
  JOIN run_first f USING (${IDENTITY}, run_no)
  JOIN run_last l USING (${IDENTITY}, run_no)
UNION ALL
SELECT 'failure', id, source_id, source_ref, kind, state, obs, rcv, payload, ${NULLS(7)} FROM failures
UNION ALL
SELECT 'list_page', id, source_id, source_ref, kind, state, obs, rcv, payload, ${NULLS(7)} FROM pages
UNION ALL
SELECT 'scope_item', id, source_id, source_ref, kind, state, obs, rcv, payload, ${NULLS(7)} FROM scope_items
UNION ALL
SELECT 'ambiguous', id, source_id, source_ref, kind, state, obs, rcv, payload, ${NULLS(7)} FROM ambiguous
`;

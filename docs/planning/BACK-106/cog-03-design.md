# BACK-106 (COG-03) design: authorized retrieval and typed relationships

Status: **drafted 2026-11-27 under the owner's delegation ("go, let's complete the engine brain").** Each decision below is the implementation session's call and says what would change it; the owner can override any of them. Nothing here approves a schema change, dependency, route, connector change or live data. The implementation PR stops for owner review before merge, as BACK-106 requires.

Epic [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103). Predecessor [BACK-105](https://rahmaqanater.atlassian.net/browse/BACK-105) (COG-02) was accepted as a background read on 2026-11-27 ([cog-02-decisions.md](../BACK-105/cog-02-decisions.md) DEC-5). Design input: Confluence KMC 95256578 W2; the COG-01 research port's `retrieve()` (`server/test/research/cognitive-core/memory.ts`).

## 1. Intent

Find the item a person or a later slice (COG-04 reasoning, COG-07 shadow cards) means, from a native identifier or from words in English or Arabic, and follow its relationships to other items. Every result says which evidence supports it, which revision it is, and how fresh it is. It never reveals that something the reader cannot see exists.

**Goals**
- Exact lookup by native identifier (PR/issue number, Jira key, Confluence page id, repository name, source ref).
- Arabic/English lexical search over original titles, with deterministic ranking and explicit ambiguity and abstention.
- Typed, bounded, access-aware relationships and traversal.
- Evidence ids, revision and freshness on every result and every edge.

**Non-goals:** embeddings, vector or graph stores, fuzzy or semantic matching, any LLM, routes or UI (COG-07), task readiness (COG-04), new dependencies, schema or connector changes.

**Anti-goals (a failure even if it works):**
- a result, count, rank, edge or "unresolved" marker that differs depending on rows the reader cannot see;
- a stale, unknown or conflicting fact presented as verified;
- a fuzzy match that silently picks the wrong item for an identifier query.

## 2. Approaches considered

| | Approach | Trade-off | Verdict |
| --- | --- | --- | --- |
| A | **Pure retrieval over the COG-02 projection** (in memory, per read) | Inherits COG-02's authorization by construction; no new SQL or table. Cost is the S2 read (background only, DEC-5). | **Chosen.** |
| B | A search index or relationship table in PostgreSQL (`tsvector`, edge table) | Fast at volume, but a second derived store with its own invalidation on every row, revoke and re-grant: the failure D1 of COG-02 rejected. Arabic `tsvector` configs are weak without extensions (a dependency decision). | Rejected now; revisit only if a measured consumer needs it. |
| C | Adopt a library (Graphology, a vector store, an external memory engine) | BACK-106 forbids speculative adoption; needs package and licence approval; no measured gain. | Rejected. |

## 3. Decisions

### R1 — Input is the reader's memory projection; nothing else

Retrieval is a pure function over a `MemoryProjection` (COG-02), which already contains only items the reader may see (workspace RLS, project, active grants, in one statement). Retrieval reads no evidence, writes nothing and keeps no index between calls. A result is per reader and never cached or shared.

*Changes if:* a measured consumer needs interactive latency (then COG-02 DEC-2's option A first, then an index decision).

### R2 — Documents, identity and identifiers

One document per projection item. **Identity** is `(sourceId, sourceRef, kind)`; its canonical key orders everything.

| Kind | Title (original text) | Native identifiers (exact match) |
| --- | --- | --- |
| `pull_request` | `title` | `#<n>`, `<n>`, `pr <n>`, the source ref |
| `issue` | `title` | `#<n>`, `<n>`, `issue <n>`, the source ref |
| `jira_issue` | `summary` | `key` (case-insensitive), the source ref |
| `confluence_page` | `title` | `pageId`, the source ref |
| `repository` | `fullName` | `fullName`, its repository name, the source ref |

Text comes from the current revision. When there is none (conflict or unknown current), it comes from the newest returned run, and the result keeps the item's status, so it is never shown as verified. Native identifiers are never normalized away: the original values are returned as stored.

### R3 — Lexical normalization (search only)

NFKC, remove invisible format characters (Unicode `Cf`: zero-width, joiners, bidi controls; added in `retrieval-v2` after the COG-08 adversarial test showed `BACK​-8` escaping the identifier rule), lower case, remove Arabic diacritics and tatweel, unify alef forms (`أ إ آ ٱ` → `ا`), `ى` → `ي`, `ة` → `ه`, Arabic-Indic and Persian digits → ASCII. Tokens are maximal runs of letters or digits. Normalization is used only to compare; it never changes stored or returned text (research port rule). Queries are bounded: at most 500 characters and 32 tokens, otherwise `invalid-query`.

### R4 — Matching, ranking, ambiguity and abstention

Tiers, best first:
1. **identifier**: the trimmed query equals a native identifier (R2).
2. **title**: every query token is in the title tokens.
3. **any**: every query token is in the title tokens and the identifier tokens together.

A query **shaped like an identifier** (`#12`, `12`, `pr 12`, a Jira key, a page id of digits) is matched in tier 1 only. When it matches nothing, the answer is `no-match`, never a fuzzy guess (research port rule against identity collisions). There is no partial (OR) matching.

Only the best non-empty tier is returned; lower tiers are not mixed in. Within a tier the order is: fewer title tokens first (the tighter match), then the identity key. Status does not affect the order, so a stale item is not hidden behind a verified one.

**Outcome:**
- `match`: exactly one document in the best tier;
- `ambiguous`: more than one in the best tier, with `selected: null`; the candidates are returned and labelled;
- `no-match` or `invalid-query`: nothing returned.

**Bounded:** `limit` defaults to 10, at most 50. The result carries `totalMatches` and `truncated`. Counts are over the reader's visible documents only, so they carry no side channel (R1).

### R5 — What each result carries

The identity, kind, original title, status and reason (from COG-02, never upgraded), the tier and the matched field, the `revision` (the current run's content key, or null) and `evidence` (sorted evidence ids: the current run's first and last, or the newest run's when there is no current revision), plus `lastObservedAt`. The response carries the projection's `fingerprint` and `policyVersion` and its own `retrievalPolicyVersion`.

### R6 — Typed relationships, derived on read

No edge is stored. Edges are recomputed from the visible documents on each call:

| Type | From → to | Rule | Evidence |
| --- | --- | --- | --- |
| `contains` | repository → its PRs and issues | same source, same scope root | the two items' evidence |
| `mentions` | any item → item | the item's original title contains a native identifier of another visible item: a Jira key (`[A-Z][A-Z0-9]{1,9}-\d+`) or, in a GitHub item, `#<n>` of the same repository | the mentioning item's evidence (it holds the text) plus the target's |

**Unresolved mentions.** A Jira key in a visible title that matches no visible item is returned as `{ type: 'mentions', text: <key>, target: null, status: 'unresolved' }`. It is identical whether the target is hidden, revoked or nonexistent. The key text itself comes from the visible title, so nothing new is disclosed. A self-mention is dropped.

**Traversal** (`related`): breadth-first from one identity, following edges in both directions, with a `depth` of 1 to 3 (default 2) and at most `maxNodes` nodes (default 25, at most 50). Neighbours are visited in identity-key order, so the result is deterministic. A visited set stops cycles. The result returns each node's depth and the edge that reached it, and a `truncated` flag. An unknown start identity gives `not-found`, the same answer whether it is hidden or nonexistent.

### R7 — Determinism and policy version

The same projection and query give byte-identical output. `RETRIEVAL_POLICY_VERSION` (`retrieval-v2`) is bumped whenever R2 to R6 change. A guard test pins the module as pure: no route, no Nest module registration, no database import, no import from `test/`, and no dependency outside Node's standard library and `src/memory`.

### R8 — Evaluation protocol

- **Frozen labelled corpus.** `server/test/retrieval/retrieval.corpus.ts` contains synthetic documents and queries with expected outcomes: English and Arabic (alef, ta marbuta and diacritic variants), identifier collisions (`#4` as a PR and as an issue), stale, conflict and unknown items, multi-hop relationships, missing data, a revoked source and hidden existence. Every case's expected answer is written by hand, never generated by the code under test.
- **Pass bar:** 100% of cases, with zero unauthorized disclosures (hidden-target cases must equal nonexistent-target cases byte for byte).
- **Labelling independence (open).** The labels are written by the implementing session. An independent relabel is a COG-08 (BACK-111) item; until then, the corpus is a regression suite rather than an independent benchmark.
- **Comparison with an optional index or graph library:** not run, because none is proposed. If one is proposed later, it is compared on this corpus and the S2 data, for quality, compute and latency, before any adoption.

## 4. Slices (TDD)

| Slice | Delivers | Tests written first |
| --- | --- | --- |
| **S1 Pure retrieval** | `server/src/retrieval/`: types, normalization, policy, documents, search, relations | Normalization (Arabic variants, digits); identifiers per kind; identifier-shaped queries never fuzzy; tiers and ordering; ambiguity; bounds and `invalid-query`; status pass-through; evidence and revision; relationships (`contains`, `mentions`, unresolved, self-mention); traversal bounds, cycles and `not-found`; permutation determinism; guard. |
| **S2 PostgreSQL proof** | composition test over `MemoryRepository.read` | Revoked Jira grant: a PR's mention of a Jira key becomes unresolved, and a search for that key gives `no-match`, both identical to a nonexistent key; `totalMatches` and traversal do not change with hidden rows; another workspace returns nothing. |
| **S3 Corpus** | the frozen labelled corpus and its evaluation spec | Every corpus case passes. |

No controller, module registration or route: COG-07 owns exposure. Each slice's check is `npm run check` in `server/` (needs Docker).

## 5. Acceptance mapping (BACK-106)

| BACK-106 deliverable | Covered by |
| --- | --- |
| Stable identifiers, original text, aliases, lexical normalization, deterministic ranking, ambiguity and abstention | R2, R3, R4 |
| Bounded results and access-aware relationship traversal; evidence refs and revision for each result | R4 bounds, R6, R5 |
| Arabic/English, identifier collisions, stale and conflicting facts, multi-hop, missing data, revoked grants, hidden existence; no leak through ranking, counts or traversal | S1, S2, S3 corpus |
| Compare the baseline with an optional graph/index/provider on identical held-out inputs | R8: nothing proposed, so no comparison is run; the corpus is the fixed input for any later one |
| No LLM, no embeddings, no new dependency, no copied restricted code | R7 guard; §1 non-goals |
| Stop after reviewable evidence; no production UI, external writes or deploy | §4 |

## 6. Reuse before build

| | |
| --- | --- |
| Inspected | `server/src/memory/*`, the COG-01 research port (`memory.ts` `normalize`, `tokens`, `retrieve`), `server/test/memory/*`, `server/test/db/store-harness.ts`, BACK-14 inventory (no retrieval component in Retail Tower's reuse matrix) |
| Strategy | **ADAPT** the research port's normalization, exact-identifier rule and abstention, extended with ta marbuta, alef maqsura and digits. **REUSE** the COG-02 projection, `canonicalJson`, `scopeRoot` and the memory test fixtures. Nothing copied from Retail Tower; no runtime dependency. |

## 7. Risks and stop conditions

| Risk | Mitigation |
| --- | --- |
| A key-like word in a title is not really a reference ("ISO-9001") | It only becomes an edge when a visible item has that exact key; otherwise it is an unresolved mention, labelled as such. |
| Titles change between revisions | Text comes from the current revision; history is not searched (a later decision if a consumer needs it). |
| Latency at retention volume | Inherits the COG-02 read (background only, DEC-5); retrieval itself is linear in visible items. |
| Labels are not independent | R8: COG-08 relabel before any claim of quality. |

**Stop and return to the owner if:** a slice needs a schema change, dependency, route or live data; a test shows a hidden row changing any output; or a consumer needs fuzzy, semantic or history search.

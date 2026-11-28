# BACK-184 — Capability inventory, risk and reuse matrix

Repository truth at `df529ce` (main, 2026-11-28). Inventory by a read-only explorer pass, then spot-checked by hand (no Three.js/WebGL import in `app/src`, `server/src`, `js/`; nothing in `server/src` imports `server/src/learning`; GitHub transport needs `KAWALYS_GITHUB_*` settings that are unset on the pilot per the release 6 record). Test counts are regex estimates, not a run, except where `benchmark.md` says a suite was run.

Size: 195 commits since 2026-11-15; ~57k lines in `app/src` (incl. an i18n snapshot), ~9k in `server/src`, ~18k in `server/test`; ~239 test files, ~2,400 test cases; 6 migrations.

## 1. Inventory (state legend)
`SHIPPED+TESTED` real code on main with tests · `FIXTURE` works only on committed synthetic data · `MOCK` canned UI · `UNBUILT` approved plan, no code · `VISION` future only.

| Area | State | Evidence |
|---|---|---|
| Evidence store (typed evidence, citations, forced RLS, append-only audit) | SHIPPED+TESTED | `server/src/evidence/evidence.repository.ts`; `FORCE ROW LEVEL SECURITY` in migrations 0001/0003/0006; `server/test/evidence` (~190 cases), `server/test/db`; Neon isolation 22/22 (BACK-114) |
| Owner auth, deny-by-default, hidden = not found | SHIPPED+TESTED | `auth/capabilities.ts` (single `owner` role; personas grant nothing), Descope verifier; `server/test/auth` (~148); #76/#78/#83 |
| HTTP hardening (request id, limits, idempotency, Host allowlist) | SHIPPED+TESTED, deployed (release 6) | BACK-172, #178; `server/test/http` (~54) |
| Source identity approval, session lock | SHIPPED+TESTED | BACK-131 #173; BACK-127 #174 |
| Investigation room with project observations, citations; owner-only `POST /investigations` | SHIPPED+TESTED; pilot DB holds no cases | BACK-148 L/L2 #181, M #184, #185 |
| Decisions and notes persisted with audit, cursor paging | SHIPPED+TESTED (live mode) | migration 0004, #113, #122 |
| Portfolio, multi-project | SHIPPED+TESTED | BACK-49 #101; second-project case #179 |
| GitHub read-only transport (GET only, pinned repo id, down-scoped token) | SHIPPED+TESTED with fakes; **inactive** (no App, no real data) | BACK-52 slice A #182; `test/connectors/github` (~95) |
| Jira / Confluence | FIXTURE (ports and observers, no transport) | `jira.transport.ts:1` "Nothing in src/ implements it" |
| Sentry, Datadog, Port connectors | none | — |
| Cognitive core: memory (COG-02), retrieval (COG-03), live search (COG-07) | SHIPPED+TESTED | `server/src/memory`, `retrieval`; `GET /cognition/projects/:id/search`; 11 review rounds (#151) |
| Reasoning (COG-04) | FIXTURE (not wired to any route) | `cognition.controller.ts:5` |
| Outcome learning (COG-05) | FIXTURE, activation blocked | `server/src/learning`, migration 0006; no importer in `src` |
| COG-06 uncertainty | UNBUILT (deferred) | `BACK-109/cog-06-verdict.md` |
| Live memory read at real volume | measured to fail closed (3.3 s at 7 d, 98 s at 180 d vs 2 s budget) | PR #187 (open), per project memory note; treat as unverified until merged |
| Mission Map, Source Observatory, Replay, Flight Deck | MOCK (synthetic `WORLD` fixture), heavily tested | `app/src/lenses/screens/*`; e2e: map 34, observatory 14, replay 19, flight deck 13 |
| Unknown is never Healthy; stale/down/not-read states | SHIPPED+TESTED (UI and server) | `portfolio.model.ts:3`; `js/core.js`; app fix #14; 34 files assert it |
| Recorded conflict (not reconciled) | FIXTURE | `app/src/fixture/world.ts:120` (BACK-83), pinned by `parity.test.ts` |
| Cross-source correlation (deploy → error → ticket) | UNBUILT (BACK-182 To Do) | only user-written `Correlation` evidence type and COG-03 key-mention edges |
| Agent execution / governance of agents | none (Flight Deck agents are simulated) | BACK-166..169 are decision/conditional tickets |
| Arabic / RTL | SHIPPED+TESTED (English first) | `app/src/i18n` (~78 cases), 30 e2e specs, `arabic-copy.spec.ts`; native review BACK-31 |
| VIE (WebGL scene, Code Review Room) | UNBUILT (BACK-119..125 To Do); no WebGL dependency | `app/package.json`: react, react-dom, @xyflow/react, @descope/web-component |
| Software Factory | VISION (BACK-126 gated planning; zero repo hits) | — |
| Eight VIE design workshops / 55 decisions | no durable record in repo or Jira; BACK-119 owns recovery | BACK-118, BACK-119, BACK-126 text |
| Kawalys MCP / Intelligence API | UNBUILT; owner recorded the direction on 2026-11-28 | BACK-168 |
| Live pilot (kawalys.kemetralabs.com) | deployed, release 6, owner sign-in works; BACK-51 gate not signed off | `docs/planning/BACK-117/` |

## 2. Capability vs connector-backed Claude Artifacts

Legend: **SUB** directly substitutable · **PART** partially substitutable · **DIFF** differentiated with evidence · **UNV** unverified (no evidence either way).

| Capability | Verdict | Why (evidence) |
|---|---|---|
| Dashboard of source data, per-source state, refresh | **SUB** | Claude Data shows each chart's query and last refresh (S6); benchmark B2 PASS on the Artifact |
| "Evidence on every number" display (BACK-181 as written) | **SUB/PART** | Claude Data already marks every figure with its source (S2, S6). Kawalys' remaining edge is semantics (Unknown never Healthy, not-read vs empty), which an artifact can copy in code (B5 PASS) but does not enforce |
| Cross-source correlation logic on clean data | **SUB** at fixture scale | B3: Artifact PASS in one build pass; Kawalys NOT BUILT |
| Correlation on real, messy, multi-source history (entity resolution, release mapping, backfill) | **UNV** | Neither side has it. Needs ingestion and history, which an artifact does not have (no backend, no scheduled collection: S3, S6) |
| Decision log across sessions | **PART** | Artifact store persists, editor-only writes enforced (B4). Kawalys adds append-only audit, citations as rows, RLS, idempotency (server tests). Value of that difference to a solo user is unproven |
| Scoped visibility of evidence inside one workspace | **DIFF** (server) / **SUB** (single user) | Artifact: attached files and shared rows are readable by every viewer; a persona filter is client-side (B6 FAIL). Kawalys: forced RLS, deny-by-default, hidden = not found, tested. For a solo founder this difference may not matter |
| Durable ingestion, scheduled refresh, history beyond a page view | **DIFF (architecture), UNV (value)** | Artifacts are client-side, viewer-scoped, refresh only while open (S3, S6). Kawalys has the server and scheduler but **no active real source** yet |
| Governance / audit of who saw what | **PART** | Claude Enterprise: Compliance API audits publish/share/delete (S3), per-viewer connector approval. Per-evidence access log is not documented for artifacts; Kawalys' is unbuilt (BACK-183) |
| Multi-provider agent workflow | **UNV** | Artifacts: documented (write via connectors, call Claude) but untested here. Kawalys: none |
| Mission Map / Observatory / Replay / Flight Deck visuals | **SUB** (as visuals) | Mock data; any of these can be generated as an artifact page in minutes. Their value depended on real evidence behind them |
| VIE 3D scene, Software Factory | **SUB/UNV** | Unbuilt; a WebGL artifact page is within artifact limits (CDN scripts allowed, S3). Differentiation would have to come from data, not rendering |
| Cognitive core (memory, retrieval, search) over permitted evidence | **UNV** | Shipped and reviewed, but only over an empty pilot DB and fixtures; live read measured to fail closed at real volume. Claude has its own memory/projects; no comparative test |
| Arabic-first UX | **PART** | Kawalys tested EN/AR/RTL; Claude can render Arabic pages on request. Native-quality claim needs users (BACK-3, BACK-31) |
| Self-hosting, data residency, no Claude seat required | **DIFF (structural)** | Artifacts need a claude.ai account and Anthropic API; not on Bedrock/Vertex/Foundry; no CMEK/HIPAA/ZDR (S1, S3). Kawalys runs on owned infra. Demand unverified |
| MCP/Intelligence API serving Claude and other clients | **UNV, complementary** | BACK-168. Turns artifacts from substitute into a front end. Artifacts call only remote connectors (S3), so this needs a hosted, authenticated endpoint |

## 3. Reuse map if direction changes

| Asset | Reusable for | Notes |
|---|---|---|
| Evidence store + RLS + audit + idempotency (`server/src/evidence`, migrations 0001–0006) | Any direction that keeps a backend: Intelligence API/MCP, team product, self-hosted ledger | Highest-value asset; independent of UI |
| Auth (Descope, sessions, deny-by-default), BACK-172 HTTP hardening, deploy stack (`deploy/pilot`) | MCP server auth, any hosted service | Needs a multi-principal model for teams (BACK-170/171) |
| GitHub transport (BACK-52) and observers (Jira/Confluence ports) | Ingestion for any direction | Activation is owner work, not code |
| Cognitive core memory/retrieval/search | MCP tools (`understand_project`, `search_knowledge` in BACK-168) | Real-volume performance must be solved first (PR #187) |
| Portfolio and source-state model, Unknown semantics | API contract and any UI | Semantics are the portable part |
| React app (`app/`), lenses, i18n | Owner UI; reference designs | UI layer is the most substitutable part |
| Root prototype (`js/`) | Demo and design reference only | Already superseded by `app/` |
| Test suites (~2,400 cases), CI classifier | Keeps any retained part safe | Carries maintenance cost for retired parts |

## 4. Sunk cost vs incremental cost

- **Sunk (ignore for the decision):** 195 commits over 14 days, the visual lenses, the prototype, 11 cognitive review rounds, the pilot deployment. None of this is recovered by continuing or lost by narrowing; only its *reuse value* (section 3) counts.
- **Incremental, still ahead under "continue as planned":** VIE-01..08 (8 tickets incl. a WebGL engine), Software Factory planning, BACK-181..183, COG-05 write path and activation, live reasoning (BACK-156), real-volume memory reads, real connectors beyond GitHub, team/tenancy (BACK-170/171), commercial (BACK-176..179). Rough order: months of solo engineering time plus ~$12/month host and a Neon plan already running.
- **Opportunity cost:** every week spent on UI layers that Claude can generate is a week not spent proving the one thing an artifact structurally cannot do (durable, scoped, server-side evidence over real sources) or asking users whether they want it.

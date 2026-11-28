# BACK-166: DeepSeek Harness v0.2.3-alpha.3, architecture and reuse audit (decision pack)

- **Status:** research only, for owner review. Not ratified. Nothing is selected or authorized.
- **Date:** 2026-11-28.
- **Direction:** B+ (BACK-184 comment 19204). Standing principle "own the experience, reuse the engine" (19206).
- **Accountable ticket:** BACK-166 (D02 runtime/source, D04 limits and cancellation). Related: BACK-14, 103, 118, 126, 167–169, 184.
- **File state:** uncommitted, in worktree `back-97-7de124` (branch `claude/deepseek-harness-audit-a479b6`).

## 0. Evidence baseline and disclosures

| Item | Value |
|---|---|
| Kawalys | `origin/main` = `49eab2dcdd1e927f5d0fa2f0d40339b42f78df45`, fetched 2026-11-28. The worktree was at the same SHA and clean. Six other worktrees exist; none was touched. |
| Harness | Clone of `github.com/deepseek-ai/deepseek-harness`, tag `dsh-v0.2.3-alpha.3` → `841f76d3c51966375ebed9b25512ebce4ac02079`. Matches the expected SHA. |
| Tag type | Lightweight (unsigned). GitHub shows an "Immutable release" for this tag pointing at `841f76d`, published 28 Nov 12:36 UTC. |
| Newer releases | None. At fetch time (about 13:00–14:00 UTC, 28 Nov), `origin/HEAD` was `841f76d`, the same commit as the baseline. The baseline was not switched. |
| Licence | MIT, © 2026 DeepSeek. Exceptions are in §6. |
| Permalink base | `https://github.com/deepseek-ai/deepseek-harness/blob/841f76d3c51966375ebed9b25512ebce4ac02079/` (written `B/` below). |

Evidence labels: **SOURCE** (read in pinned code), **DOC** (repo or official docs claim), **COMMUNITY** (discussion or press), **INFERENCE** (my reasoning). **TESTED: none.** No Harness code, dependency install, provider login or model call was made for the audit.

Disclosures:

1. One audit subagent ran a trivial `node -e "1"` and an empty `python -` in a shell loop. No repo code ran, and the clone was not modified. This still broke the "no execution" instruction.
2. `codex login status` was run to check that the independent reviewer was already authorized. It is a status read, not an authentication.
3. On Windows the clone needed `core.longpaths=true` because fixture paths are long. This is itself a small Windows-compatibility signal.
4. Packages under `node_modules` were not inspectable, because nothing was installed. These include `@botiverse/oar` 0.67.0 and `pi-ai`. Claims about their internals come from DSH's patches, READMEs and tests.
5. DeepWiki was not used: the pinned source is authoritative and was read directly.
6. Firecrawl was used for:
   - the releases page
   - discussions #10265, #10507 and #11820, read as summaries, COMMUNITY
   - one Developer Index search

   Comment 19205's earlier official-docs fetches (Claude headless/SDK plan terms, Codex App Server, ACP) were reused, not re-fetched.
7. PR #189 is **merged** (head `db6ac24`), not the draft described in comment 19204.

Detailed evidence with per-line permalinks is in `evidence/01–07*.md`, next to this file. Those files are raw subagent and reviewer reports. **Where they conflict with this pack, the pack overrides them.** For example, evidence/04 says Windows `additionalWritableRoots` are "ignored"; R12 corrects that.

---

## 1. Executive verdict

**Findings (facts).**

- **DSH is a full desktop/web/CLI agent product with its own engine, not a library.** The engine (`AgentLoop` and `ReactLoopAgent`, `B/packages/core/agent-loop/src/agent.ts#L110`) runs only inside DSH's vendored Cordis container, launched as named `dsh` profiles (DOC `B/docs/architecture.md#L43-L45`). The "SDK" spawns a `dsh` subprocess over stdio JSON-RPC and has no cancel method on the wire (SOURCE `B/packages/sdk/client/src/index.ts#L12`).
- **Kawalys needs no execution engine for its next gated slice.** BACK-167 is observation-only. Native Claude Code and Codex are the engines. A DSH engine would duplicate theirs.
- **DSH's Claude and Codex integrations return only an answer to the parent.** All three paths give the parent the final answer text plus a terminal status. They do not pass on the child's lifecycle:
  - Fixed Codex provider: drives `codex app-server --stdio`, a process that DSH itself launches. It correlates `turn/started`, tracks declined command and file items, and records ordered approval diagnostics. It answers native requests fail-closed: cancel where offered, otherwise decline, and empty grants for permission requests; the optional `approve-for-me` mode selects native auto-review. The answer comes from `agentMessage` and `turn/completed`. Token usage is not carried; `usageLimitExceeded` is only an error class (SOURCE `B/packages/subagent/subagent-codex/src/wire.ts#L32-L66`, `#L120-L130`, `#L514-L695`).
  - Fixed Claude provider: uses the official Agent SDK `query()` with `persistSession:false`. It consumes the `result` message and `system/permission_denied`. Its permission callback denies by default but has a branch for bypass mode (SOURCE `B/packages/subagent/subagent-claude-code/src/run.ts#L236-L261`, `#L326-L370`).
  - OAR: keeps root `text_delta` for the answer and waits separately for the turn to end (SOURCE `B/packages/experimental/subagent-oar/src/run.ts#L225-L245`).

  The native interfaces carry lifecycle, approval and interrupt data. That is SOURCE-proven for Codex app-server via DSH's own client, and DOC-only for Claude. DSH does not pass this data on.

  **Important limit:** the app-server path observes runs that the host itself launches. Passively observing a run the user starts needs a different surface: `codex exec --json` output, or Claude stream-json or hooks. DSH has no passive attach or transcript importer (reviewer finding 1 and 4, §9).
- **No external-agent path yields an independently verifiable outcome for the task.** Both fixed providers do record process exit code and signal, but only as failure diagnostics (SOURCE `subagent-codex/src/run.ts#L84-L98`, `subagent-claude-code/src/run.ts#L78-L94`). Separately, the Web workspace-change recorder compares Git snapshots per top-level turn, which can include child effects. Its comparisons expire with the session, and concurrent user edits can mix into the same diff (DOC `B/packages/deliverables/workspace-changes/README.md#L12,#L44-L48,#L88-L96`). No path runs tests or binds a durable diff to the run. The OAR README says changes made before cancellation "remain in place" (DOC `B/packages/experimental/subagent-oar/README.md#L164`).
- **Several defaults conflict with Kawalys governance.** Details are in §6:
  - OAR adds `--dangerously-skip-permissions` unless `--permission-mode` is set. Comment in the patch: "YOLO by default".
  - Desktop analytics are on by default, with no user control.
  - BYOK keys are stored in plaintext YAML.
  - A subscription-OAuth LLM path exists.
  - SAFETY.md says the project is "not been security audited".
- **Maturity.** Alpha or rc only: 45 tags since 17 Aug 2026. 5,085 commits and 18 `!:` breaking commits between `dsh-v0.2.2-rc.1` and the pinned tag. The README says compatibility-breaking changes will happen.

**Recommendation.**

- **Primary posture:** Option **A (native-first)**, with **E-lite**: REFERENCE DSH designs and ADAPT a few small MIT files with attribution.
- **NO-GO:** Harness-first (D) and Harness as a dependency (B as npm packages, C as a runtime) for now.
- **Expected net saving from DSH:** small, a hypothesis of about 2–6.5 person-days across the next two slices (§5, unmeasured). The big avoided cost, not building an agent engine, comes from native agents, not from DSH.
- **Smallest next step (§8, P0):** a read-only, no-model-call **event-mapping contract** from native Codex and Claude event schemas to Kawalys evidence, plus one synthetic fixture. This reduces the most uncertainty for the least cost.

---

## 2. Historical versus current capability

**Historical record, corrected.** Comment 19205 cites "prior conversation records (17 Aug and 1 Oct 2026)" that recommended reference-only use. **No such dated artifact was found** in Confluence, Jira, GitHub (Kemetra-Labs), local Claude Code transcripts or the Retail-Tower-Erp repo (`evidence/06-history.md`). That claim remains **unverified**. It may come from ChatGPT conversations that are not in these systems.

The only durable prior record is Confluence page 24182803, "Retail Tower — Extension Runtime & Capability Contract Architecture". The page is owner-approved planning, created 2026-10-07, v3 dated 2026-11-18. Its "Research reference" section has one undated line: DeepSeek Harness / Cordis "was used as an external architecture reference for capability seams, lifecycle/effect ownership, composition/profiles, compatibility and failure lessons. It is reference material only." No version was recorded.

**Capability timeline from release dates** (DOC and COMMUNITY: release notes, Pandaily):

| Date | Release | Relevant capability |
|---|---|---|
| 2026-08-17 | 0.1.0-rc.7 (earliest tag in clone) | Core runtime, Cordis plugins |
| Aug (about rc.8) | 0.1.x | Claude Code / Codex installable as profile bundles in the subagent system (COMMUNITY) |
| 2026-10-21 | 0.2.1-rc.2 | Community security audit (#10507): sandbox, plaintext credentials, git hook execution, telemetry |
| 2026-10-28 | 0.2.2-alpha.2 | Experimental `subagent_oar` (one-shot delegation to local Codex/Claude) |
| 2026-11-04 | 0.2.2-rc.1 | OAR plus experimental change requests and worktrees |
| about 0.2.2-rc.2 | — | Named multi-level subagents; AgentTeam per session; worktree review |
| 2026-11-15 / 11-25 | (commits) | Breaking: optional SQLite session backend, then rows-per-event (`a3c870e3e4`, `cbc6457226`). Shipped profiles still mount JSONL (SOURCE `B/packages/bundle/base/cordis.patch.yml#L142`). |
| 2026-11-22 | 0.2.3-alpha.1 | Experimental Timeline (task tree and progress reports); GitHub/GitLab code review page; plugin auth providers |
| 2026-11-28 | 0.2.3-alpha.3 | Worktree sessions can commit in workspace-write (not on Windows, §3); unified PR/MR review; Timeline improvements |

**Implication.** Any evaluation before late October could not have seen OAR, teams, worktree sessions or Timeline. The external-agent surface changed most since then. The architectural conclusion ("reference, not core dependency") holds at the current tag, now with source evidence.

---

## 3. Subsystem audit summary (ordered by potential savings)

Full detail with line permalinks is in `evidence/01–04`.

| Subsystem | Package / path (pinned) | Facts that decide reuse | Reuse class |
|---|---|---|---|
| Agent runtime | `packages/core/agent-loop` (`AgentLoop`, `ReactLoopAgent.turn/step`), `packages/core/tools/src/pipeline.ts` (`ToolExecutionPipeline`) | Cordis `Service` with 6 injected services and 9 workspace peer deps; not embeddable; profile-launched (SOURCE/DOC) | REJECT adoption; REFERENCE "model-visible means logged" |
| Cordis and plugins | `vendor/` (fork of cordis 4.0.0-rc.12 with local patches P2/U1/U2) | Plugins = `apply(ctx)` with `inject`; reversible effects. Pure files exist (`tools/src/json-schema.ts`, `session/src/validation.ts`, `repair.ts`), but every package peer-depends on Cordis and siblings (SOURCE). Docs call `dsh-scope` "dependency-free", but it imports Cordis. | REJECT container; per-file COPY/ADAPT only |
| Sessions and events | `packages/core/session/src/types.ts#L490-L497,#L518-L541`, `known-event-types.ts`, `session-persistence-jsonl`, `session-query/session-log-export` | Envelope `{type, seq, time, data}`, plus optional `ignorable` and, on message events, `surfaceOp`/`sourceEventSeqs`. Base profiles store checksummed zstd JSONL; `sdk-minimal` stores raw JSONL. An exporter emits canonical JSONL across backends, which is the better importer target. Contiguous `seq`, append-only JSONL with zstd frame checksums. Format v4 finalized and released. No event id, parent link, actor identity or hash chain; diffs not durable. Usage tokens yes, money no. Approvals, cancel and error recorded. Subagent = separate session with `parentSession`. | REFERENCE vocabulary; optional one-way v4 importer only if DSH is ever a source |
| External agents / OAR | `experimental/subagent-oar`, `experimental/tool-subagent-oar`, `patches/@botiverse__oar@0.67.0.patch`, `subagent/subagent-claude-code`, `subagent/subagent-codex` | Three paths, all one-shot text-only (§1). Approvals auto-declined (fixed) or recorded unanswered, so the run can hang (OAR). Cancel = AbortSignal, `session.abort` or `turn/interrupt` plus process kill; OAR cannot cancel during startup. OAR processes are outside DSH sandbox and descendant cleanup (DOC README#L163). Native versions pinned (Claude Agent SDK 0.3.263 → Claude Code 2.1.263; `@openai/codex` 0.153.4). | REJECT as observation or control path; ADAPT Codex `wire.ts` request/response handling as a reference client |
| Hooks bridges | `experimental/hooks-claude-code`, `hooks-codex`, `hook-protocol`, `claude-code-mods` | Opposite direction: they run the user's Claude/Codex-format hooks inside DSH runs. Not an ingestion path. 23/30 Claude and 5/10 Codex hook events unsupported (DOC). | REJECT for observation |
| Agent teams | `packages/team/agent-team`, `subagent/tool-subagent-control` | Single-process durable task board with compare-and-set ownership; shared checkout, advisory scopes; native agents are leaf children only | REFERENCE only (no duplicate queue or roster) |
| SDK and ACP | `packages/sdk/client`, `packages/acp/acp` (`@agentclientprotocol/sdk` 1.4.0, ACP v1) | SDK = subprocess client to a full `dsh`. ACP: DSH is an agent (server); `subagent-acp` client auto-answers permissions. Neither observes a user-initiated native run. | DEFER |
| Authentication | `packages/credentials/credentials-local`, `packages/llm/llm-pi-ai` | Native paths use the CLI's own login; DSH does not read `~/.claude` or `~/.codex` (SOURCE). BYOK: plaintext `~/.dsh/.credentials.yaml`; POSIX owner-only, check skipped on Windows (DOC). pi-ai OAuth: `openai-codex` → `chatgpt.com/backend-api`; provider env includes `ANTHROPIC_OAUTH_TOKEN` (SOURCE `provider-data.generated.ts#L12,#L34`); DSH stores and refreshes grants (DOC). | REJECT the subscription-OAuth pattern; REFERENCE masked-key UX |
| Worktrees | `experimental/worktree/src/index.ts#L363`, `name.ts` | `git worktree add --no-checkout -b` from a pinned commit. Hooks disabled (`core.hooksPath=/dev/null`; Windows effect unverified). Clean-only non-force removal; branches kept. Windows linked-worktree write grant registers nothing (SOURCE `sandbox-policy-git/src/index.ts#L35`). About 14 Cordis peers. | ADAPT rules and helpers (later, BACK-169) |
| Timeline and projections | `experimental/timeline`, `docs/subsystems/session-projection.md#L48-L120` | Timeline = agent task-tree/report plugin with `plugin:timeline/*` records, not a replay engine. Projection pattern: `init` plus pure `apply(state, event)`, checkpoint with `asOfSeq`, checkpoint-plus-tail = full replay. | REFERENCE/ADAPT the projection pattern for Replay; REJECT Timeline UI |
| Memory | (none); AGENTS.md loader, compaction | No long-term memory store. Compaction records shadowed seqs and summarizer usage. No overlap with K.Brain (evidence citations, provenance, authorization). | K.Brain stays BUILD (already built core); REFERENCE shadowed-seq provenance |
| Permissions and cancellation | `interaction/user-approval`, `bundle/base/cordis.patch.yml#L249-L286`, `subprocess/subprocess-local/src/windows-job.ts`, `core/tools/src/pipeline.ts#L356,#L413` | One-shot approvals (`allowed-once`/`rejected`/`cancelled`/`unavailable`), fail-closed. `approval/asked` and `approval/decided` events. Default workspace-write plus ask; a danger preset exists. Windows kill-on-close Job Object via koffi FFI; macOS descendants can escape. Truthful states: `ABORTED_BEFORE_DISPATCH`, `TOOL_OUTCOME_UNKNOWN`, forge ok/failed/unknown, "missing settle = incomplete". Windows sandbox restricts writes only. | REFERENCE semantics; ADAPT Job-Object pattern later; REJECT DSH sandbox or auto-review as controls |
| Packaging | root `package.json` (Node `^24.22.3 \|\| >=26.13.1`, pnpm 11.28.5), 451 package.json files, lockstep versions | Published scoped packages but no single embeddable bundle. Native builds (node-pty, koffi); 12 patched deps; Electron 44; stale `docs/dependency-catalog.json` (0.1.5-rc.1) | REJECT as dependency footprint |

**Tests and coverage boundaries** (from file and spec names; none run; detail in evidence/02–04):
- OAR: default CI runs a scripted runtime (`subagent-oar.spec.ts`, about 35 cases). Real-binary e2e is opt-in only (`DSH_OAR_E2E=1`; `DSH_OAR_NATIVE_PERMISSIONS=1` runs real Claude against a loopback fake API). Startup-cleanup and packed-artifact tests skip win32.
- Fixed Claude/Codex providers: keyless specs run the real bundled CLI against loopback fixtures.
- Worktree: about 315 cases, none Windows-specific.
- Session, projection (registry spec about 1,056 lines), JSONL persistence (migrations, lease, zstd, torn tail), compaction and timeline specs exist.
- **No test anywhere asserts a diff, git state or test result of a delegated task**, which supports the outcome-gap finding.

**Claude/Codex observability, against the brief's checklist:**

| Capability | DSH OAR | DSH fixed providers | Native interface itself (DOC per 19205; SOURCE where DSH's own client shows it) |
|---|---|---|---|
| Intermediate events | No | Used internally for correlation, ordering and denial tracking; not passed to the parent | Codex app-server item/turn events (SOURCE via `wire.ts`, host-launched only). `codex exec --json` events for passive capture (DOC, unverified at 0.170.0). Claude stream-json / SDK messages (DOC). |
| Usage | No | No (`usageLimitExceeded` is an error class, not usage) | Codex and Claude usage reporting: DOC only, unverified in this audit |
| Approval requests | Recorded, unanswered | Answered fail-closed (cancel, decline, empty grants); `approve-for-me` → native auto-review | Codex `item/*/requestApproval` (SOURCE `wire.ts#L577-L609`). Claude SDK `canUseTool` (SOURCE `run.ts#L326-L370`). Under passive `exec`, approvals may not be observable at all (to be determined in P0). |
| Cancellation | AbortSignal; not during startup | `turn/interrupt` plus kill; Windows Job | Available natively. A user Ctrl-C on a passive run shows up only as a missing terminal event. |
| Resume | No | No (ephemeral thread, `persistSession:false`) | Codex threads; Claude `--resume` (DOC) |
| Verifiable outcome | No | Exit code and signal as failure diagnostics only | None natively. Must come from git/CI, independent of the agent. |

**Reviewer-added implementation references (not a passive capture path):**
- `codex app-server generate-json-schema`, used in the Codex tests to generate a version-matched protocol schema with no model call (`B/packages/subagent/subagent-codex/tests/real-product.spec.ts#L221-L244`).
- Claude-shaped hook payloads emitted by `hooks-claude-code` (`src/index.ts#L322-L351`).
- The validate-then-convert pattern in the external-history importer `deepseek-chat-import` (`src/importer.ts#L486,#L569`).
- ACP client cancel and permission handling (`subagent-acp/src/run.ts#L420-L502`).
- ACP server-side thought, tool and usage projections (`acp/acp/src/updates.ts#L20-L101`).

---

## 4. Architectural option scorecard

Scores are 1 (poor) to 5 (best) for Kawalys at the next two slices (BACK-167 observation, then a BACK-169 isolated action). This is INFERENCE from the facts above, not measured.

| Criterion | A Native-first | B Component packages | C Optional runtime | D Harness-first | E Hybrid (A + copied DSH pieces) |
|---|---|---|---|---|---|
| Initial effort | 4 | 2 (Cordis peers) | 2 | 1 | 4 |
| Ongoing maintenance | 4 | 1 (weekly breaking) | 2 | 1 | 4 (copied files frozen, attributed) |
| Dependency footprint | 5 | 2 | 1 | 1 | 5 |
| Event completeness | 4 (native exposes it) | 1 | 1 (text-only children) | 1 | 4 |
| Subscription compatibility | 4 (user's own CLI login) | 3 | 3 | 2 (pi-ai OAuth path) | 4 |
| Authorization and isolation (Kawalys-owned) | 4 | 3 | 2 | 1 (DSH owns policy) | 4 |
| Windows/local | 4 | 2 | 2 | 2 (Windows sandbox partial, worktree commit gap) | 4 |
| Provider independence | 3 (one adapter per provider) | 3 | 4 | 4 | 3 |
| Integration complexity | 4 | 2 | 2 | 1 | 4 |
| Upgrade and rollback | 4 | 1 | 2 | 1 | 4 |
| Commercial licensing | 5 | 3 (Agent SDK terms, MPL kit) | 3 | 2 | 5 (MIT files only) |
| K.Brain / VIE fit | 5 | 3 | 2 | 1 (second event store) | 5 |
| **Total (/60)** | **50** | **26** | **26** | **18** | **50** |

**Scoring caveat (reviewer finding 8).** A and E get event-completeness credit for native protocol capability before any passive capture path is validated. That score is provisional until P0/P1.

The scores mix two different jobs:
- **Passive observation (BACK-167):** C and D bring no benefit here.
- **Isolated execution (BACK-169):** C is fairer than its score suggests. The `sdk-minimal` profile excludes telemetry, managed credentials and subagents, although it still carries a full engine and defaults to danger-full-access shell (DOC `B/packages/bundle/sdk-minimal/README.md#L12,#L37,#L53`).

Re-score C separately when BACK-169 is opened.

**A versus E tie-break.**
- **For BACK-167 (passive `exec --json`):** E is A plus patterns. DSH has no exec-stream code. The only evidence that this surface exists here is `codex exec --help` on 0.170.0, which lists `--json` and `-o`. Event names remain DOC and unverified.
- **For BACK-169 (Kawalys-launched app-server):** E adds value only if ADAPTing `subagent-codex/src/wire.ts` saves more than tracking Codex payload drift costs. DSH pins 0.153.4, this machine has 0.170.0, and #11820 shows `model_not_found` caused by the pin.
  - Cheap and safe: copying the request-type switch and fail-closed answers.
  - Not safe: copying the pinned schema. Generate types from the installed CLI with `codex app-server generate-json-schema` instead.
- **Recommendation:** E-lite.

**Provider independence caveat for A.** ACP may later reduce per-provider adapters, but no native ACP lifecycle was verified for Claude Code or Codex in this audit. MCP supplies tools and context, not run lifecycle.

---

## 5. Engineering savings estimate

Assumptions:

- One experienced TypeScript engineer.
- Estimates are person-days (pd) of build including tests, ranges not points.
- Kawalys' existing evidence store, auth and decisions are reused unchanged.
- No live runs are counted.
- An execution engine is out of scope for BACK-167 under every option.

| Work item (slice) | Build in-house (A) | DSH contribution (E) | Saving |
|---|---|---|---|
| Codex passive observer, `exec --json` → Kawalys evidence (BACK-167) | 3–6 pd | ~0 (DSH has no exec-stream parser; `wire.ts` is an app-server client) | 0 |
| Codex app-server client, Kawalys-launched (BACK-169, only if dispatch is approved) | 3–6 pd | REFERENCE `wire.ts` request taxonomy, fail-closed answers, interrupt; generate types with `generate-json-schema` from the installed CLI | 0.5–1.5 pd |
| Claude stream-json/SDK observer (BACK-167, second provider) | 2–4 pd | REFERENCE hook payload shapes and the importer's validate-then-convert pattern (unmeasured) | 0–0.5 pd |
| Replay projection (pure fold, checkpoint) | 2–4 pd | REFERENCE/ADAPT projection pattern | 0.5–1 pd |
| Truthful outcome vocabulary (ok/failed/unknown, aborted-before-dispatch, incomplete) | 1–2 pd | REFERENCE | 0.5–1 pd |
| Worktree create/cleanup rules (BACK-169) | 3–6 pd | ADAPT rules and `name.ts`; Windows gaps remain | 0.5–1.5 pd |
| Windows process-tree kill (BACK-169) | 2–4 pd | ADAPT Job-Object pattern (adds koffi native dep, or use `taskkill /T` fallback) | 0–1.5 pd |
| Approval audit events | 1 pd | REFERENCE asked/decided pair (Kawalys already has decisions/audit) | ~0.5 pd |
| **Total over two slices** | **17–33 pd** | | **about 2–6.5 pd, hypothesis** (net of attribution/review about 0.5 pd). Split: BACK-167 about 1–2.5 pd (patterns only: projection fold, outcome vocabulary, approval pair, Claude references); BACK-169 about 1–4.5 pd (app-server client, worktree, Job kill, snapshot diff). |

**These figures are hypotheses, not measurements** (reviewer finding 8). They exclude adaptation-verification cost and native payload-drift tracking. Re-estimate after P0.

Contrast with C or D:

- Integration: 10–20 pd.
- An importer from DSH v4 JSONL: 3–5 pd.
- Tracking about 2–3 tags a week with breaking changes: 1–3 pd a month.
- Security hardening: disable analytics and session-log upload, permission defaults, credentials.

In return, child runs would still give text-only results. **Net negative** for Kawalys' needs (INFERENCE).

---

## 6. Security, licensing and compatibility risk register

| # | Risk | Evidence | Severity for C/D | For A/E | Mitigation |
|---|---|---|---|---|---|
| R1 | OAR launches Claude with `--dangerously-skip-permissions` when `launchArgs` omit `--permission-mode` ("YOLO by default (repo policy, 2026-08-24)"). The `launchArgs` default is empty; the documented example sets `dontAsk`. | SOURCE `B/patches/@botiverse__oar@0.67.0.patch#L17-L24`; DOC `subagent-oar/README.md#L85-L105` | High | n/a | Never reuse OAR; Kawalys does not dispatch in BACK-167 |
| R2 | Native external processes run outside DSH sandbox and descendant cleanup; changes persist after cancel | DOC `subagent-oar/README.md#L163-L164` | High | Medium (same truth for native runs) | Verify from git/CI; disposable repo; BACK-169 gate |
| R3 | Desktop product analytics on by default with no UI toggle (a settings value can disable intake); exports device/user ids to `dsh-otel-collector.deepseeksvc.com`. Desktop composition only; `sdk-minimal` excludes telemetry. | DOC `B/packages/client/product-analytics/README.md#L10,#L24`; `B/packages/host/product-telemetry-otel/README.md#L34,#L43` | High (data egress) | n/a | Do not run DSH Desktop without explicit disable and egress approval |
| R4 | `session-log-deepseek` adds a session-log field to official DeepSeek API requests unless disabled | DOC `B/packages/session/session-log-deepseek/README.md#L10,#L35` | Medium | n/a | Same as R3 |
| R5 | BYOK keys in plaintext YAML (behavior of the local YAML credentials backend; `sdk-minimal` excludes managed credentials); Windows permission check skipped; same-user tools can read | DOC `B/packages/credentials/credentials-local/README.md#L115,#L199` | High | n/a | No DSH credential store; Kawalys collects no credentials |
| R6 | pi-ai subscription OAuth: `openai-codex` (→ `chatgpt.com/backend-api`, no env vars) is reached by a separate OAuth sign-in flow that DSH stores and refreshes. `ANTHROPIC_OAUTH_TOKEN` is only an env name in the Anthropic provider metadata; this audit does not show DSH running an Anthropic subscription OAuth flow. | SOURCE `provider-data.generated.ts#L12,#L34`; DOC `llm-pi-ai/README.md#L130,#L327`; pi-ai internals uninspected | High (provider terms) | n/a | REJECT pattern; native CLI login only (19206) |
| R7 | Claude Agent SDK and bundled Claude Code binaries are under Anthropic's terms ("SEE LICENSE IN README.md / LICENSE.md"). DSH's "project owner authorizes distribution" note is DeepSeek's statement, not Anthropic's, and does not extend to Kawalys. | SOURCE `B/THIRD_PARTY_NOTICES.md#L43,#L207-L220` | High (redistribution) | Low (use the user's installed CLI) | Never redistribute the SDK payload from DSH |
| R8 | Other non-MIT: `libreoffice-kit` MPL-2.0; `eslint-plugin-sonarjs` LGPL-3.0 (dev); OAR Apache-2.0 | SOURCE `THIRD_PARTY_NOTICES.md#L46,#L48,#L284` | Medium | Low | Copy only MIT files; keep notices |
| R9 | Trademark: "DeepSeek Harness" is registered; don't use the name in product names | DOC `B/BRAND_GUIDELINES.md#L7-L9` | Low | Low | Attribute as "DSH (MIT)" in provenance notes |
| R10 | Alpha churn: 18 `!:` commits since 0.2.2-rc.1; storage backend changes in November | SOURCE git log | High | Low (copied files frozen) | Pin and attribute copied code by SHA |
| R11 | Self-declared unaudited; community audit #10507 (on 0.2.1-rc.2) reports sandbox escape paths, plaintext secrets, git hook execution | DOC `B/SAFETY.md#L5-L15`; COMMUNITY #10507 (not reproduced) | High | n/a | Not a control; no DSH in the trust boundary |
| R12 | Windows sandbox restricts writes only (not reads, network or process visibility). Extra writable roots apply only to Harness filesystem operations, not to process confinement. Linked-worktree write grant is skipped on Windows. | SOURCE `B/packages/sandbox/sandbox-windows-acl/src/index.ts#L20-L32`; `sandbox-local/src/index.ts#L376-L385`; `sandbox-policy-git/src/index.ts#L35` | High (Windows dev machine) | n/a | Isolation comes from a disposable repo or VM, not DSH |
| R13 | Native version pins drift (Codex 0.153.4 vs installed 0.170.0; #11820 `model_not_found`); Claude CLI pinned to bundle payload (#10265) | SOURCE `subagent-codex/package.json#L54`, `subagent-claude-code/package.json#L51`; COMMUNITY | High | Medium | Kawalys adapters target the user's installed CLI; version check is a stop condition |
| R14 | Env scrub by name regex only (`/KEY\|PASSWORD\|SECRET\|TOKEN/i`); native login under HOME remains reachable by children | SOURCE `B/packages/subprocess/subprocess/src/index.ts#L47-L84` | Medium | Medium | Kawalys passes no secrets; observer reads output only |
| R15 | Approval events lack approver identity; one-shot grants only | INFERENCE from `persistence-catalog.md#L226-L292`; DOC `user-approval/README.md#L164-L168` | Medium | n/a | Kawalys decisions/audit remain the authority |

---

## 7. Reuse ledger

| Capability | Existing Kawalys implementation (49eab2d) | DSH candidate | Decision | Evidence | Savings | Risk | Validation |
|---|---|---|---|---|---|---|---|
| Agent execution engine | None (not needed for BACK-167) | `core/agent-loop` | REJECT | §3 runtime | n/a (native agents are the engine) | Duplicate engine | n/a |
| Plugin container | NestJS modules in `server/` | vendored Cordis | REJECT | `vendor/README.md` | — | Fork upkeep | n/a |
| Agent run observation (Flight Deck), BACK-167 | Synthetic `AgentFlightDeck.tsx`, `contract/world.ts` (AgentCapability only simulated/not_available) | OAR / fixed providers (no passive capture) | BUILD passive observer from `codex exec --json` docs | §3 checklist | 0 | Undocumented event drift (R13) | P0 mapping contract; P1 live proof |
| Kawalys-launched Codex client, BACK-169 | None | `subagent-codex/src/wire.ts` | REFERENCE/ADAPT (only if dispatch is approved) | §1, §3 | 0.5–1.5 pd | Payload drift (R13) | Schema generated from the installed CLI |
| Event vocabulary | `ActivityEvent`, `ReplayEvent` (synthetic) | `core/session` event types | REFERENCE | `known-event-types.ts#L22-L88` | 0.5 pd | None | Contract review |
| Event store | Postgres evidence, append-only, forced RLS | JSONL v4 session log | REJECT as store; DEFER importer | §3 sessions | — | Second store | Only if DSH becomes a source |
| Replay projection | `lenses/logic/replay.ts` (fixed fixture cursor) | session-projection pattern | ADAPT (pattern, not code) | `session-projection.md#L48-L120` | 0.5–1 pd | None | Unit tests: checkpoint plus tail = full |
| Outcome truthfulness | Evidence `state` ok/stale/unknown/denied/error | ok/failed/unknown; ABORTED_BEFORE_DISPATCH; TOOL_OUTCOME_UNKNOWN; missing-settle = incomplete | REFERENCE | `forge-github/src/mutation.ts#L32-L36`; `jobs.md#L27`; `repair.ts#L15-L18` | 0.5–1 pd | None | Negative tests in P0 fixture |
| Verified outcome | None (agent self-report not evidence) | Exit code/signal diagnostics; non-durable Git snapshot diff (`deliverables/workspace-changes`) | BUILD (git/CI oracle, existing GitHub connector and Actions/Depot); REFERENCE the snapshot-diff approach | §1 | ~0.5 pd | Diff mixes concurrent edits | P1 oracle |
| Decisions and approvals | HumanDecision evidence plus audit trigger (migration 0004) | `approval/asked`/`decided` | REFERENCE | `user-approval/src/index.ts#L247-L260` | ~0.5 pd | No approver id in DSH | — |
| Authorization | Descope plus capabilities, deny-by-default | DSH permission presets | REJECT | §3 | — | Duplicate policy | — |
| Subscription / BYOK | None (no credentials collected) | pi-ai OAuth; plaintext BYOK | REJECT | R5, R6 | — | Provider terms | Entitlement check in P1 |
| Worktrees | None in Kawalys code | `experimental/worktree` | ADAPT later (BACK-169) | §3 | 0.5–1.5 pd | Windows gaps (R12) | Windows-specific tests |
| Process kill / cancellation | None | Windows Job Object, process-group fallback | ADAPT later (BACK-169) | `windows-job.ts#L95-L127` | 0–1.5 pd | koffi native dep | Orphan test |
| Sandbox | None | `sandbox-*` | REJECT as control | R11, R12 | — | False security | — |
| Agent teams / task board | None (no queue by design) | `team/agent-team` | REJECT (would duplicate queue/roster) | §3 | — | — | — |
| Scheduler | `github.scheduler.ts` refresh timer only; BACK-97 owns scheduling | `ctx.schedule` | REJECT | `schedule.md#L5` | — | Duplicate scheduler | — |
| Memory / K.Brain | Memory, retrieval, reasoning, learning core (server) | none (compaction only) | BUILD (exists); REFERENCE shadowed-seq provenance | §3 | — | — | — |
| Visual Intelligence | Plan-only (VIE); 2D prototype | `experimental/timeline` | REJECT UI; REFERENCE task-tree/report idea | `timeline/README.md#L8-L12` | ~0 | — | — |
| Code review / forge | GitHub read-only connector | `forge-github` (head-SHA-pinned merge, stale on moved head) | REFERENCE (for a future Code Review Room) | `forge-github/README.md#L51-L63` | later | Write paths gated | — |
| SDK / ACP integration | None | `sdk/client`, `acp/acp` | DEFER | §3 | — | Alpha | Re-check ACP per provider |
| JSON-schema / tool-schema helpers | zod/Nest validation | `core/tools/src/json-schema.ts` | DEFER (no current need) | evidence/01 | — | — | — |

---

## 8. Recommended minimum experiment (not executed)

**Goal.** User-initiated agent task → observable lifecycle → independent review → deterministic verification → evidence-backed Flight Deck and Replay. Start with one provider.

**P0: read-only preflight (no model calls, no installs, no logins). Proposed next step.**

1. Write an event-mapping contract **for the exact surface P1 will capture**: `codex exec --json` output from a run the user starts. This passive surface is not the app-server protocol, which needs Kawalys to launch the process and therefore belongs to BACK-169.
   - Map to Kawalys evidence fields: source/run/attempt identity, observed vs source timestamps, status, usage where reported, terminal state, outcome reference.
   - State explicitly which lifecycle events that surface can and cannot supply. Approval requests and usage may be absent.
   - Define how a user interrupt is established: a missing terminal event means incomplete/unknown, never complete.
   - Define how run identity, repo SHA and exit status are bound to the capture. The verifier, not the agent or wrapper, records the before/after repo SHA.
   - Schema sources: official docs for `exec --json` (DOC). For the later app-server path, `codex app-server generate-json-schema` (shown in DSH tests at 0.153.4; check at 0.170.0 via `--help` only; runs no model). DSH `wire.ts` is a REFERENCE map of app-server request types.
2. Build one pinned, synthetic, redacted fixture trace with SHA-256. It covers missing, duplicate, reordered, late, interrupted, approval-pending and unknown-outcome cases.
3. Map it onto the existing Flight Deck and Replay contracts. List the gaps. No server or schema change.
4. Exit: an owner-reviewed contract, plus a list of what needs schema or auth change, which goes to its own gate.

**P1: live proof (needs separate owner approval under BACK-167).**

- **Environment:**
  - Windows 11, this machine.
  - Codex CLI 0.170.0, signed in with the user's own ChatGPT plan. No API key and no paid fallback.
  - Node 24 for Kawalys.
  - A disposable synthetic git repo with a pinned fixture and a SHA-256 hash.
- **Task:** a read-only analysis question with a known answer, for example "list functions in `fixture.ts` that lack tests". The user starts the run from their own terminal, `codex exec --json` writing to a file. Kawalys only ingests the file. No dispatch by Kawalys.
- **Expected events:** only those P0 established for `exec --json`, for example thread and turn start, items, and a turn-complete or failure event with usage if reported. Approval events are expected only if P0 shows the surface emits them. A missing terminal event must map to interrupted or unknown.
- **Outcome oracle:** a deterministic script compares the agent's claimed list with an AST-computed truth, run by Kawalys' verifier, never by the agent. Plus a git `status` showing no changes.
- **Independent review:** a second provider (Claude) reviews the result only after Codex observation passes. Same task, read-only.
- **Security and isolation:**
  - read-only sandbox (`-s read-only`)
  - disposable repo, no secrets or real data
  - no network beyond the provider
  - the observer reads files only, no new dependency
- **Entitlement checks:** confirm plan terms permit this local use (19205 sources). Record quota before and after where visible. Unknown stays unknown.
- **Budget limits:** at most 3 runs, each under 10 minutes. Stop at the first quota warning.
- **Cancellation and recovery:** one run is interrupted by the user (Ctrl-C). Kawalys must show it as interrupted or unknown, never complete.
- **Negative tests:**
  - truncated file
  - duplicated events
  - reordered events
  - an unknown event type, which must be preserved as unknown
  - stale file, which must show as stale
  - wrong repo SHA, which must be refused
- **Stop conditions:**
  - unknown or denied entitlement
  - CLI version outside the mapped schema
  - any write to the repo
  - credential material in the event stream
  - a permission prompt that cannot be observed
  - any paid API call
- **Acceptance:**
  - 100% of fixture lifecycle states are represented truthfully.
  - The oracle verdict comes from the verifier, not the agent.
  - Zero repo writes.
  - The interrupted run is shown as not complete.
  - The result is reported as PASS, FAIL, BLOCKED or NOT RUN, with exact versions.
- **DSH comparison arm (optional, recommend skip):** run the same task through DSH `subagent_codex` in an isolated VM with analytics and session-log upload disabled, then import its v4 JSONL. Predicted from source: FAIL on event completeness, because the child returns text only. Run it only if the owner wants empirical confirmation; it needs a separate install approval. Permission parity must be explicit: set Codex to read-only in the DSH provider config too, because its default leaves the sandbox to native config.

**P2: factory benchmark** stays under BACK-126 as described in 19205. Unchanged.

---

## 9. Independent review findings

**Run details:**
- **Reviewer:** OpenAI Codex CLI 0.170.0 (already signed in with the owner's ChatGPT plan; no new login).
- **Command:** `codex exec -s read-only --ephemeral --skip-git-repo-check -C <DSH clone> --add-dir <this folder> -o <out> -` with a prompt forbidding node/npm/pnpm/python, installs, writes, network and other Kawalys files.
- **Duration:** 2026-11-28 16:48:22 to 16:51:57 UTC, about 119k tokens, from subscription quota (no paid API).
- **Process check:** the log shows no node/npm/pnpm/python invocation, and the clone was unchanged afterwards.
- **Scope:** Codex saw the pinned DSH source plus the whole `harness-audit/` folder. That includes evidence/05 (Kawalys inventory) and evidence/06 (Confluence excerpts), so that private content went to OpenAI through the owner's account, as the brief's review step authorized. It did not see Jira directly, other Kawalys code, or this session's transcripts.
- **Status:** this is a review, not an approval.

| # | Sev. | Finding (summary) | Resolution |
|---|---|---|---|
| 1 | Major | P0 mapped app-server JSON-RPC while P1 captured `codex exec --json`; app-server evidence says nothing about the exec stream; interrupt, identity, SHA and exit binding unspecified | **Accepted.** §8 P0 now targets the exact P1 surface; app-server moved to BACK-169; binding rules added. |
| 2 | Major | "Keeps only answer and completion" understated `wire.ts`: it correlates turns, tracks declines, orders approval diagnostics, answers requests fail-closed, has `approve-for-me`. `usageLimitExceeded` is an error class, not usage. | **Accepted.** §1 and §3 corrected; the usage claim in the checklist was wrong and is fixed. |
| 3 | Major | OAR and Claude claims need narrower scope: bypass flag only when `launchArgs` omit a permission mode, the example sets `dontAsk`; Claude provider has a bypass branch; sandbox and cleanup gaps are OAR-specific | **Accepted.** §1 and R1 rewritten. |
| 4 | Major | Missed references: Codex schema generation, Claude-shaped hook payloads, `deepseek-chat-import` importer, ACP client and server projections. No passive attach or transcript importer exists. | **Accepted.** Added to §3; the Claude saving changed from 0 to 0–0.5 pd (unmeasured). Confirms no passive capture path. |
| 5 | Major | "None captures exit code" overstated: both fixed providers capture exit code and signal for diagnostics; a Web workspace-change recorder diffs Git snapshots (non-durable, mixes concurrent edits) | **Accepted.** §1 and the ledger corrected; independent test verification and durable attribution stay Kawalys BUILD. |
| 6 | Minor | Envelope also has `ignorable`, `surfaceOp`, `sourceEventSeqs`; `sdk-minimal` uses raw JSONL; an exporter emits canonical JSONL | **Accepted.** §3 updated. |
| 7 | Major | Risks vary by profile: Windows extra roots apply to Harness filesystem operations; analytics can be disabled in settings (no UI); plaintext BYOK is one backend; `ANTHROPIC_OAUTH_TOKEN` is metadata, while `openai-codex` has a separate OAuth flow; SDK notices leave redistribution and entitlement unresolved | **Accepted.** R3, R5, R6 and R12 scoped. R7 already marked the notice as DSH's own statement. |
| 8 | Major | Scorecard supports direction more than cost or re-entry gates; A/E credited before passive capture is validated; C inherits full-product costs although `sdk-minimal` is leaner; savings unmeasured; C re-entry should tie to a concrete second-engine need | **Accepted.** Scoring caveat added in §4; savings marked hypothesis in §5; C re-entry trigger revised in §11. |

**Reviewer verdict, summarized:**
- Supported: native-first for BACK-167, and deferring Harness-first for that slice. E-lite has credible reuse candidates.
- Unsupported: the quantified savings and the shared C/D re-entry gates. Both are now corrected or marked as hypotheses.
- Uncertain: passive lifecycle coverage, subscription entitlement, and the value of an optional runtime for BACK-169.

---

## 10. Existing Jira mapping (no new tickets proposed)

| Ticket | What this pack contributes |
|---|---|
| BACK-166 (D02, D04) | Inputs for runtime/source choice: native Codex first; DSH not selected. Cancellation and outcome truth requirements (§3, §8). |
| BACK-167 | P0 contract and P1 live proof (§8). |
| BACK-169 | Later ADAPT candidates: worktree rules, Windows Job kill. Not a sandbox. |
| BACK-126 | P2 factory benchmark unchanged; DSH not a factory base. |
| BACK-14 | Add DSH rows to the reuse inventory as REFERENCE/ADAPT items with SHA (§7). |
| BACK-118 / VIE | Timeline not reusable as UI; idea only. |
| BACK-103 / 168 | No overlap with K.Brain; MCP unaffected. |
| BACK-184 | The "DeepSeek Harness: unverified" row is now source-verified at `841f76d`. R3–R7 add provider-terms and data-egress risks. |
| BACK-97 | Do not adopt DSH schedule or team board. |

---

## 11. Dispositions

| Item | Disposition | Condition / re-entry trigger |
|---|---|---|
| D: Harness-first runtime | **NO-GO** | Re-enter only if DSH reaches a stable 1.0 with an audited sandbox, structured child-run events and Kawalys-owned authorization. |
| C: DSH as optional runtime behind an interface | **NO-GO for BACK-167; DEFER for BACK-169** | Re-enter when BACK-169 records a concrete need for a Kawalys-hosted engine that native CLIs cannot meet. Then re-score with composition-specific controls (for example `sdk-minimal` with sandbox and permission hardening, analytics absent). |
| B: DSH packages as npm dependencies | **NO-GO** | Cordis coupling and alpha churn; revisit with stable, Cordis-free published leaf packages. |
| E-lite: copy small MIT files and patterns with attribution | **CONDITIONAL GO** | Per-file review. Keep MIT notice and source SHA. Never copy OAR, pi-ai OAuth, credentials, analytics or sandbox. Follow ENGINEERING-REUSE-BEFORE-BUILD reporting. |
| A: native-first observation | **CONDITIONAL GO for P0** (read-only, no model calls) | P1 needs owner approval under BACK-167: runtime, auth mode, budget. |
| DSH comparison arm in P1 | **CONDITIONAL (recommend skip)** | Isolated VM, separate install approval, analytics off. |
| Subscription OAuth or credential proxying via DSH patterns | **NO-GO** | 19206 principle; provider terms. |

**Smallest next step that materially reduces uncertainty:** P0 step 1, the Codex event-mapping contract with a synthetic fixture. It needs no model call, install or login. It decides whether Kawalys' evidence model can represent a native run truthfully before any live source is approved.

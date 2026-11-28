# BACK-156 (COG-11): live task reasoning on a real plan — design and preflight

Status: **design for approval. Nothing here is built.** Prepared 2026-11-28 on `main` at `7dd3fcb`. Implementation starts only after the owner approves this design and the decisions in section 6.

## 1. Goal and milestone

Show useful, evidence-backed reasoning on a real software project: **Kawalys itself**. For the issues in one Kawalys Jira scope, the engine answers five questions:
- which tasks are ready;
- which are blocked, and by what;
- which dependencies are declared explicitly;
- which tasks can run in parallel;
- which task is the next safe one.

Every answer cites the evidence it rests on, and says unknown when the evidence does not settle it.

## 2. Preflight: what exists today (verified in code, 2026-11-28)

| Area | Today | Consequence |
| --- | --- | --- |
| Reasoning engine (COG-04, `server/src/reasoning`) | Pure and deterministic. Tasks are `jira_issue` items. A **dependency** targets another `jira_issue` and expects `complete`. A **check** targets a GitHub PR or issue and expects `open`, `closed` or `draft`. An **approval** is always `missing` (T3). Cycles are refused. The recommendation is the first `ready` task by spec id. Bounded at 50 tasks × 20 requirements. | Reused as-is. No engine change is needed for v1. |
| Independent validator (`reasoning.validator.ts`) | Recomputes the result by a different algorithm. Since slice 1 it also has `validateSerializedResult` with a 524,288-character cap. | Every live result is validated before it is returned. |
| Jira connector (`connectors/jira/jira.observer.ts`) | Fetches `fields=summary,status,updated`. Stores `key`, `summary`, `statusCategory`, `updatedAt` and `url`. **No issue links, no parent or epic.** | **Explicit dependencies are not in the evidence.** A reviewed connector extension is the first build step (D2). |
| GitHub connector (`connectors/github/github.observer.ts`) | Stores the repository, PRs (`state`, `draft`) and issues. **No CI or check-run data.** | PRs can be supporting evidence. CI status is not available in v1 (D4). |
| Memory and search (COG-02/03) | Read-only and grant-scoped. Hidden projects are never scanned. 2 s budget per read, 4 reads in flight, 30 per minute per user. | Reused. The plan read uses the same `readVisible`, budget, slots and limiter. |
| Live route (COG-07) | `GET /cognition/projects/:id/search`. Identical 404 for anything hidden. Generic error body when over budget or at capacity. | The plan read is a sibling GET in the same module, with the same guards. |
| Approvals (BACK-45) | Not wired into reasoning. | An approval requirement stays unknown and is never auto-granted (BACK-156 Q2). |

## 3. The plan contract (`plan-v1`, explicit facts only)

A pure module, `server/src/plans/plan.projection.ts`, maps a memory projection and a **scope** to the engine's existing `ReasoningInput`:

- **Scope:** the visible `jira_issue` items of one Jira project key (for v1, `BACK`) that are not `done`. A task is included only if it is visible to the reader. Hidden issues are filtered out **before** evaluation (BACK-156 AC2).
- **Task:** one `TaskSpec` per in-scope issue. The engine ranks by spec id in plain string order, where `BACK-10` sorts before `BACK-2`. So the projection encodes each spec id so that string order equals numeric order: the issue number zero-padded to 12 digits, well within `MAX_ID` (100). It maps the id back to the key in the DTO.
- **Dependency:** one requirement per declared Jira link of type *Blocks* in which this issue **is blocked by** another issue. It expects `complete`. Only links stated in Jira count:
  - no inference from text, mentions or PR titles;
  - user associations never become dependencies (BACK-156 scope).
- **Hidden blocker:** a blocking issue the reader cannot see gives the engine's neutral `missing` fact. The task is then `unknown`, exactly as if the blocker did not exist. That leaks nothing and never claims the task is ready.
- **Supporting evidence (not requirements):** PRs and issues whose title mentions the key, through the existing COG-03 `mentions` relation, are listed as context under each task. A mention never blocks or unblocks anything.
- **Bounds:** above 50 tasks or 20 blockers on a task, the result is refused with an explicit `scope-too-large`. It is never truncated into a complete-looking answer. BACK alone can hold more than 50 open issues, and the connector stores no epic or parent. So the v1 scope must be narrowable, by a Jira filter or by adding `parent` in C1. That is part of the Q1 decision.

### Answers derived from the engine's result, with no new rules

| Question | Answer |
| --- | --- |
| Ready | Engine state `ready`. |
| Blocked, and by what | State `blocked`, with each unsatisfied dependency's reason and evidence ids. |
| Explicit dependencies | The `blocked by` requirements of each task, each one cited. |
| Parallel work | All `ready` tasks. A ready task has every dependency complete, so no ready task waits on another, and they can proceed in parallel. This is a statement about declared dependencies only, not about people or capacity (BACK-97 stays out). |
| Next safe task | The engine's `selected` task: the first ready task by key, with no approval requirement. If none is ready, the answer is `no-ready-task` or `insufficient-evidence`, stated in words. |

## 4. Interface: one core, several adapters (BACK-168 ready)

- **Core:** a pure function, `planReadiness(projection, scope) → PlanReadiness`. It builds the input, runs `evaluate`, checks the result with the independent validator, and returns a versioned DTO (`plan-v1`):
  - **per task:** `key`, `state`, `blockers[]`, `dependencies[]`, `supporting[]`, and `evidence[]`;
  - **for the scope:** `parallel[]`, `next`, `kind`, `fingerprint` and `freshness`.

  If the validator does not accept the result, the answer is an explicit unavailable state, never the result.
- **HTTP adapter (v1):** `GET /cognition/projects/:projectId/plan?scope=BACK`, read-only, in the existing cognition module. It has the same guard, `evidence.read` capability, rate limit, read slots, work budget, identical 404 and generic error body as search.
- **Later adapters:** a BACK-168 MCP tool (`get_next_safe_task`, `get_blockers`) calls the same core, so it needs no second authorization path. The serialized validator boundary already exists for untrusted transports.

## 5. Changes and gates

| # | Change | Gate |
| --- | --- | --- |
| C1 | Jira connector: add `issuelinks` to `fields`, and store `blockedBy: string[]` (the keys of inward *Blocks* links, clipped to 20, with a `linksClipped` flag). Memory policy: add `blockedBy` to the `jira_issue` content fields (memory-v7), and update the coverage and fixture tables. | A payload change (BACK-48 kind). Reviewed connector and memory change with negative tests: a link to a project outside the source, a malformed link, more than 20 links. |
| C2 | The `src/plans` pure module, with its own guard (imports only memory types, reasoning and retrieval relations; no I/O). | Independent review. |
| C3 | The cognition route `GET …/plan`. The reasoning guard is relaxed to allow exactly one consumer, `src/plans`, and the cognition guard's import allowlist gains `../plans/…`. | Security review (same bar as #158). |
| C4 | The shadow view: the live reasoning panel replaces "not available live". It is labelled live, EN/AR/RTL, and says unavailable in words. | e2e-live and the app suites. |
| C5 | A demo on Kawalys: connect the BACK project and Backstage-OS, add *Blocks* links in Jira for one real slice of work, and record the answers against what is true. | Owner-run. Records PASS or FAIL per question. |

No schema change. No new dependency. No LLM: the engine is deterministic, and nothing here needs a model.

## 6. Decisions needed from the owner (BACK-156 Q1–Q3)

- **Q1, source and first job:** Jira project `BACK` as the plan source. The first job is "what can I work on next in Kawalys, and what blocks the rest?". Dependencies come from Jira *Blocks* links only. **Recommended.**
- **Q2, approvals:** they stay `unknown`, with no auto-grant, until BACK-45 defines how an approval is read, scoped, expired and revoked. A task with an approval requirement is therefore never the next safe task. **Recommended.**
- **Q3, synchronous or asynchronous:** measured in slice 1 (`docs/planning/BACK-154/2026-11-28-kawalys-volume-measurements.md`). At Kawalys volume, the current memory read takes 3.3 s after 7 days and 98 s after 180 days. **It does not fit the 2 s budget at any retention**, so a synchronous plan read on it would always fail closed. Live reasoning on real data therefore needs one of these first:
  - **(a) DEC-2 option A, recommended.** The prepared cache: runs and markers per source, bounded by an index. It needs re-measuring at Kawalys volume and a schema approval.
  - **(b) An asynchronous read.** The projection is computed once per poll in the background and the plan is served from it.
  - **(c) A shorter memory horizon.** This changes completeness under DEC-4.

  The demo (C5) can run on a fresh connection (under about 4 days of history) before this, but that is a demo, not operational proof.
- **D4, CI evidence:** not in v1. Adding GitHub check runs is a separate reviewed connector change, if the owner wants CI as a supporting signal.

## 7. Acceptance (from BACK-156, mapped)

- **The plan schema:**
  - identifies the task, source, revision, declared prerequisites, approval requirements and visibility;
  - refuses invalid, cyclic and duplicate specs through the engine's contract.

  Tests: the C2 unit tests.
- **Scope before evaluation:** hidden tasks and links cannot change visible explanations, counts or recommendations, including across revoke, regrant and a stale plan. Tests: DB cases modelled on `memory-db.spec.ts`, with a second project and hidden blockers.
- **Validator:** a live result is returned only if the independent validator accepts it. A missing approval stays unknown.
- **UI:** live reasoning is told apart from fixture output and from live search. EN/AR/RTL, keyboard support and an unavailable state. Rollback disables the read and loses no evidence.
- **Budgets:** the measured latency and work budgets are met at Kawalys volume, or the read fails closed.

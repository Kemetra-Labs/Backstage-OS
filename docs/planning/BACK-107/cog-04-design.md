# BACK-107 (COG-04) design: deterministic advisory reasoning with an independent validator

Status: **drafted 2026-11-27 under the owner's delegation ("go, let's complete the engine brain").** BACK-107's preconditions are COG-03 accepted, an explicit task/rule contract with policy approval, and a separate scope review before coding. This document **is** that contract and scope, for the owner to accept or override. S1 is built against it on the same branch so the review has running evidence, and it **stops for owner review**: nothing is merged, wired to a route or shown in a UI.

Epic [BACK-103](https://rahmaqanater.atlassian.net/browse/BACK-103). Inputs: the COG-01 research reasoner and validator (`server/test/research/cognitive-core/{reasoner,validator}.ts`), COG-02 memory ([cog-02-design.md](../BACK-105/cog-02-design.md)) and COG-03 retrieval ([cog-03-design.md](../BACK-106/cog-03-design.md)). Confluence KMC 95256578 W3.

## 1. Intent

Given tasks a person names and what they depend on, say which task is **ready** to work on next, which are **blocked** or **done**, and which are **unknown** because the evidence is missing, stale or conflicting. Every answer is linked to evidence. A second, independent check must reproduce the answer exactly, or the answer is rejected.

**Goals:** versioned rules; typed dependencies; hard approval gates; ready, blocked, done and unknown classifications; deterministic ranking; evidence-linked reason codes; explicit refusal for cycles and invalid input; an independent validator.

**Non-goals:** executing, approving or scheduling anything (scheduling is BACK-97); confidence, probability or causal claims; inferring a task list or dependencies from text; a rules engine package (GoRules, Semantica); routes or UI (COG-07); learning (COG-05).

**Anti-goals:** a task shown `ready` while any requirement is unverified; an approval gate passed without approval evidence; a hidden item's existence or state leaking through a reason, a ref or a classification.

## 2. Approaches considered

| | Approach | Verdict |
| --- | --- | --- |
| A | **Caller-supplied task specs + versioned native rules, over the COG-02 projection**; evaluator and validator as two independent pure functions (the COG-P0 pattern, generalized to real evidence) | **Chosen.** Explicit, testable, no inference of intent. |
| B | Infer dependencies from COG-03 `mentions` edges | Rejected: a mention is not a dependency ("follows #12" is not "blocked by #12"). Mentions may be **shown** as context later, never used as gates. |
| C | A rules-engine package | Rejected now: BACK-107 requires native rules first and a demonstrated gain before any candidate, plus package approval. |

## 3. The task and rule contract (decisions)

### T1 — Task specs are input, validated, versioned

```ts
interface TaskSpec { id: string; task: ItemIdentity; requirements: RequirementSpec[] }
interface RequirementSpec { id: string; kind: 'dependency' | 'check' | 'approval'; target?: ItemIdentity; expected?: FactValue }
interface ReasoningInput { specVersion: string; tasks: TaskSpec[] }
```

- A **task** is a visible `jira_issue` (the only kind with a lifecycle in the evidence today).
- A **dependency** targets another `jira_issue` (the only kind with a lifecycle) and expects `complete`. A PR's `closed` is not "complete", so PRs are checks, not dependencies.
- A dependency cycle is detected only through task items the reader can see, so a cycle through a hidden item is never revealed by a refusal.
- A **check** targets a GitHub `pull_request` or `issue` and expects one of its state values (`open`, `closed`, `draft`).
- An **approval** has no target. Its only valid expectation is `granted`.
- **Invalid input is refused, never repaired:** unknown kinds, duplicate ids, a task that is not a `jira_issue`, a check on a kind without states, a target on an approval, or a bound exceeded (at most 50 tasks and 20 requirements per task; ids at most 100 characters).

### T2 — Facts from evidence (versioned rule set `reasoning-v1`)

| Item kind | Value from the current revision |
| --- | --- |
| `jira_issue` | `statusCategory`: `done` → `complete`; `new`, `indeterminate` → `pending`; anything else → no value |
| `pull_request` | `state` `closed` → `closed`; `open` with `draft` → `draft`; `open` → `open`. A closed PR is **not** "merged": the evidence has no merge flag, so no rule may claim one. |
| `issue` (GitHub) | `open` / `closed` |
| other kinds | no value |

A fact is `verified` only when the COG-02 item status is `verified` and the rule yields a value. Otherwise the fact carries the item's status (`stale`, `unknown`, `conflict`, `insufficient-history`) or `no-value`, with value `unknown`.

**Hidden or nonexistent targets** give a generic `missing` fact with **no ref, no id and no source** (R2 of the research port: neutral Unknown). A visible task whose dependency is hidden is therefore `unknown`, exactly as if the dependency did not exist. A task spec whose own task is not visible is reported as `missing`, with only the spec id the caller supplied, never the item.

### T3 — Approval gates are hard and cannot pass in v1

Memory excludes HumanDecisions (COG-02 D2), so no approval evidence reaches the reasoner. Every approval requirement resolves to `missing` with reason `approval-evidence-not-wired`. A task with an approval requirement is never `ready` in v1. Wiring approvals to cited HumanDecisions (BACK-45 Decision Studio) is a later slice with its own review. This is deliberate: a gate that cannot be checked is closed.

### T4 — Classification (unchanged from COG-P0)

- `done`: the task's lifecycle fact is verified `complete`.
- `unknown`: the lifecycle fact is not verified, or it is verified `pending` and any requirement fact is not verified.
- `blocked`: the lifecycle is verified `pending`, and at least one requirement is verified with a value other than the expected one.
- `ready`: the lifecycle is verified `pending` and every requirement is verified with the expected value.

Blocked wins over unknown, so a known blocker is never hidden. Each requirement adds a reason `<kind>-satisfied | <kind>-unsatisfied | <kind>-<status>`, with the evidence ids of the visible facts it used.

### T5 — Cycles, ranking and the recommendation

- A **dependency cycle** among the given tasks (through visible task items) makes the whole result `invalid-input`, with no partial answer.
- **Ranking:** tasks are evaluated in spec-id order. The recommendation is the first `ready` task by spec id: a deterministic rule with no hidden scoring. Priority or scheduling is not inferred (BACK-97).
- **Result kind:** `recommended` (a ready task exists), `insufficient-evidence` (none ready, at least one unknown), `no-ready-task`, or `invalid-input`.
- The result carries the memory fingerprint, `policyVersion`, `reasoningPolicyVersion` and `specVersion`. It is **advisory**: it has no execute, approve or apply field.

### T6 — Independent validator

`validateResult(projection, input, candidate)` recomputes the whole expected result with a different algorithm: Kahn ordering for cycles instead of DFS, and its own fact lookup and classification. It does not call the evaluator. It accepts the candidate only if the two are canonically equal, and it rejects malformed, forged, inconsistent or unauthorized candidates (for example a ref to a hidden item, a changed state, or an added field). The validator and evaluator share only the contract: the input types, the input validation (T1) and the value table (T2), all pinned by their own tests. A guard checks that the validator never imports the evaluator.

### T7 — Bounded work and no model

Work is linear in tasks × requirements plus the projection size, under the T1 bounds. No LLM, network, clock or randomness: a guard pins the module as pure, like the COG-02 and COG-03 guards.

## 4. Slices

| Slice | Delivers | Tests first |
| --- | --- | --- |
| **S1 (this branch)** | `server/src/reasoning/`: types, rules, evaluator, validator | Each T1 refusal; each T2 rule (a closed PR is never "merged"); stale, conflict and unknown give `unknown`; a hidden dependency equals a nonexistent one; approval never passes; T4 classification and reasons; cycle refusal; ranking; the validator accepts the evaluator's output and rejects forged variants; permutation determinism; guard. |
| **S2 (this branch)** | PostgreSQL proof over `MemoryRepository.read` (`test/reasoning/reasoning-db.spec.ts`) | Ready with every grant; revoking the dependency's source gives `unknown`, identical to a nonexistent dependency, with no trace; rows added to the hidden source change nothing; another workspace gets no task; the validator accepts every result. |
| S3 (later, gated) | Approval evidence from cited HumanDecisions (BACK-45) | — |

## 5. Acceptance mapping (BACK-107)

| BACK-107 deliverable | Covered by |
| --- | --- |
| Versioned rules, typed dependencies, hard approval gates, ready/blocked/unknown, deterministic ranking, evidence-linked reasons | T1–T5 |
| Explicit refusal for cycles, stale or insufficient inputs; no invented confidence or causal claims | T1, T4, T5 |
| Independent validator rejects forged, inconsistent or unauthorized recommendations; baseline vs oracle; zero gate violations; zero LLM calls | T6, T7; S1 tests |
| Native rules before GoRules/Semantica | §2 C |
| Advisory only; scheduling stays BACK-97; no UI wiring | T5; §4 |

## 6. Reuse before build

ADAPT the COG-01 research reasoner (classification, reason codes) and validator (Kahn ordering, `sameJSON`-style canonical comparison, via `canonicalJson`). REUSE COG-03 documents for identity lookup and COG-02 statuses. Nothing from Retail Tower; no dependency.

## 7. Stop conditions

Return to the owner if a rule needs evidence that does not exist (for example "merged"), a consumer needs approvals to pass (S3 first), a test shows hidden data changing a classification, or the evaluator and validator disagree on any case.

## Revision after the COG-08 independent review (`reasoning-v2`, 2026-11-27)

- **T1:** two specs for the same task item are refused (`invalid-spec`). A second spec could bypass the first one's approval gate, or hide a cycle depending on input order. Requirement-kind tables are looked up by own property only, so a kind such as `constructor` is refused instead of throwing.
- **T2:** a PR is `open` only with an explicit `draft: false`. A missing or non-boolean flag gives `no-value`. The GitHub observer still writes `draft: false` when the provider omits the field; changing that is a BACK-48 connector decision.
- **T6:** the validator compares by walking the expected result, with own keys, exact key sets and array lengths checked first. A huge or hostile candidate costs no more than the answer itself.
- Regression tests: `test/reasoning/reasoning.findings.spec.ts`.

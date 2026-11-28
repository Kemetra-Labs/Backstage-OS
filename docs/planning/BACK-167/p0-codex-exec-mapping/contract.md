# BACK-167 P0: event-mapping contract for `codex exec --json` → Kawalys evidence (draft v0)

**Status:** draft for owner review. Read-only work.
- **Inputs:** BACK-166 decision pack §8 P0, merged in #190. Owner instruction "start P0" in session, 2026-11-28.
- **What this does not authorize:** no live run, provider login, model call, install, schema change, server route, ingest path or UI change. Those stay behind their own gates (BACK-167 P1, schema review, security).

| Item | Value |
|---|---|
| Kawalys baseline | `origin/main` = `3de2d1f052381d134ee16c13350186f98599b493` |
| Schema pin (SOURCE) | `openai/codex` tag `rust-v0.170.0` → commit `29eb79e9866b3262a777fdf8195c1b9e63684c91` (Apache-2.0). Files: `codex-rs/exec/src/exec_events.rs` (types), `event_processor_with_jsonl_output.rs` (what is emitted when; written `P` below), `lib.rs` (interrupt, approvals, exit code). Permalink base: `https://github.com/openai/codex/blob/29eb79e9866b3262a777fdf8195c1b9e63684c91/codex-rs/exec/src/` |
| Installed CLI | `codex-cli 0.170.0`; `codex exec --help` lists `--json` and `-o/--output-last-message` (help text only, no run) |
| Labels | SOURCE = read in the pinned Codex source. INFERENCE = my reasoning. **TESTED: none.** The fixtures are hand-written to the pinned schema; no real capture exists yet. |

## 1. Capture surface (what P1 will observe)

The user runs `codex exec --json -s read-only "<task>" > run.jsonl` in a disposable synthetic repo, from their own terminal. Kawalys never launches the process. A **verifier** (Kawalys-side, not the agent) records a manifest around the run. See `fixtures/manifest.example.json`. The manifest holds:
- capture file hash
- receive time
- CLI version
- repo HEAD before and after, and a clean-status check
- start and end time
- the wrapper-reported exit code

### 1.1 What the stream contains (SOURCE, 0.170.0)

One JSON object per line (`P#L105-L117`). Top-level `type` (`exec_events.rs`, `ThreadEvent`):

| `type` | Fields | Emitted when |
|---|---|---|
| `thread.started` | `thread_id` | Session configured |
| `turn.started` | — | Turn begins (`P#L597-L600`) |
| `item.started` | `item` | Item begins. **Never for `agent_message` or `reasoning`** (`P#L344-L352`). |
| `item.updated` | `item` | Running `todo_list` plan update (`P#L571-L596`). The todo list starts with `item.started` on the first plan update and completes at turn end (`P#L517-L526`). |
| `item.completed` | `item` | Item ends. Also used as `error` items for config warnings, deprecation notices and warnings (`P#L412-L476`), and for **model reroutes**: text `"model rerouted: A -> B (...)"` (`P#L497-L510`). |
| `turn.completed` | `usage` {input, cached_input, cache_write_input, output, reasoning_output tokens} | Turn status Completed (`P#L516-L539`). Before any terminal handling, open items are reconciled into `item.completed` (`P#L371-L386`, `#L527`). |
| `turn.failed` | `error.message` | Turn status Failed (`P#L541-L561`) |
| `error` | `message` | Error notification (`P#L450-L460`); also emitted on JSON serialization failure (`P#L109-L115`). **Not necessarily fatal:** the run status stays Running. |

`item` = `{id, type, ...}`, with details flattened beside `id`. Item `type` (`ThreadItemDetails`):
- `agent_message` {text}
- `reasoning` {text}. Empty summaries are dropped and never emitted.
- `command_execution` {command, aggregated_output, exit_code?, status in_progress/completed/failed/declined}
- `file_change` {changes[{path, kind add/delete/update}], status in_progress/completed/failed}. Declined is folded into failed (`P#L202`).
- `mcp_tool_call` {server, tool, arguments, result?, error?, status}
- `collab_tool_call` {tool spawn_agent/send_input/wait/close_agent, sender_thread_id, receiver_thread_ids, prompt?, agents_states, status}. Some collab tools and interrupted collab calls are dropped (`P#L249-L252`, `#L300`).
- `web_search` {id, query, action, results?}
- `todo_list` {items[{text, completed}]}
- `error` {message}

Other payloads (plan, image and similar) map to nothing and never appear (`P#L324`).

**Item ids** are generated as `item_N` (`P#L101-L103`) and are unique within one capture only. A started item keeps its id until it completes. An `item.completed` with no prior start gets a fresh id (`P#L338-L342`). So completed-without-started is **normal**: always for messages and reasoning, sometimes for other items.

**Usage** in `turn.completed` is the thread's cumulative total (`usage.total`, `P#L119-L131`). It equals per-turn usage only for single-turn runs, which is the only shape P1 uses.

**`-o` last-message file** is written only when the turn status is Completed.

**INFERENCE, to verify in P1:** a `web_search` item carries its own `id` field next to the flattened `ThreadItem.id`, so its JSON may contain two `"id"` keys. Most parsers keep the last one, which would break `item_N` identity. The parser must detect duplicate keys and mark the line `unknown`.

### 1.2 What the stream does NOT contain (SOURCE, decisive for the contract)

| Missing | Evidence | Contract rule |
|---|---|---|
| **Timestamps** of any kind | No time field in any `ThreadEvent` struct | `observed_at` = verifier receive time of the capture. Source time stays **unknown** and is never synthesized. Order = line number (stored as `payload.line`). |
| Sequence numbers / event ids | None | Line number plus `item_N` identify a row |
| **Interrupt event** | `TurnStatus::Interrupted` emits nothing after reconciling open items (`P#L562-L566`). Ctrl-C triggers `turn/interrupt` (`lib.rs#L1262-L1271`, `#L1392-L1400`). | No terminal event = `interrupted_or_unknown`, **never completed**. A normal interrupt shows reconciled `item.completed` rows, possibly still `in_progress`. A hard kill shows open `item.started` rows. |
| **Retry information** | `error` events don't say whether Codex will retry. The exit code is set only for non-retried errors (`lib.rs#L1418-L1427`). | An `error` event never decides run state. It is a flag. |
| **Approval requests** | Exec rejects command, file-change and permission approval requests ("not supported in exec mode", `lib.rs#L2252-L2362`). Headless default is `AskForApproval::Never` (`lib.rs#L632`). | Flight Deck shows "approvals: not observable in exec mode", never "no approvals". A refused action surfaces as `command_execution` `failed` (sandbox denial, non-zero exit) or `declined`. |
| Usage when no count arrived | `turn.completed` uses `Usage::default()`, all zeros, when no token update was seen (`P#L119-L131`) | **All-zero usage = unknown**, not zero. Failed or interrupted runs have no usage, so usage is unknown. |
| Model, cwd, repo, CLI version | Not in events (only `thread_id`). A reroute appears only as an `error` item. | Taken from the verifier manifest, labelled wrapper-reported. A reroute item overrides the manifest model and raises a flag. |
| Process exit code | Not in stream. The process exits 1 on a failed or interrupted turn, a non-retried error, or a rejected server request, including auth token refresh (`lib.rs#L1418-L1440`, `#L1484-L1486`, `#L2300`, `#L2365`). | Manifest only. Expected: completed → 0, failed/interrupted → 1. **A mismatch is a flag, not an anomaly**, because retried and non-retried errors are indistinguishable in the stream. |
| Verified outcome | Agent message and `file_change` paths are self-report | Outcome is always `not_verified` from the stream. The verifier's own git diff and oracle decide (P1). |

## 2. Mapping to Kawalys evidence (`server/migrations/0003_evidence.sql`)

**Batch import after the capture ends.** Evidence is append-only (triggers in 0003), so a summary cannot be updated in place. Live or partial runs are not modelled in P0 or P1 (INFERENCE: avoids partial-truth rows).

Each capture produces:
- **one run-summary Observation**;
- **one Observation per completed item and per terminal or error event**.

`started` and `updated` events only feed the summary.

| Evidence column | Value |
|---|---|
| `type` | `Observation` |
| `source_id` | A source row for the local Codex capture. **Gap G1:** `sources.provider` allows only `github/jira/confluence` (0003, 0005). A source also needs a lower-case `external_ref` of at most 300 characters, a `classification`, a `project_id`, and an active `source_grants` row. |
| `project_id` | The project owning the disposable synthetic repo, in the owner's workspace. RLS `current_workspace_id()` applies to every insert. |
| `source_ref` | `codex-exec:<capture-sha256>:<thread_id>` (summary) or `...#L<line>` (row), at most 500 characters. There is **no uniqueness on `source_ref`**, so idempotency is a gap (**G9**). |
| `observed_at` | Verifier receive time (manifest `capture.receivedAt`), the same for every row. **Order by `payload.line`, never by `observed_at`.** `received_at` is set by the server and is not the manifest time. |
| `state` | Row: `ok` (well-formed and recognized); `unknown` (unrecognized type, duplicate keys, reordered, after terminal); `error` (malformed). Exact duplicates are not stored (§3 rule 3). Summary: §3 rule 2. |
| `payload` (≤ 64 KB, object) | §2.1 |

### 2.1 Payload policy (redaction first, size-bounded)

Default payload keeps **structure, not content**:
- `line`, event type, item type, `item_N`, status
- `exit_code`
- `file_change` kinds and paths
- `usage` and `usageState`
- the SHA-256 and byte length of each text field

Text fields are **not stored** by default: `command`, `aggregated_output`, `agent_message.text`, `reasoning.text`, MCP arguments/results, web search queries and results, and collab prompts. Commands and outputs can contain secrets, and BACK-166 19205 says no raw transcripts, secrets or command args.

- **File changes:** at most 200 paths are kept, plus the total count and a hash of the full list. If more paths exist, `truncated: true` is set and the row state becomes `unknown` (**G10**).
- **Final answer:** the verifier reads it from the local capture or the `-o` file for the P1 oracle. Only the oracle verdict becomes evidence.
- **Raw capture file:** stays on the owner's machine under an approved retention rule (**G6**).

## 3. Derivation rules (oracle in `fixtures/expected.json`; anomalies degrade, flags inform)

1. **Run state:**
   - `turn.completed` → `completed_self_reported`.
   - `turn.failed` → `failed`.
   - No terminal event by end of file → `interrupted_or_unknown`.
   - The first terminal event wins.
   - `error` events never decide run state.
2. **Summary evidence state:**
   - `error` if any line is malformed.
   - Otherwise `unknown` if there is any **anomaly** (missing terminal, unfinished item, reorder, event after terminal, unknown type, duplicate keys, truncation, schema version mismatch).
   - Otherwise `ok`.
   - A well-observed `failed` run is `ok` evidence of a failure. The UI shows the run as failed, never as healthy.
3. **Exact duplicates:** a line byte-identical to an earlier `item.completed` for the same id gets line state `duplicate`. It is not stored again, is counted as `exact_duplicate_line`, and does not degrade the summary. Repeated `item.updated` lines are expected.
4. **Reorder:** an `item.started` that appears after an `item.completed` with the **same id** gives `completed_before_started`, and both lines are `unknown`. This cannot happen legitimately, because a started item keeps its id until it completes. Completed-without-started is normal (§1.1).
5. **After terminal:** any event after the first terminal event is `event_after_terminal` and `unknown`. It is preserved, not dropped.
6. **Unknown types:** an unrecognized top-level `type` or item `type` is preserved as `unknown`. It is never dropped and never mapped to a known type.
7. **Usage:** reported only from `turn.completed` with at least one non-zero counter. Otherwise `unknown`.
8. **Unfinished items** (`unfinished_item`) are either:
   - an `item.completed` whose status is still `in_progress` (reconciled at interrupt), or
   - an `item.started` with no `item.completed` for that id anywhere in the capture (hard kill or crash).
9. **Flags (do not degrade):**
   - `error_event_seen`
   - `command_declined`
   - `command_failed`
   - `file_change_failed`
   - `model_rerouted`
   - `exit_code_mismatch`
10. **Outcome:** always `not_verified` from the stream.
11. **Version gate:** the manifest `cliVersion` must match the schema pin (`0.170.x`). Otherwise the capture is not parsed, the summary is `unknown` with `schema_version_mismatch`, and P1 stops.
12. **Expected exit code:** `null` means it cannot be predicted (malformed capture or hard kill). No mismatch flag is raised then.

## 4. Fit with existing Flight Deck and Replay contracts (`app/src/contract/world.ts`)

| Contract | Today | Gap |
|---|---|---|
| `AgentCapability.status` | `'simulated' \| 'not_available'` | **G2:** no `'observed'` state for a real read-only observation |
| `Mission.status: AgentStatus` | `observing/analyzing/drafting/waiting_review/idle` | **G3:** no run lifecycle (`completed_self_reported/failed/interrupted_or_unknown`) and no `outcome` verified/not split. Mapping onto `AgentStatus` would mislabel runs, so this needs a new run type. |
| `ActivityEvent` | `minutesAgo`, `actor`, `truth`, optional `evidenceId` | Usable for item rows (`actor:'agent'`, truth from row state). `minutesAgo` comes from receive time, not source time; the UI must say so. |
| `ReplayEvent.clock` | Synthetic "HH:MM on 2026-11-16 (UTC)" | **G4:** a real capture has no per-event time. Replay steps by line order (already evenly spaced in `replay.ts`). The clock must read "not reported by source". |
| Approvals panel | — | **G5:** "not observable in exec mode" state |
| Evidence ingest | `evidence.ingest` is held by no role (`server/src/auth/capabilities.ts`); no route accepts a capture | **G7:** ingest path, authority, workspace binding and audit |

## 5. Gap list (each needs its own gate; none is done here)

| # | Gap | Owner gate |
|---|---|---|
| G1 | Local Codex capture source: provider value, `external_ref`, classification, grant | Schema review (migration) |
| G2 | `AgentCapability.status` `observed` | App contract change |
| G3 | Run type (lifecycle plus outcome verified/not), separate from `AgentStatus` | App contract change |
| G4 | Replay clock for sources without timestamps | App contract change |
| G5 | Approvals "not observable" display state | App UI |
| G6 | Raw capture retention and redaction rule | Owner / security |
| G7 | Ingest path for verifier-submitted captures (capability, route, workspace, audit) | Security review (BACK-127 family) |
| G8 | Verifier: manifest writer, git before/after, oracle runner | P1 build, after approval |
| G9 | Idempotent re-import: key on capture SHA-256 (no uniqueness on `source_ref` today) | Schema review |
| G10 | Payload truncation for oversized `file_change` lists or other items against the 64 KB check | Contract plus implementation |
| G11 | Parser that detects duplicate JSON keys (`web_search` id) | Implementation, confirmed by P1 capture |

## 6. Fixtures

`fixtures/` contains eight synthetic captures with no real data, hand-written to the 0.170.0 schema. It also holds:
- `expected.json`: per-line and per-run oracle, plus manifest-level cases for the version gate and exit-code mismatch;
- `manifest.example.json`;
- `SHA256SUMS`: verify with `sha256sum -c SHA256SUMS` **from inside `fixtures/`**;
- `.gitattributes`: forces LF so the hashes stay stable on Windows.

| File | Covers |
|---|---|
| `01-completed.jsonl` | Normal read-only run, usage reported |
| `02-interrupted.jsonl` | Hard kill or crash: open `item.started`, no terminal |
| `03-failed.jsonl` | `error` (flag) then `turn.failed`; usage unknown |
| `04-declined-and-zero-usage.jsonl` | Declined command, sandbox-denied command (`failed`, exit 1), failed file change, all-zero usage → unknown |
| `05-truncated.jsonl` | Malformed last line, no terminal |
| `06-duplicate-and-reordered.jsonl` | Same-id reorder, exact duplicate, event after terminal |
| `07-unknown-types.jsonl` | Unknown event and item types preserved as unknown |
| `08-interrupted-reconciled.jsonl` | Normal Ctrl-C: item reconciled to `item.completed` still `in_progress`, no terminal. The reconciled status is INFERENCE. |

The fixtures are the acceptance oracle for a future parser test. No parser is written in P0. During drafting, a throwaway script (not committed) applied §3's rules to the fixtures and reproduced `expected.json` for all eight cases.

## 7. Independent review (fresh subagent, read-only, against the pinned Codex source and Kawalys files)

No critical findings. Most source claims verified; the fixtures match the serde shapes and SHA256SUMS verifies. All findings below were accepted and are resolved in this version.

| Finding | Resolution |
|---|---|
| `error` events are not necessarily fatal (`will_retry` is not in the stream) | §1.2 retry row; rule 1; `error_event_seen` flag; exit-code mismatch is now a flag |
| A normal interrupt reconciles open items into `item.completed` before ending, with no terminal event | Fixture 08; rule 8 covers `in_progress` completions; fixture 02 relabelled as hard kill |
| Missing emission cases | §1.1 now covers model reroute, empty reasoning dropped, unmapped payloads, dropped collab tools, `todo_list` lifecycle, completed-without-started being normal, and item field shapes |
| `web_search` duplicate `id` key (inference) | §1.1 note, G11 |
| Fixture 04 realism (sandbox denial is usually `failed`) | Fixture 04 adds a failed command with exit 1 |
| `duplicate` line state undeclared; fixture 06 line 4; no version-gate case; `null` exit code undefined | Vocabulary and §2 updated; rules 4, 8, 11, 12; manifest cases added |
| Cumulative usage; `-o` written only on Completed; auth refresh and reject failures → exit 1 | §1.1 and §1.2 |
| Append-only, idempotency, source row requirements, 64 KB, ordering, `received_at`, RLS | §2 and §2.1; G1, G7, G9, G10 |
| Cited line ranges a few lines off | Corrected against the pinned source |

## 8. Exit criteria for P0, and next decision

P0 is complete when the owner reviews this contract and the gap list. **Next decision (owner):**
- whether to approve P1, under BACK-167, with its stop conditions from the BACK-166 pack §8;
- which of G1–G11 to open first. G6 and G7 are prerequisites for storing anything.

The Claude Code (stream-json) mapping follows only after the Codex path passes P1.

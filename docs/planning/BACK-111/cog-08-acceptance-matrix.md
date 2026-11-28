# BACK-111 (COG-08) continuous acceptance matrix — interim, 2026-11-27

Status: **interim matrix, written by the implementing session, updated after the first independent review (section 5).** It is **not** the independent review BACK-111 requires: the author built COG-03 and COG-04. Its purpose is to make that review fast and exact. The pre-COG-07 gate stays **NO-GO** until an independent reviewer fills in the last column.

## 1. Slice evidence

| Slice | Contract | Oracle | Command | Result | Commit / PR |
| --- | --- | --- | --- | --- | --- |
| COG-01 research port | COG-P0 | Independent oracle JSON | `npm test -- test/research` (in `server/`) | 46/46 + oracle green | #116 |
| COG-02 memory | [cog-02-design.md](../BACK-105/cog-02-design.md) | S1 projector = S2 SQL (differential) | `npm test -- test/memory` (Docker) | green in CI | #118, #120, #123–#128 |
| COG-03 retrieval | [cog-03-design.md](../BACK-106/cog-03-design.md) | Frozen hand-labelled corpus `cog03-corpus-v1` | `npm test -- test/retrieval` (Docker) | 100% corpus; PostgreSQL proof green | #129 (ffe5dc5) |
| COG-04 reasoning | [cog-04-design.md](../BACK-107/cog-04-design.md) | Independent validator (Kahn, no evaluator import) | `npm test -- test/reasoning` (Docker) | 48 + 4 green; CI green | #130 (e466102) |
| COG-05 learning | [cog-05-design.md](../BACK-108/cog-05-design.md) (draft) | — | — | not built: owner decisions pending | — |
| COG-06 uncertainty | [cog-06-verdict.md](../BACK-109/cog-06-verdict.md) | — | — | verdict: defer | — |
| COG-07 shadow UI | — | — | — | not started: needs this gate and UI scope approval | — |

## 2. Hard gates (BACK-111), as tested so far

| Gate | Evidence | Independent check |
| --- | --- | --- |
| Zero unauthorized disclosure | Hidden equals nonexistent, byte for byte: COG-03 S1/S2/S3, COG-04 S1/S2. Hidden rows change no output and no fingerprint (COG-02 S2, COG-03 S2, COG-04 S2). Other workspaces see nothing. | open |
| Zero approval or dependency violations | Approval gates cannot pass in v1 (COG-04 T3, mutation-tested). A blocker beats an unknown. Cycles are refused through visible tasks only. | open |
| No unsupported fact promotion | Status passes through unchanged (COG-03 R5). A closed PR is never "merged" (COG-04 T2). The validator rejects forged results. | open |
| No unmarked stale or unknown output | Stale, conflict and unknown are carried on every hit and fact. Unknown is never ready. | open |
| Zero LLM calls in the deterministic baseline | Purity guards on `src/memory`, `src/retrieval` and `src/reasoning`: no network, clock, randomness or model client. | open |
| Bounded computation | Query, limit, depth, node, task and requirement bounds, each with a refusal test. | open |
| Malicious imported text | `test/retrieval/retrieval.adversarial.spec.ts`: markup returned as stored; prototype-like words neither throw nor pollute; mention spam deduplicated and bounded; pathological titles (20k hashes, key-like runs, Arabic diacritic runs) in linear time. **Finding fixed:** invisible format characters (`BACK\u200B-8`) let a key-shaped query escape the never-fuzzy rule; normalization now strips Unicode `Cf` (`retrieval-v2`). | open |
| Replay and revocation | COG-02 `validateAtRead`; best-effort replay is stated, not hidden. Revocation is tested in PostgreSQL for COG-02, COG-03 and COG-04. | open |

## 3. Known limitations (for the reviewer)

- The COG-03 corpus labels and the COG-04 tests were written by the implementing session.
- The memory read costs 37 to 42 s at 180 days (COG-02 S3), so every consumer stays background-only (DEC-5).
- Replay is best-effort until the commit-ordered sequence column exists (COG-02 D3, D6).
- Approval wiring (COG-04 S3, BACK-45) and the purge mechanism (DEC-4) are open.
- `test/ops/local-credentials.spec.ts` fails on Windows only (file mode); CI on Linux is the reference.

## 4. Pre-COG-07 decision

**NO-GO** until an independent reviewer:
1. checks the permission boundaries of COG-02, COG-03 and COG-04 in the real code;
2. relabels the COG-03 corpus without seeing its labels;
3. reviews the adversarial imported-text tests and adds any case they miss;
4. records GO or NO-GO here with exact commits.

Owner approval is still required for any merge, deployment or release.

## 5. First independent review: Codex, commit 96878ac (2026-11-27)

**Verdict: NO-GO**, with two High findings. All findings below are fixed on the branch that adds this section, each with a regression test that failed on 96878ac.

| Severity | Finding | Fix |
| --- | --- | --- |
| High | Two specs for one task item bypass its approval gate, or hide a cycle depending on order | Duplicate task identities refused (`reasoning-v2`) |
| High | A PR with no `draft` field verified `open` | `open` needs explicit `draft: false`; otherwise `no-value` |
| Medium | Identifier-shaped spoofs (combining marks, Unicode dashes, Cyrillic lookalikes, numbers over 9 digits) reached fuzzy tiers | `Mn` removed, `Pd` folded, any-script and 18-digit shapes (`retrieval-v3`) |
| Medium | A late commit changed the cited first evidence id without changing the fingerprint | The fingerprint covers every cited field of the current run (`memory-v2`) |
| Medium | A spec kind such as `constructor` threw | Own-property lookups |
| Medium | Unbounded unresolved output, quadratic `#n` linking, and validator work proportional to the candidate | 50-mention cap with `truncated`; indexed links; bounded structural comparison |
| Low | The 32-token bound counted distinct terms | Every token occurrence counts |
| Low | Identifier-tier ranking disagreed with R4 (the one blind-relabel disagreement, 20 of 21 agreed) | R4 applied to every tier; corpus `cog03-corpus-v2` |

**Not fixed, recorded for decision:**
- the S2 memory read has no work budget independent of the history cap (performance, DEC-1);
- there is no DB case with a second project on which the reader also has a grant;
- the GitHub observer still writes `draft: false` for a missing field (BACK-48);
- SQL timing noninterference is unverified.

**Next:** a second independent review of the fixed commit decides GO or NO-GO for the pre-COG-07 gate.

## 6. Second independent review: Codex, commit b980034 (2026-11-27)

**Verdict: NO-GO.** It confirmed as fixed:
- duplicate task identities;
- the fingerprint's cited fields;
- inherited property names;
- the token count;
- the identifier-tier ranking.

All findings below are fixed on the branch that adds this section, each with a regression test that failed on b980034.

| Severity | Finding | Fix |
| --- | --- | --- |
| High (was known-open) | The observer stored a missing or malformed `draft` as `false`; reproduced end to end as a wrong recommendation | Observer stores only a provider boolean, else `null`; end-to-end test |
| Medium | Spoofs still reached lexical tiers (underscore keys, U+2212, overlong numbers, non-ASCII digits, the combining dot from lowercasing U+0130) | `shapeFold` for the shape test; digit and dash folding; wider shapes (`retrieval-v4`) |
| Medium | Relationship caps applied after construction; fan-out and containment scans | Budgets applied during construction on both entry points, with `truncated`; indexed containment |
| Medium | Mention parsing dropped long and underscore references, and matched keys glued inside words | Provider grammars with Unicode word boundaries |
| Medium | Links from conflicting or stale titles carried no status | `basis` on every mention; no links without an established revision |
| Medium | The validator accepted arrays with extra properties or `toJSON`, and accessors | Plain-data comparison (own data properties, dense arrays, exact keys) |
| Low | Global mark stripping merged different words; `CJK-2` abstained | Marks kept in ordinary words; key shapes limited to Latin, Greek and Cyrillic |
| Low | A sparse requirements array threw | Sparse arrays refused (`reasoning-v3`) |

**Still known-open:**
- a work budget for the memory read;
- a second-project DB case;
- SQL timing noninterference;
- the validator's object-key enumeration is proportional to the candidate's own top-level keys (an in-process cost; any future HTTP boundary must bound request size).

**Next:** a third independent review of the fixed commit.

## 7. Third independent review: Codex, commit 000f603 (2026-11-27)

**Incomplete:** the provider's content filter stopped the run after its probes, so it returned no verdict table and no GO or NO-GO. Before it stopped, it reported:
- typecheck passing;
- 383 tests passing across 17 non-PostgreSQL suites;
- two remaining gaps, both fixed on the branch that adds this section (`retrieval-v5`), each with a regression test that failed on 000f603:

| Severity (ours) | Finding | Fix |
| --- | --- | --- |
| Medium | A 65-digit identifier-shaped query reached the title tier (shapes capped digits at 64) | No digit-count ceiling; the 500-character query bound bounds the work |
| Low | A key next to a combining mark was parsed as a mention | Marks count as word characters at mention boundaries |

**Next:** rerun the third review on the fixed commit, worded so the content filter does not stop it. Until a complete review returns GO, the pre-COG-07 decision stays **NO-GO**.

## 8. Third independent review, complete rerun: Codex, commit 5375068 (2026-11-27)

**Verdict: NO-GO.**
- **Confirmed fixed:** the observer draft flag end to end; mention `basis` and conflict suppression; marks in ordinary words and CJK text; sparse arrays; decimal-digit folding (all 770 Nd digits in Node's Unicode tables).
- **Access scoping:** no defect found. Absent and hidden sources gave byte-identical search, counts, ranking, relationships, traversal, reasoning reasons and fingerprints.
- **Fixes:** all findings below are fixed on the branch that adds this section, each with a regression test that failed on 5375068.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium | A mark beside whitespace (`PR <mark> 99`) hid an identifier shape | Whitespace collapses after the shape fold removes marks (`retrieval-v6`) |
| Medium | Misses from unrelated titles used up a traversal's unresolved allowance | Allowance per title; traversal counts only visited titles; edge and unresolved truncation tracked separately |
| Medium | An inherited array `toJSON` passed the validator | Standard array prototype required |
| Low | `#n` parsing stopped at 15 digits; `#0` became an unresolved mention | The observer's positive safe-integer range |
| Low | A zero-width joiner acted as a word boundary | Boundaries look through format characters |

**Next:** a fourth review of the fixed commit. The pre-COG-07 decision stays **NO-GO** until a complete review returns GO.

## 9. Fourth independent review: Codex, commit 827a210 (2026-11-27)

**Verdict: NO-GO.**
- **Confirmed fixed:** the shape fold's whitespace; the standard array prototype; `#n` as positive safe integers; boundaries computed in code (probed with astral characters, marks, format characters and string edges).
- **Access scoping:** no defect found. Out-of-scope items and markers left the projection, fingerprint, search, counts, ranking, relationships, traversal and reasoning reasons byte-identical.
- **Fixes:** all findings below are fixed on the branch that adds this section, each with a regression test that failed on 827a210.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium | A full edge budget stopped unresolved collection and flagged unrelated traversals | Scan continues; omitted-edge endpoints recorded; traversal flagged only when a cut edge touches it |
| Medium | A title clipped mid-number linked the wrong PR | Observers flag clipped text; mentions touching the cut are skipped |
| Medium | A historical repository read inside a run reported a later observation as `verified` | The run as known by E: first observation, worst state seen |
| Low | The per-title cap kept the first 50 by position, not canonical order | Canonical first 50 per title |
| Low | Validator lookups scanned the projection each time | One index per validation |

**Next:** a fifth review of the fixed commit. The pre-COG-07 decision stays **NO-GO** until a complete review returns GO.

## 10. Fifth independent review: Codex, commit 43ab9f0 (2026-11-27)

The first attempt was stopped by the provider's content filter. A narrower rerun (correctness of the round-four changes only) returned **NO-GO**.
- **Fixed:** the validator index.
- **Partially fixed:** the edge-budget, clip and as-of changes.
- **Blockers named:** the false-relationship cases and the misleading historical `verified`. Everything below is fixed on the branch that adds this section, each with a regression test that failed on 43ab9f0.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | A format character before the clip cut hid the cut | A clipped mention needs a visible character after it |
| Medium (blocker) | Legacy rows without `textClipped` still linked across the cut | Explicit `textClipped` on every new row; flag-less titles at the limit count as possibly clipped |
| Medium (blocker) | A historical repository read ignored a failed read before E | Markers compared with the as-of observation |
| Medium | Candidate pairs still visited after the edge budget filled | Targets recorded once per bucket |
| Low | NUL removal made the clip flag disagree with the stored text | Flag and text from the same sanitized code points |
| Low | Exact-first reads reported the run-wide earliest receipt | The first row's receipt |
| Low | Worst-state precedence differed from `worstState` | `worstState` reused |
| Low | Duplicate identities in a hand-built projection | Contract stated: the last one wins, on both evaluator and validator |

**Known limit added:** a read exactly at a run's first observation reports the run's worst state (conservative), until the run record keeps the first row's state, which would be an S2 SQL change.

**Next:** a sixth review of the fixed commit.

## 11. Sixth independent review: Codex, commit f005f59 (2026-11-27)

**Verdict: NO-GO**, with two named blockers.
- **Fixed:** the observers' clip flag, and the validator index and duplicate contract.
- **Partially fixed:** retrieval and memory.
- **Fixes:** all findings below are fixed on the branch that adds this section. Each has a regression test that failed on f005f59; for the fan-out test, failure on the old code was confirmed by running it against that code.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | A repository read between runs compared markers with a later run, so a failure before E read as verified | Markers compared with the selected run's observation |
| Medium (blocker) | Past the edge budget, each mention still scanned its target bucket | Constant-time self check; a bucket is walked once; O(1) per later mention |
| Medium | A partly cut bucket flagged walks that reach no cut edge | Only the cut suffix is recorded |
| Low | A control character at a clip cut counted as a separator | Non-whitespace control characters are invisible at boundaries |
| Low | The as-of view kept a run-wide `firstKnownAt` | Both known times from the first row |

**Next:** a seventh review of the fixed commit.

## 12. Seventh independent review: Codex, commit 6feac1b (2026-11-27)

**Verdict: NO-GO, with one blocker.**
- **Confirmed fixed:** both round-six blockers (between-run markers; per-mention bucket scans).
- **Reasoning:** an approval-gated task stays `unknown`, and the validator rejects a result that selects it.
- **Fixes:** all findings below are fixed on the branch that adds this section, each with a regression test that failed on 6feac1b, except the marker-clock item, which is recorded as a design decision.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | A default-ignorable code point outside Cf (U+2065) hid a clip cut, so a clipped `#1234` linked PR 123 | `DI` is invisible at boundaries and in normalization (`retrieval-v9`) |
| Medium (track) | A failure after E but before evaluation time makes a historical repository read `unknown` | Recorded as conservative; bounding markers by E is an owner decision (S2 change) |
| Low | The as-of view's known times were not in the fingerprint | Fingerprint covers them (`memory-v3`) |
| Low | U+0085 NEXT LINE stopped separating | It separates |
| Low | Duplicate identities in a hand-built projection reported a false cut | Documents deduplicated to the last item |

**Next:** an eighth review of the fixed commit.

## 13. Eighth independent review: Codex, commit d8f8a02 (2026-11-27)

**Verdict: NO-GO, with two blockers.**
- **Confirmed fixed:** the clip-cut blocker (U+2065 and astral variation selectors); `docsOf` deduplication; current-run known times and `memory-v3`.
- **Reasoning:** an approval-gated task stays `unknown`, and a result selecting it is rejected.
- **Fixes:** all findings below are fixed on the branch that adds this section, each with a regression test that failed on d8f8a02, except the U+034F composition case, which is recorded.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | Controls in a query (U+0001 in a key, U+0085 between words) reached the title tier | Queries share the boundary classification (`retrieval-v10`) |
| Medium (blocker) | Stripping all default-ignorables merged titles differing by a variation selector | Only non-mark default-ignorables are stripped |
| Low | `cafe<U+034F><U+0301>` misses the precomposed form | Recorded: U+034F is kept meaningful |
| Low | History known times were not in the fingerprint | Covered (`memory-v4`) |

**Next:** a ninth review of the fixed commit.

## 14. Ninth independent review: Codex, commit 896dc43 (2026-11-27)

**Verdict: NO-GO, with two blockers.**
- **Confirmed fixed:** `memory-v4` (history receipt times).
- **Partially fixed:** the round-eight control and variation-selector changes, because of the step order below.
- **Reasoning:** no blocker; an approval-gated task stays `unknown`, and a forged recommendation is rejected.
- **Fixes:** all findings below are fixed on the branch that adds this section, each with a regression test that failed on 896dc43.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | Invisible characters were removed after lowercasing and composition (a control made a Greek final sigma; blocked an accent's composition) | Removed before NFKC and lowercasing (`retrieval-v11`) |
| Medium (blocker) | NFKC composed `P` + acute into one letter before the shape fold removed marks | The shape fold decomposes first |
| Low | Retrieval's fallback text used a different history order from memory's cap | The newest returned run in memory's order |
| Low | History observation times were not in the fingerprint | Covered (`memory-v5`) |

**Next:** a tenth review of the fixed commit.

## 15. Tenth independent review: Codex, commit fecc299 (2026-11-27)

**Verdict: NO-GO, with one blocker.**
- **Confirmed fixed:** the Greek and accent order cases; decomposed and precomposed `PR 99`; the history fallback across caps; the observation-time fingerprint.
- **Reasoning:** an approval-gated task stays `unknown`, and a forged recommendation is rejected.
- **Fixes:** the findings below are fixed or decided on the branch that adds this section.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium (blocker) | NFD lengthened Hangul past the source-ref shape's 400-unit cap, so the query reached title matching | Recompose after removing marks; no separate cap (`retrieval-v12`) |
| Low | `résumé/guide` became identifier-shaped and exact-only | Decided: R4 reserves every identifier shape; pinned by a test |
| Low | `textClipped` on the current run was outside the fingerprint | The current run's whole payload is covered (`memory-v6`) |

**Next:** an eleventh review of the fixed commit.

## 16. Status after the tenth-review fixes (commit 2d588cb, 2026-11-27)

- **Merged:** every finding from reviews one to ten is fixed or decided, with regression tests (last: #147, `2d588cb`; CI and SonarCloud green, 0 open Sonar issues).
- **Permission scoping:** no review found a defect in it.
- **Eleventh review:** Codex is no longer used for this gate. An independent Claude review of `2d588cb` was started and then stopped before it reported, so there is no verdict on this commit.
- **Gate:** the pre-COG-07 gate stays **open** until an independent review of the current commit returns GO.
- **Known-open, tracked (not blockers so far):** memory read work budget; a second-project DB test; SQL timing; validator top-level key enumeration.
- **Owner decisions still needed:** COG-05 schema and review authority; COG-07 UI scope. COG-06 is deferred.

## 17. Eleventh independent review: Claude code-reviewer, commit 2c93de4 (2026-11-27)

**Verdict: GO for the pre-COG-07 gate, conditional on finding 1 (fixed on the branch that adds this section).** Gates 1, 2, 5 and 6 were attacked and no violation was confirmed; the SQL specs were read, not run, by the reviewer.

| Severity | Finding | Fix |
| --- | --- | --- |
| Medium | A Proxy candidate passed the validator, then could read as another result | Proxies are refused at every level |
| Medium | `#12.`, `PR#12`, `PR: 12`, `issue#4` and a key with U+2043 reached fuzzy tiers | Number references with separators or punctuation are identifier-shaped; U+2043 folds to a hyphen (`retrieval-v13`) |
| Low | A cross-realm correct result is refused | Documented: candidates must be same-realm plain data |
| Low | `related(p, null)` and `search(p, 'x', null)` threw | Both refuse with `invalid-request` / `invalid-query` |

Independence note: this reviewer was a Claude agent without the author's conclusions, not an external model. The owner delegated the decisions on 2026-11-27 and the previous ten rounds used Codex.

## 18. Pre-COG-07 decision: GO at commit 3c675da (2026-11-27)

- The eleventh independent review (section 17) returned **GO conditional on finding 1**. Finding 1 and every other finding of that review are fixed in #150, merged as `3c675da`, with CI and SonarCloud green.
- **Decision: GO for the pre-COG-07 gate at `3c675da`.** COG-07 may start within the scope in [cog-07-scope-decision.md](cog-07-scope-decision.md): read-only, fixtures by default, shadow-labelled, no actions.
- **Still tracked, not blockers:** memory read work budget; a second-project DB test; SQL timing; validator top-level key enumeration.
- **COG-05:** decisions recorded ([cog-05-decisions.md](../BACK-108/cog-05-decisions.md)); activation stays blocked until BACK-45 approval evidence and real outcomes exist. **COG-06:** deferred.

## 19. COG-05 and COG-07 delivered within their decided scope (2026-11-27)

- **COG-05:** the pure machinery (#152) and the storage tables (#153, independent database review GO) are merged. Activation stays blocked until BACK-45 approval evidence and real outcomes exist (D6).
- **COG-07:** the read-only shadow view `#/shadow` is on the branch that adds this section ([cog-07-scope-decision.md](cog-07-scope-decision.md)). Its data is committed engine output that a server test keeps equal to the real output; it makes no request and has no controls.
- **COG-06:** deferred (BACK-109 verdict).

## 20. Owner sign-off (2026-11-27, main 2e3273c)

**The owner signed off the delivered scope of the cognitive core (BACK-103) and the delegated COG-05 and COG-07 decisions.**

| Item | State at sign-off |
| --- | --- |
| COG-02 memory, COG-03 retrieval, COG-04 reasoning | Delivered. Eleven independent reviews; pre-COG-07 gate GO at `3c675da` (sections 17 and 18). |
| COG-05 learning | Delivered as decided: pure machinery (#152) and tables (#153, independent database review GO). **Activation stays blocked** until BACK-45 approval evidence and real outcomes exist (D6). |
| COG-06 research | Deferred (BACK-109 verdict). |
| COG-07 shadow view | Delivered: fixture view (#155) and, by the owner's choice, a live search read (#158, security review GO; #159). Live reasoning waits for a real task-plan source. |
| COG-08 acceptance | This matrix; closed by this sign-off. |

**Still tracked:** SQL timing, validator top-level key enumeration, and, for activation only, the COG-05 write path itself (owner read from the workspace row, lesson citation rows); the other COG-05 read/write-path requirements are enforced in the pure core since 2026-11-28 (`cog-05-decisions.md`).

## 21. Tracked items closed: memory read work budget and second-project case (2026-11-28)

- **Work budget:** the live search's memory read now has a work budget. `MemoryRepository` takes `budgetMs`, which sets `statement_timeout` for the read's own transaction only. Past the budget, the read is cancelled and rolled back, and it raises `MemoryReadBudgetExceeded`, never a partial projection. The live route answers with the generic error body, the same for a visible and a hidden project. The budget is `COGNITION_READ_BUDGET_MS` = 2 s, a conservative and reversible default; DEC-1's 500 ms interactive bar still needs DEC-2 option A. Background reads keep no budget. The S2 SQL is unchanged.
- **Second project:** a DB case now holds the reader fixed, adds evidence to a second project the reader can also read, and shows this project's items and fingerprint unchanged. A control read shows the new evidence landed in the other project.
- Tests: `test/memory/memory-db.spec.ts` (`work budget`, `a second project the reader also sees`) and `test/cognition/cognition-db.spec.ts` (`work budget`). Both use a table lock, so the over-budget case is deterministic.

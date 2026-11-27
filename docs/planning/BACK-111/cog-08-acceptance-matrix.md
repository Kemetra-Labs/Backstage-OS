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

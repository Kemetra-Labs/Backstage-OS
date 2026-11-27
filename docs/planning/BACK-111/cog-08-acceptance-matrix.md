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


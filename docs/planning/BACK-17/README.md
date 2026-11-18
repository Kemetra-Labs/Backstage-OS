# BACK-17 — Kawalys surface concepts: Trust Observatory, Mission Replay and Agent Flight Deck (design only)

Jira: [BACK-17](https://rahmaqanater.atlassian.net/browse/BACK-17) (parent BACK-1). Written 2026-11-18 on branch
`claude/back-17-surface-concepts-bf6044` from `main` at `96c2d7e`.
Master proposal: [Experience Atlas & Integration Journey v0](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/80052229)
(Confluence, PROPOSED). Design reference: BACK-5 Blueprint v4, C2 Hybrid Operations, dark-first (accepted 2026-11-16).
Direction: [BACK-15 experience atlas](../BACK-15/README.md) (merged in PR #13; its D-15.x items are still owner
PROPOSALS).

**This is a design document, not an implementation.** It changes no source, style, test, fixture, dependency or CI file
and moves no Jira status. It does not add any of the three surfaces to the four-screen v1 scope. Every concept is a
**PROPOSAL** until the owner ranks it (section 11). Only after that ranking can an implementation slice be opened.

How to read the labels in this document (same as BACK-15):

| Label | Meaning |
| --- | --- |
| **FACT** | Read from the repo at `96c2d7e` or from Jira/Confluence on 2026-11-18, with the file, line or ticket named |
| **PROPOSAL** | My recommendation. Nothing is decided until the owner says so |
| **NOT VERIFIED** | A claim no one has checked. It is listed so it is not mistaken for a result |

## Contents

| § | Section | BACK-17 item it answers |
| --- | --- | --- |
| 1 | [Starting point: what is already built](#1-starting-point-what-is-already-built) | Deliverable 4 (reuse/overlap), acceptance 1 |
| 2 | [Rules shared by all three concepts](#2-rules-shared-by-all-three-concepts) | Deliverable 3 (personas, RTL, mobile, keyboard, reduced motion, evidence semantics, table fallbacks), acceptance 1–2 |
| 3 | [Concept A: Trust Observatory](#3-concept-a-trust-observatory-p1) | Deliverable 1 (brief A), deliverable 2, deliverable 3 |
| 4 | [Concept B: Mission Replay](#4-concept-b-mission-replay-p1) | Deliverable 1 (brief B), deliverable 2, deliverable 3 |
| 5 | [Concept C: Agent Flight Deck](#5-concept-c-agent-flight-deck-p2) | Deliverable 1 (brief C), deliverable 2, deliverable 3 |
| 6 | [Optional: Command Home](#6-optional-command-home--daily-mission-briefing) | Candidate concepts, optional item |
| 7 | [Reuse and overlap with BACK-10 to BACK-13; route or panel](#7-reuse-and-overlap-with-back-10-to-back-13-route-or-panel) | Deliverable 4 |
| 8 | [Demo fixture requirements](#8-demo-fixture-requirements) | Acceptance 3 (fixture requirements) |
| 9 | [Visual quality criteria](#9-visual-quality-criteria) | Acceptance 3 (visual quality criteria) |
| 10 | [Dependencies](#10-dependencies) | Acceptance 3 (dependencies) |
| 11 | [Owner ranking and decision pack](#11-owner-ranking-and-decision-pack) | Deliverable 5, acceptance 4 |
| 12 | [Hard-rule and process check](#12-hard-rule-and-process-check) | Exclusions, `CLAUDE.md` hard rules |
| 13 | [Sources read and what was not checked](#13-sources-read-and-what-was-not-checked) | — |

---

## 1. Starting point: what is already built

FACT (BACK-15 §1.2, confirmed by reading the files at `96c2d7e`): each of the three concepts is **already built
twice**, and neither build is an owner acceptance of the concept.

| Concept | V1 app (`app/src`, PR #7) | V2 visual lab (`app/src/design-lab/v2`, PR #8) |
| --- | --- | --- |
| Trust Observatory | `#/sources`, `screens/Sources.tsx`: per-product connectivity and freshness tables, a "never OK" state panel (`sources/StatePanel.tsx`), integrations list. Header comment: "Target health lives on the product pages" | `screens/SourceObservatory.tsx`: three "pins" (connectivity, freshness, health), six source cards with an age-vs-target ring, a cards/table switch, an inspector (details, evidence, provenance) and a source event timeline |
| Mission Replay | No route. `screens/investigation/TimelinePanel.tsx` lists INV-DEMO-7 evidence by observation time, with unread and restricted items listed apart "instead of being given a made-up age" | `screens/MissionReplay.tsx`: five stages (observed, ingested, correlated, hypothesis, proposed), an evidence-gap marker, a scrubber with deterministic play, driven by a separate `REPLAY` script (`fixtures/world.ts` lines 104–112) |
| Agent Flight Deck | `#/agents`, `screens/Agents.tsx`: an oversight panel first, then a roster and history. Header comment: "No control starts, stops, pauses or configures anything" | `screens/AgentFlightDeck.tsx`: fleet orbit, mission table, queues, capabilities, oversight and audit, over five simulated agents and five `MSN-DEMO-*` missions (`world.ts` lines 114–128) |

So these briefs do not start blank. Each one says what to **keep**, what to **change** and what to **drop** from both
builds. The changes are design changes for a later slice. This PR touches none of the screens.

### 1.1 Findings in the existing builds that the concepts must fix

These findings come from reading the code. They are not regressions in shipped behaviour: both builds are demo screens.
They are the gaps between those builds and BACK-17's acceptance list.

| # | Finding | Evidence (FACT) | Which concept fixes it |
| --- | --- | --- | --- |
| F-1 | **Replay mixes its time axes and shows cause after effect.** The replay clock puts "PR merged" at 14:03, one minute *after* the check failed at 14:02. The evidence says the PR merged at 13:27 and the check failed at 14:02 (the copy itself says "35 min before the failure"). The clock is the order Kawalys handled the events, but the strip does not say so | `world.ts` lines 105–106 (R-1 `14:02`, R-2 `14:03`); `fixture/inv-demo-7.ts` lines 38 and 42 (E-1 `14:02`, E-2 `13:27`); `i18n/replay.ts` line 111 | B (§4.4) |
| F-2 | **Replay times with no source.** R-3 (ingested), R-6 (hypothesis) and R-7 (proposed) have `evidence: null` and a made-up clock value, so three marks on the strip have no provenance and no "demo time" mark | `world.ts` lines 107, 110, 111 | B (§4.4) |
| F-3 | **Replay keeps a second copy of the investigation.** `REPLAY` is its own event script, so the replay and the Investigation Room can drift apart. BACK-17 forbids "duplicating their underlying entity models" | `world.ts` lines 104–112 vs `fixture/inv-demo-7.ts` | B (§4.6) |
| F-4 | **The contract has two time fields, and BACK-17 asks for four.** `Observation` has `observedAt` and `ingestedAt` only. BACK-7 defines `observedAt` as the source's own event time (GitHub `completed_at`) and `ingestedAt` as the BFF read time. Every fixture `ingestedAt` is the same value (`14:03`), so no ingestion lag can be shown. There is no correlation time | `contract/types.ts` lines 31–36; `docs/planning/BACK-7/03-api-evidence-contracts.md` lines 29 and 83; `inv-demo-7.ts` line 32 | B (§4.4), §8 |
| F-5 | **"Health" on the Observatory means the provider, not the target.** V2's health reading is the provider's own health (GitHub reads Healthy because of probe E-8). V1 deliberately left target health to the product pages. BACK-17 asks that "a connector outage must never paint its target system Healthy", which needs both readings, labelled apart | `world.ts` lines 18–22, 39–60; `screens/Sources.tsx` line 13 | A (§3.4) |
| F-6 | **The freshness ring measures age against a placeholder.** The ring's target ("30 min or less") is a synthetic TTL. BACK-5 D-4 says real TTLs are set only at the read-only integration gate, but the ring does not say it is a placeholder | `SourceObservatory.tsx` lines 23–40, 291; `i18n/observatory.ts` line 56 | A (§3.4) |
| F-7 | **Flight Deck counts and statuses read as live.** "Active missions", "Observing", "Analyzing" and "Need review" are present-tense. `startedMinutesAgo` and `events` are invented numbers with no evidence or demo mark. "Need review" can read as a pending approval, which BACK-17 forbids ("no fake active approvals") | `i18n/deck.ts` lines 12–13, 27–31, 54–56; `world.ts` lines 123–127 | C (§5.4) |

---

## 2. Rules shared by all three concepts

These rules are the existing contract (FACT) plus BACK-15's direction (PROPOSAL there, followed here). Each brief below
only adds what is specific to it.

### 2.1 Truth and source semantics (FACT: `src/contract/rules.ts`, BACK-5 Blueprint v4)

- **Truth labels:** Observed, Correlated, Hypothesis, Proposed, and Approved (historical only). Unknown is a display
  label, not a truth claim. Each label has a word and a shape or icon, never colour alone.
- **Three source axes, never merged:** connectivity (reachable, unavailable, not configured), freshness (current,
  stale, unknown) and health (healthy, degraded, down, unknown). There is no composite score, trust figure or
  percentage. The V2 suite asserts "no `%` on any screen".
- **Unknown is never Healthy:** `resolveHealth` returns unknown for a health claim with no basis, or with a stale or
  unread basis.
- **Not read is not zero:** an unread or restricted record has no age and no value. It is listed as "not read" with
  its reason (`notReadReason`: unavailable, not configured, restricted).
- **Counts come with their base:** "3 of 6", via `countDisplay`. A count is never shown without what it counts.

### 2.2 Display only (FACT: `isForbiddenControlLabel`, V2 `PRODUCT.md`)

- No approve, reject, defer, go, release, retry, run, start, stop, pause, connect, reconnect, sync or configure
  control, in EN or AR, on any of the three surfaces.
- Allowed controls: select, filter, sort, switch view (scene or table), open evidence, copy text, play or step a
  replay (view state only), and links to other Kawalys screens.
- A "next human step" is a sentence that names where a person acts (for example "in `RT-DEMO-112`"). It is never a
  button. Links into source systems point at `example.invalid` and are inert.

### 2.3 Demo is never live (FACT for today, PROPOSAL for the additions)

- Today every V1 route has a "Demo data" marker (`e2e/flow.spec.ts`) and V2 has `.kv2-demo`.
- PROPOSAL (from BACK-15 §5): the marker also sits **in the scene header** of each concept, so a cropped screenshot of
  the signature object still says "Demo".
- PROPOSAL: anything that moves or counts must say it is synthetic. A played replay says "Replaying demo events". An
  agent status says "in the demo script", never "now". A time with no source says "demo time".
- No pulse, blink or idle animation that could read as a live feed (BACK-15 §4.6).

### 2.4 Personas (FACT: V2 `comparison.md` A2 and BACK-5 D-5/D-6; PROPOSAL for the per-concept tables)

- Personas change **detail and wording, never facts or truth labels**. The switch is labelled "Preview as …" and
  grants no access. Real redaction is server-side (ADR-03, BACK-7 §5).
- Owner: no run or PR ids, words-only confidence (D-6).
- Technical: all ids, raw times, evidence ids, rule text.
- Nontechnical: no run, PR, work-item or mission ids. Plain language. A summarized, read-only view (D-5).
- Restricted evidence (E-5, `visibility: 'technical'`) reads "restricted" for Owner and Nontechnical, and never shows
  its content or its age.

### 2.5 EN/AR and RTL (FACT for the existing rule, PROPOSAL for its application)

- `dir="rtl"`, Latin digits 0–9 everywhere (D-3), and ids, versions and times inside `<bdi dir="ltr">`. Both test
  suites check "no Latin run outside an isolate".
- **Geometry that is data keeps left-to-right in Arabic:** time axes (Replay) and topology (maps). Panels, ledgers,
  tables, option columns and tab order mirror. Text inside nodes follows the language (BACK-15 §4.7).
- Arrow keys on a non-mirrored axis move by screen direction in both languages. Arrow keys on mirrored tab strips swap
  in Arabic, as V2 tabs already do.
- Arabic strings quoted in this document come from the existing fixture and i18n files. Any new Arabic copy needed by
  a later slice is **NOT VERIFIED** until a native speaker reviews it (V2 `comparison.md` A3 records the same gap).

### 2.6 Mobile, keyboard, reduced motion and the table twin (PROPOSAL; targets from BACK-15 §6)

- Widths 320, 375, 768, 1024 and 1440 px with no horizontal page overflow. A scene may scroll inside its own panel.
- **Every scene has a non-graphic twin** that holds the same facts: a table or ordered list. Under 640 px the twin is
  the default view and the scene is one tap away.
- Skip link first. Every control is reachable by Tab. Arrow keys move inside a scene (pins, lanes, fleet). Visible
  focus ring. Drawer focus is trapped and returned.
- 44 × 44 px minimum touch targets.
- `prefers-reduced-motion: reduce`: every transition is instant, nothing animates on its own, and replay playback
  becomes one event per key press.
- One `h1` per screen and no skipped heading levels (BACK-5 P5). Each scene is a labelled region whose accessible
  name points at its twin ("Source coverage, also shown as a table below").

### 2.7 Scene and ledger (PROPOSAL, from BACK-15 §4.4)

Each concept has **one scene** (the signature object) and **one ledger** (ruled rows of labelled statements with
source, time and evidence id). A mark may appear in the scene only if it is also a ledger row. The scene never holds a
fact of its own.

---

## 3. Concept A: Trust Observatory (P1)

### 3.1 User job and decision value

- **User job:** "Before I trust anything on the other screens, which of our sources can we read right now, how old is
  what we have, and which targets have no evidence at all?"
- **Decision value:** it tells a person whether a quiet screen is quiet because things are fine, or because Kawalys
  cannot see. It is the only place that answers "where are we blind?" (BACK-15 §2.2 puts it in the EXPLORE lens for
  this reason). Decisions it supports, all taken outside Kawalys: whether a finding can be relied on, whether to ask
  someone to fix a connector, and which instrumentation is missing.
- **Not its job:** fixing anything. There is no "reconnect", "test connection" or "configure" control.

### 3.2 Inputs and source authority

| Input | Authority | Today (FACT) |
| --- | --- | --- |
| Per-provider connectivity, last successful read, TTL | `SourceAuthority` per provider in scope (`contract/types.ts` line 13); BACK-7 §4 also gives an unavailable reason code (credential refused, rate limited, timeout) | V1 and V2 fixtures. The reason code exists in the BACK-7 plan only |
| Provider health | An Observed probe of the provider (E-8 for GitHub) | V2 only |
| Target health (product or component) | `DisplayState.basis` evidence on the target, through `resolveHealth` | V1 product pages; V2 map nodes |
| Coverage (which source is expected to report on which target) | No authoritative source. Port would be the catalogue, and Port is unavailable in the demo | Implied by evidence links only |
| Restricted evidence | `visibility`, `notReadReason: 'restricted'` | E-5 |

PROPOSAL: until a catalogue is readable, coverage rows say "expected source: from the demo fixture" rather than imply
an authored catalogue.

### 3.3 Composition (PROPOSAL)

Scene: the three V2 pins stay (they are the strongest existing object and already refuse a composite). Ledger: a
**coverage matrix** of targets × sources replaces the six equal cards as the primary record.

```
┌ Trust Observatory · scope: Retail Tower OS ────────────────────── [Demo data] ┐
│ Scene (dark): three pins on the horizon, never combined                      │
│   ┃ Connectivity          ┃ Freshness              ┃ Health (provider)       │
│   ┃ 3 of 6 reachable      ┃ 2 of 6 within demo TTL ┃ 1 of 6 confirmed        │
│   ┃ 1 unavailable,        ┃ 2 stale, 2 never read  ┃ 5 unknown               │
│   ┃ 2 not set up          ┃ (Sentry, Port)         ┃                         │
├ Connectors (ledger) ─────────────────────────────────────────────────────────┤
│ GitHub   reachable · read 6 min ago · provider healthy (E-8, observed)       │
│ Jira     reachable · read 12 min ago · provider health unknown (no probe)    │
│ Sentry   reachable · stale, read 9 h ago · provider health unknown           │
│ Port     unavailable · reason: demo "connector refused" · last good read     │
│          25 h ago (E-9), stale · targets that rely on Port: catalogue, owners│
│ Datadog  not set up        Confluence  not set up                            │
├ Coverage (ledger): targets × sources ────────────────────────────────────────┤
│                  GitHub     Jira       Sentry      Datadog     Port          │
│ stock-sync       read       read       —           not set up  unavailable   │
│ inventory        —          —          stale (E-5, restricted for Owner)     │
│ runtime impact   —          —          stale       not set up  —             │
│   → Target health: unknown. Blind spot: runtime (no current source)          │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Two health readings, two words (fixes F-5):** "Provider health" (is the connector's system up, by probe) and
  "Target health" (is the product or component healthy, by evidence about it). They never share a column. A provider
  being healthy says nothing about a target, and a provider being down makes every target that relies only on it read
  "unknown, source unavailable", never Healthy.
- **Blind spots** are first-class rows: a target with no current source for an aspect (for example `stock-sync`
  runtime: Sentry stale, Datadog not set up, E-6 not read) reads "Blind spot" with the reasons listed.
- **Freshness ring (fixes F-6):** keep it as a measurement of age, and label its target "demo TTL (placeholder,
  BACK-5 D-4)". An unread source shows "no read", not an empty or full ring.
- **Unavailable reasons:** show the BACK-7 reason code in words ("connector credential refused", "rate limited",
  "timed out"). In the demo the reason is marked as demo text.
- **Scope and permission failures:** BACK-17 lists them. BACK-7 §4 defines two different cases, and the Observatory
  shows only one of them:
  - the **connector's** credential is refused by the provider: connectivity unavailable, with its reason. Shown here.
  - the **viewer** lacks scope: the BFF returns 403 and no data. This is not an evidence state. The Observatory then
    shows nothing for that scope and says "You can't see this scope", never "no sources".
- **Instrumentation gaps:** a target aspect that no configured source covers reads "not instrumented in the demo
  world". It is not a failure of any connector.

### 3.4 States

| State | What the screen shows | Never shows |
| --- | --- | --- |
| Current (reachable, fresh) | Read time and age; provider health only if probed | "Healthy" for a target because its source is up |
| Stale | "Stale, read 9 h ago", amber word; dependent target health "unknown, stale basis" | The stale value as if current |
| Unavailable | Red word, reason, last good read as stale evidence (E-9) with its age | A target as Healthy because its last read was healthy |
| Not set up (`not_configured`) | Grey "Not set up", which targets lose coverage | An empty row with no explanation; "0 errors" |
| Restricted (E-5 for Owner/Nontechnical) | "Restricted", no age, no content | The record's value or a hint of it |
| Viewer lacks scope (403) | "You can't see this scope" | "No sources", which would read as a fact |
| Loading | Skeleton rows with "Reading demo fixture" | Any reading before it is known |
| Empty (no sources in scope) | "No sources are set up for this scope" plus what that means: every target is unknown | A calm, empty page |
| Error (fixture failed to load) | "Could not load source states" and nothing else | Cached readings without their age |

### 3.5 Core interactions

- Select a connector or a target: the inspector shows details, evidence and provenance (the V2 tab set, kept).
- Filter by axis (connectivity, freshness, health) and by state, with counts on each filter (V2 already does this).
- Switch scene/table, both directions. Under 640 px the coverage matrix becomes a list grouped by target.
- From any source mark elsewhere in Kawalys, open the Observatory focused on that source. It returns to where it was
  opened (BACK-15 §2.5).
- Source event history (V2 timeline) stays as a collapsible section. Its entries are source-state changes only.

### 3.6 Personas

| Element | Owner | Technical | Nontechnical |
| --- | --- | --- | --- |
| Pins | Same counts, words | Same counts, words | Same counts, plainer wording ("we can read 3 of 6 sources") |
| Connector ledger | Name, state, age | Plus reason codes, target URL (inert), probe evidence id | Name and state in words only |
| Coverage matrix | Targets × sources, restricted cells say "restricted" | All cells, E-5 shown and marked stale | Collapsed to "What we can't see" list |
| Blind spots | Shown first | Shown with evidence ids | Shown first, plain language |

### 3.7 EN/AR, mobile, keyboard, motion

- Arabic: the ledger and matrix mirror (sources run right to left); provider names and ids isolated. Existing copy:
  "ادعاء الصحة دون دليل مرصود حديث يُقرأ على أنه غير معروف." (`i18n/observatory.ts` line 51) stays the rule text.
- Mobile: pins stack as three rows; the matrix is a per-target list; the inspector opens as a drawer.
- Keyboard: arrow keys move between pins and between matrix cells (row and column); Enter opens the inspector.
- Motion: none on load. The ring does not animate its fill.

### 3.8 How it keeps the three rules

- **Unknown ≠ Healthy:** two separate health readings; a target's health uses only evidence about that target.
- **Display only:** no connector control of any kind; "next step" text names the owner of the connector.
- **Demo ≠ live:** marker in the scene header; TTL labelled as placeholder; reasons marked as demo text.

### 3.9 Limitations and non-goals

- Not a connector admin console, not a setup wizard, not an uptime monitor of providers.
- No scores, trends or SLA figures (no baseline data exists).
- Coverage is only as good as the fixture until a catalogue is readable. The screen says so.

### 3.10 Reuse and overlap

Keep V2's pins, inspector tabs, cards/table switch and event timeline. Keep V1's "never OK" state panel wording and
its per-product grouping (it becomes the coverage matrix). Drop the six equal cards as the primary view (they become
the connector ledger). Overlaps: Portfolio shows per-product source marks (BACK-11) and links here instead of
repeating the detail (BACK-15 §2.3).

**Route or panel:** **route** (PROPOSAL, matches BACK-15 D-15.4). It answers a question no approved screen answers,
and it is opened from many places.

---

## 4. Concept B: Mission Replay (P1)

### 4.1 User job and decision value

- **User job:** "In what order did things actually happen, when did we learn each one, and when did we connect
  them?"
- **Decision value:** it separates "the PR merged 35 minutes before the failure" (an event order) from "we linked the
  ticket after the failure" (a reasoning order). That difference is what makes a hypothesis plausible or not. It also
  shows how long Kawalys was blind (ingestion lag, unread sources), which matters before anyone acts on the proposal.
- **Not its job:** proving a cause, or playing a story that ends in certainty.

### 4.2 Inputs and source authority

| Time | Meaning (PROPOSAL, aligned with BACK-7) | Contract today (FACT) |
| --- | --- | --- |
| **Occurred** | When the event happened, as the source states it (PR merged, check completed) | `Observation.observedAt`. BACK-7 §3 maps it to GitHub `completed_at` |
| **Observed by source** | When the source recorded it, when that differs from when it happened (for example an error received later than it occurred) | Not in the contract. Optional new field, PROPOSAL only |
| **Ingested** | When Kawalys read it (BFF read time) | `Observation.ingestedAt` |
| **Correlated** | When a rule linked two records, with the rule | Not in the contract. `EvidenceReference.rule` exists, its time does not |
| Hypothesis, proposal moments | When an analysis or a proposal was written | Not in the contract. Today only in V2's `REPLAY` script, with no source (F-2) |

PROPOSAL for the later slice (not done here): add optional `occurredAt` (only where a source gives an event time
distinct from its record time), a `correlatedAt` on correlated evidence, and an authored time on hypotheses and
proposals. Each time carries its source. Any time with no source renders as "demo time" with a hollow tick. Naming
these fields is an owner decision (D-17.5) because it touches the BACK-7 contract.

### 4.3 Composition (PROPOSAL)

Scene: **time lanes** on one left-to-right axis. Ledger: the Investigation Room's ledger, ordered by the selected lane.

```
┌ Replay · INV-DEMO-7 (inside the Investigation Room) ─────────── [Demo data] ┐
│ Axis (UTC)   13:20        13:40        14:00     14:05      14:10           │
│ Happened     ● PR #DEMO-88 merged (E-2)    ● check failed (E-1)            │
│              13:27                         14:02                            │
│ Read by      ............................  ○ 14:03 (E-1, E-2 read together) │
│ Kawalys      ░░ blind: Sentry stale since 05:24 · Datadog not set up ░░░░   │
│ Linked       ◆ RT-DEMO-112 linked by rule "Jira key in commit" (E-3)        │
│              time: demo time (no source)                                    │
│ Reasoning    ◇ hypothesis written · ◇ proposal DEC-DEMO-3 drafted           │
│              demo time · demo time                                          │
│ [◀ step] [▶ play demo] [step ▶]    cursor: E-1 · "Replaying demo events"    │
├ Ledger (ordered by "Happened") ─────────────────────────────────────────────┤
│ 13:27  OBSERVED    PR #DEMO-88 merged (fixture timezone)  GitHub · E-2      │
│ 14:02  OBSERVED    #DEMO-4471 failed on main              GitHub · E-1      │
│ —      CORRELATED  RT-DEMO-112 linked via commit key      rule · E-3        │
│ —      HYPOTHESIS  Timezone change caused the failure. Not confirmed.       │
│ —      UNKNOWN     Runtime impact: not read (E-6, Datadog not set up)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Fixes F-1:** "Happened" and "Read by Kawalys" are separate lanes, so the PR sits before the failure and the read
  sits after both. Switching the ledger order between lanes makes the two orders explicit.
- **Fixes F-2:** every mark carries its source. A mark with no source time is hollow and says "demo time". The
  reasoning lane shows order, not invented clock values, until the contract carries real times.
- **Gaps** are hatched spans with a reason ("Sentry stale since 05:24", "Datadog not set up"). They are never animated
  closed, and playback never "resolves" them.
- **Hypothesis** marks are hollow diamonds with the word "Not confirmed". A hypothesis never turns into an observed
  mark during playback.
- Playback only moves a cursor over fixed events (the V2 rule, kept). It starts only when pressed.

### 4.4 States

| State | What the replay shows |
| --- | --- |
| All sources current | Lanes with marks; no gap spans |
| Stale source | A hatched span on the "Read by Kawalys" lane from the last good read, with the source name |
| Unavailable source | A hatched span plus "last good read 1 day ago (E-9)"; events from it after that point are absent and the span says so |
| Not set up | A labelled gap for the aspect it would cover ("runtime: not set up") on the whole axis |
| Restricted (E-5 for Owner/Nontechnical) | A "restricted" mark with no time and no content, listed apart (the V1 `TimelinePanel` rule) |
| Untimed evidence | Listed apart under the axis, "no time recorded", never placed on the axis |
| Conflicting times (two sources disagree) | Both marks, joined by a dashed bracket, labelled "times disagree"; no average |
| Loading / error | "Loading demo events" / "Could not load the events of this case"; no partial axis |
| Empty (case with one event) | One mark, and "Nothing else recorded for this case" |

### 4.5 Core interactions

- Step back or forward by event (arrow keys on the axis, or the step buttons); play/pause the demo replay.
- Choose the ledger order: Happened, Read, Linked.
- Select a mark: it highlights its ledger row and opens the evidence drawer. `?evt=E-1` keeps the position, and the
  same id means the same event in the Investigation Room (BACK-15 §2.4).
- Toggle lanes on or off (Technical default: all; Owner default: Happened + gaps; Nontechnical: narrative list).

### 4.6 Reuse and route or panel (fixes F-3)

- **Panel, not route** (PROPOSAL, matches BACK-15 3.B and D-15.4). Replay becomes the stage strip of the
  Investigation Room, expandable in place, and it **reads the investigation's own evidence**. V2's separate `REPLAY`
  script is retired in that slice, so there is one entity model.
- Keep from V2: stage icons, gap marker, scrubber, deterministic play, `evt` in the URL, the "Display only" proposal
  note. Keep from V1: unread and restricted items listed apart rather than given a made-up age. Drop: the five
  "orbit" stages as the main scene (stages become the reasoning lane).
- Overlap with BACK-6/BACK-8: the strip replaces the separate timeline panel in the room, which also shortens the
  3700 px page (BACK-15 §3.B). Overlap with BACK-13: the decision's "Rests on" ids open the same marks.

### 4.7 Personas

| Element | Owner | Technical | Nontechnical |
| --- | --- | --- | --- |
| Lanes | Happened + gaps, relative times ("35 min before") | All lanes, absolute UTC, evidence ids, rule text | No axis by default: a three-part list "What happened / What we know / What we can't see" |
| Ids | Check and ticket names in words, no run or PR ids | All | None |
| Hypothesis | "A likely explanation, not confirmed" | Full statement with basis | "One possible reason, still being checked" |

Existing copy that already follows this split (FACT, `i18n/replay.ts` lines 105–114):

| Persona | EN | AR |
| --- | --- | --- |
| Owner | A test data change was merged 35 min before the failure | دُمج تغيير في بيانات الاختبار قبل الفشل بـ 35 دقيقة |
| Technical | {PR #DEMO-88} merged: fixture timezone update | دُمج {PR #DEMO-88}: تحديث المنطقة الزمنية للبيانات |
| Nontechnical | A change to test data was added shortly before | أُضيف تغيير على بيانات الاختبار قبل ذلك بقليل |

### 4.8 EN/AR, mobile, keyboard, motion

- Arabic: the time axis stays left to right (time is data); lane labels and the ledger mirror; times isolated. Left
  and Right arrows move by screen direction in both languages.
- Mobile: the axis scrolls inside its panel (V2 already does this); the ledger is the default view under 640 px.
- Reduced motion: no playback animation; play becomes "next event" per press.

### 4.9 How it keeps the three rules

- **Unknown ≠ Healthy:** gaps are drawn as gaps; a span with no reads is never green or empty-looking.
- **Display only:** play, pause and step move a cursor only; the proposal stays text with "Display only. Nothing is
  decided or started here." (`rp.prop.note`, existing EN/AR).
- **Demo ≠ live:** "Replaying demo events" while playing; "demo time" on any unsourced time; no real-time clock.

### 4.10 Limitations and non-goals

- No causal claim, no "root cause found" state, no automatic ordering into a story.
- No cross-case replay and no live tail.
- Until the contract has the new time fields, the "Linked" and "Reasoning" lanes show order only.

---

## 5. Concept C: Agent Flight Deck (P2)

### 5.1 User job and decision value

- **User job (G3 and later):** "What did the agents collect, what did they infer, what did they propose, and what is
  waiting for a person?" **Before G3:** "What would agent oversight look like, and where are its boundaries?"
- **Decision value:** oversight and provenance. A person can see which output is evidence (collected from a source)
  and which is the agent's own inference, and that nothing was done on anyone's behalf.
- **Not its job:** running, pausing, approving or configuring agents. Real agent runtime belongs to separately
  approved G3/G4 architecture (master proposal; ADR-06, ADR-07).

### 5.2 Inputs and source authority

| Input | Authority | Today (FACT) |
| --- | --- | --- |
| Agent roster and capabilities | None yet (G3). Demo fixture only | V1 roster; V2 `AGENTS` |
| Agent runs ("missions") | None yet. Future `AgentRun` entity (master proposal, shared data) | V2 `MISSIONS`, five `MSN-DEMO-*` |
| What an agent collected | The evidence records it cites (E-ids), whose authority is the source | V2 missions cite E-ids |
| What an agent inferred or drafted | The agent itself. Always Hypothesis or Proposed, never Observed | V2 labels them so |
| Human review state | The source system (Jira `RT-DEMO-112`), not Kawalys | V2 `human` field, held in Kawalys (F-7) |

### 5.3 Composition (PROPOSAL)

Scene: the V2 fleet ring, reduced to **four fixed output categories** (collected, linked, inferred, drafted), not
agent avatars. Ledger: one row per agent output, labelled by what kind of claim it is.

```
┌ Agent oversight · simulated, nothing runs ────────────────────── [Demo data] ┐
│ Scene: outputs by kind (demo script)                                         │
│   Collected 2  ─  Linked 1  ─  Inferred 1  ─  Drafted 1                      │
│   (cites E-1, E-2, E-5, E-9) (E-3)   (no evidence of its own) (DEC-DEMO-3)   │
├ Output ledger ───────────────────────────────────────────────────────────────┤
│ COLLECTED   CI collector read #DEMO-4471, PR #DEMO-88    GitHub · E-1, E-2   │
│ COLLECTED   Freshness watcher noted Sentry stale         Sentry · E-5, E-9   │
│ CORRELATED  Correlator linked RT-DEMO-112 by commit key  rule · E-3          │
│ HYPOTHESIS  Analyst: timezone change may explain failure. Not confirmed.     │
│ PROPOSED    Drafter wrote DEC-DEMO-3. A person decides in RT-DEMO-112.       │
├ Boundaries ──────────────────────────────────────────────────────────────────┤
│ Can (in the demo): read the synthetic fixture.                               │
│ Cannot: write to any source, run, deploy, approve, message anyone.           │
│ Real agents: not built. Needs G3 (ADR-06) and G4 (ADR-07) approval.          │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **What the AI observed, inferred and proposed (BACK-17):** agents never "observe" in the truth-label sense. A source
  observes; an agent **collects** that observation and cites it. Inferences are always Hypothesis, drafts always
  Proposed. The ledger uses exactly the existing truth labels, so the deck adds no new truth vocabulary.
- **Fixes F-7:** statuses become past tense or script-relative: "Ran in the demo script", "Output: hypothesis". "Active
  missions" becomes "Simulated runs". "Need review" becomes "For a person to read in `RT-DEMO-112`", a sentence, never a
  queue with a count that looks like pending approvals. `startedMinutesAgo` and `events` counts are dropped or carry
  "demo value".
- **Audit:** which agent produced which ledger row, and which evidence it cited. This is the part the Investigation
  Room can reuse as text ("collected by CI collector, simulated").

### 5.4 States

| State | What the deck shows |
| --- | --- |
| No agent runtime (always, before G3) | Banner: "Agents are simulated. Nothing runs." The whole deck is in this state |
| An agent's source is stale or unavailable | Its output row says "based on a stale / unavailable source" and links to the Observatory |
| An agent cites restricted evidence | The citation reads "restricted" for Owner/Nontechnical; the output is not hidden |
| Output with no evidence | Shown as Hypothesis or Proposed with "no evidence of its own" |
| Empty (no runs in the script) | "No simulated runs for this case" |
| Loading / error | "Loading demo agent outputs" / "Could not load the demo agent outputs" |

### 5.5 Core interactions

Filter by output kind and by agent; select a row to open the cited evidence; jump to the case or decision it belongs
to. No other control.

### 5.6 Personas

| Element | Owner | Technical | Nontechnical |
| --- | --- | --- | --- |
| Output ledger | Kind and plain sentence; no run, PR or mission ids | All ids, agent ids, cited E-ids | Kind and plain sentence, no ids |
| Boundaries | Shown first | Shown with ADR references | Shown first, plain |
| Agent names | Role names ("CI collector") | Role + `AG-*` id | Role names only |

### 5.7 EN/AR, mobile, keyboard, motion

- Arabic: the ledger mirrors; agent and evidence ids isolated. Existing status words (`i18n/deck.ts`) such as
  "يرصد" (observing) and "بانتظار المراجعة" (waiting for review) are the ones F-7 asks to replace; the replacement
  Arabic is **NOT VERIFIED** until a native speaker reviews it.
- Mobile: the scene collapses to four counts in a row; the ledger is the main view.
- Motion: no orbit rotation, no "thinking" animation, no typing effect.

### 5.8 How it keeps the three rules

- **Unknown ≠ Healthy:** the deck shows no health. It links to the Observatory for source state.
- **Display only:** no run, pause, retry, approve or configure control; "Cannot" list is visible on the page.
- **Demo ≠ live:** "simulated" in the title, past-tense statuses, no live-looking counters.

### 5.9 Limitations and non-goals

No agent execution, model calls, prompts, chat, autonomy settings, queues, approvals or schedules. No avatars or bot
personalities. Agents add no facts of their own before G3 (BACK-15 §2.2), so the deck mostly re-presents the
investigation's ledger by author.

### 5.10 Reuse and route or panel

Keep V1's oversight-first order and its "no control starts, stops, pauses or configures anything" rule. Keep V2's
capabilities and audit sections. Drop V2's mission queue and present-tense KPIs.

**Route or panel:** **keep for later** (PROPOSAL, matches BACK-15 D-15.4). If anything is built before G3, build only
the audit text inside the Investigation Room ("collected by …, simulated"), not a standalone deck.

---

## 6. Optional: Command Home / Daily Mission Briefing

BACK-17 lists it as optional, "provided it is not a second Portfolio with copied cards". FACT: it already exists as
the V1 landing route `#/` (BACK-15 §1.1), and the QA report found Portfolio repeating its attention list.

PROPOSAL: **no new brief here.** BACK-15 D-15.4 and D-15.5 already cover it: keep Home as the COMMAND landing scene
and make Portfolio link to Home's attention list instead of repeating it. Its one link to these concepts is a single
line per concept, for example "Blind spots: runtime for Retail Tower → Observatory". If the owner wants a full briefing
concept, it becomes its own design item after D-15.5 is ruled.

---

## 7. Reuse and overlap with BACK-10 to BACK-13; route or panel

| Concept | Overlaps with | Reuse | Route or panel (PROPOSAL) | Why (user value, not looks) |
| --- | --- | --- | --- | --- |
| Trust Observatory | BACK-11 Portfolio (per-product source marks), BACK-10 shell (source marks everywhere) | V1 Sources tables and state panel; V2 pins, inspector, timeline; `resolveHealth`, `countDisplay` | **Route** (`#/sources`, existing) | Answers "where are we blind?", which no approved screen answers; opened from many places |
| Mission Replay | BACK-6/BACK-8 Investigation Room (timeline panel, evidence list), BACK-13 Decision "rests on" | V1 `TimelinePanel` untimed rule; V2 scrubber, gap marker, `evt`; the investigation's own evidence | **Panel** inside the Investigation Room | It is one investigation seen in time. A separate route duplicates the case and its entity model |
| Agent Flight Deck | Investigation Room (who collected which evidence), BACK-10 shell (nav item) | V1 oversight panel; V2 capabilities and audit | **Keep for later**; meanwhile audit text in the room | No facts of its own before G3 |
| Command Home | BACK-11 Portfolio | Existing `#/` | Existing route | Covered by BACK-15 D-15.4/D-15.5 |

None of these adds a step to the core flow (Portfolio → Project → Investigation → Evidence → Decision). They are side
doors that return to where they were opened (BACK-15 §2.5).

---

## 8. Demo fixture requirements

PROPOSAL for the first approved slice. Nothing here is built. All values stay synthetic, keys `RT-DEMO-*`, links
`example.invalid`.

1. **One world.** V2's separate `REPLAY` and `MISSIONS` scripts are derived from the investigation's evidence, not
   held apart (F-3).
2. **Demo state variants for review.** BACK-15 §2.4 found the React apps cannot show stale or down variants. Add a
   read-only URL seed (for example `?demo=stale|down|not-set-up|restricted|empty|loading|error`) that swaps fixture
   states. It must be visibly labelled ("Demo state: stale") and must not be a control that looks like it changes a
   source.
3. **Times.** Every evidence record has a source time. At least one record has a different `ingestedAt` from the
   others (to show ingestion lag). One correlated record has a correlation time. Any reasoning time with no source is
   flagged in the fixture as `synthetic: true` so the UI can print "demo time".
4. **Two health readings.** Each provider has a provider-health basis (a probe, like E-8) or none; each target has its
   own basis. At least one case where the provider is healthy and the target is unknown.
5. **Unavailable reasons.** Port has a BACK-7 reason code (`credential_refused` or `rate_limited`) as demo text.
6. **Conflict.** One pair of records whose times or values disagree, for the "times disagree" state (master proposal:
   "conflicting sources").
7. **Coverage.** An explicit `expectedSources` per target in the fixture, labelled as fixture-authored, so blind spots
   are computed, not hand-written.
8. **Agent outputs.** Each simulated output names its kind (collected, correlated, hypothesis, proposed), its agent
   and its cited E-ids; no counts or ages without a "demo value" flag.
9. **Personas.** E-5 stays `visibility: 'technical'`; one agent output cites it.

---

## 9. Visual quality criteria

Stated as checks a reviewer can apply, so they hold whichever token set BACK-18 carries forward (BACK-15 §4.1: this
document does not choose gold or cyan).

| # | Criterion | How to check |
| --- | --- | --- |
| Q-1 | One signature object per concept (pins; time lanes; output ring), and nothing else glows | Screenshot review |
| Q-2 | Every scene mark has a ledger row; the scene holds no fact of its own | Compare scene marks to ledger rows |
| Q-3 | The demo marker is inside the scene header | A crop of the scene alone still shows "Demo" |
| Q-4 | No `%`, composite score, trend arrow or invented count | Existing V2 "no %" assertion, extended |
| Q-5 | Hypothesis never shares the attention hue without a unique cue | BACK-15 D-15.2 ruling applied |
| Q-6 | Unknown is grey with a word and an icon; never green, never empty | Visual review in all §3.4/§4.4/§5.4 states |
| Q-7 | Text contrast at least 4.5:1, measured on rendered pixels | One rendered-pixel check per token set (BACK-15 §6) |
| Q-8 | 44 px targets, no horizontal overflow at 320–1440 px, EN and AR | Existing suites, extended |
| Q-9 | Reduced motion: nothing moves without a key press | Existing "no running animation" assertion |
| Q-10 | Gaps drawn as gaps; hypothesis marks stay hollow through playback | Step the replay to the end and inspect |
| Q-11 | Words for every state; colour never alone | Greyscale screenshot review |

---

## 10. Dependencies

| Dependency | Needed for | Status (FACT) |
| --- | --- | --- |
| BACK-15 D-15.3, D-15.4, D-15.5 | Route vs panel, lens placement, `evt`/`from=` context | Proposed, owner not ruled |
| BACK-15 D-15.2 (amber overload) | Hypothesis marks in Replay and the deck | Proposed |
| BACK-18 token-set choice (V1 gold or V2 cyan) | Final visuals of all three | Open in BACK-18 |
| BACK-7 evidence contract (`03-api-evidence-contracts.md`) | New time fields (§4.2), unavailable reason codes (§3.3) | Planning done; fields not in `contract/types.ts` |
| BACK-16 (G2 integration: BFF, scoped reads) | Real connectivity, reason codes, viewer-scope 403 | In progress in a parallel session |
| ADR-03 (permissions) | Restricted and viewer-scope states | Planning (BACK-7) |
| G3 (ADR-06) and G4 (ADR-07) | Any real Flight Deck | Not started |
| Native-speaker Arabic review | New copy (F-7 replacements, new state strings) | Not done |

---

## 11. Owner ranking and decision pack

Every item is **PROPOSAL** until the owner records a decision. Ranking a concept "build mock now" authorizes nothing
by itself: it allows drafting one mock-only slice, which then needs its own approval.

### 11.1 Ranking (BACK-17 deliverable 5)

| Concept | Recommendation | Reason |
| --- | --- | --- |
| A. Trust Observatory | **Build mock now**, as a route (the existing `#/sources`, redesigned) | Answers "where are we blind?"; fixes F-5 and F-6; small fixture change |
| B. Mission Replay | **Build mock now**, as a panel in the Investigation Room, **after** D-17.5 (time fields) | Fixes F-1 to F-4; shortens the room; needs the contract change first |
| C. Agent Flight Deck | **Keep for later** (G3). Meanwhile only audit text in the room | No facts of its own; risk of reading as live (F-7) |
| Command Home | Not a BACK-17 item; covered by D-15.4/D-15.5 | §6 |

### 11.2 Decisions

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-17.1 | Rank A, B, C (above) | Each: build mock now / keep for later / reject | As §11.1 |
| D-17.2 | Observatory health wording | (a) two readings, "Provider health" and "Target health"; (b) drop provider health; (c) keep V2's single "health" | (a) |
| D-17.3 | Observatory primary ledger | (a) coverage matrix with blind spots; (b) keep six cards | (a), cards become the connector ledger |
| D-17.4 | Replay placement | (a) panel in the Investigation Room; (b) separate route | (a), as BACK-15 D-15.4 |
| D-17.5 | Time fields in the display contract | (a) add optional `occurredAt`, `correlatedAt` and authored times on hypothesis/proposal; (b) keep two fields and show "demo time" for the rest | (a), to be reflected in the BACK-7 contract before the Replay slice |
| D-17.6 | Display time zone | (a) UTC everywhere (fixture uses `Z`); (b) viewer local; (c) both, UTC first for Technical | (a) for the demo, revisit at G2 |
| D-17.7 | Flight Deck vocabulary | (a) past-tense, script-relative statuses, no review counts; (b) keep V2 wording | (a) |
| D-17.8 | Demo state variants (§8 item 2) | (a) URL seed, labelled; (b) a visible "demo state" switch in the shell; (c) none | (a); a switch risks looking like a control on sources |
| D-17.9 | Fate of the V2 lab screens after a slice lands | (a) leave as a lab reference; (b) retire them | (a) until BACK-18 decides the token set |
| D-17.10 | Process: this docs PR | Confirm the commit and PR (see §12) | Confirm on the PR or in BACK-17 |

---

## 12. Hard-rule and process check

| Rule | Finding | Status |
| --- | --- | --- |
| Unknown is never Healthy | All three concepts keep it, and A adds a target/provider split that makes it stricter (F-5) | Holds |
| Demo data never shown as live | F-7 (deck) and F-2 (replay times) are existing risks; §2.3, §4.3 and §5.3 remove them | Holds in the concepts; existing V2 risks recorded |
| Display only | No run, approve, execute, connect or configure control in any concept | Holds |
| English-first with working Arabic/RTL | Rules in §2.5; existing Arabic copy quoted; new Arabic flagged NOT VERIFIED | Open risk (no native review), as in BACK-15 |
| No customer data, secrets, backend or MCP | Nothing proposed adds any | Holds |
| No code, styles or dependencies | This PR adds one Markdown file under `docs/planning/BACK-17/` | Holds |
| BACK-17 exclusions: "no repo modifications/commits/PR/merge/deploy or Jira status transitions" | The commit and PR for this document rest on the owner's approval given in chat and relayed by the session that started this work. It is not recorded in Jira. No merge and no Jira status change | **Process conflict.** The owner should confirm it on the PR or in BACK-17 (D-17.10), as for BACK-14 and BACK-15 |
| No scope expansion until owner review (acceptance 4) | No concept enters v1 scope; no slice or ticket is created | Holds |

---

## 13. Sources read and what was not checked

Read on 2026-11-18:

- Jira: BACK-17 (full description), BACK-5 (description and comments 17261–17285, including the Blueprint v4
  acceptance and D-1 to D-6), BACK-18.
- Confluence: KMC page 80052229 (Experience Atlas & Integration Journey v0).
- Repo at `96c2d7e`:
  - `CLAUDE.md`, `README.md`
  - `docs/planning/BACK-15/README.md`, `docs/planning/BACK-14/README.md` (header and method), 
    `docs/planning/BACK-7/03-api-evidence-contracts.md` (§3, §4, §5)
  - `docs/design-lab/v2/comparison.md`
  - `app/src/contract/types.ts`, `app/src/fixture/inv-demo-7.ts` (evidence times)
  - V1: `app/src/screens/Sources.tsx`, `Agents.tsx`, `sources/StatePanel.tsx`, `agents/OversightPanel.tsx`,
    `investigation/TimelinePanel.tsx`, `app/src/nav/routes.ts`
  - V2: `DESIGN.md`, `PRODUCT.md`, `types.ts`, `fixtures/world.ts`, `screens/SourceObservatory.tsx` (whole),
    `screens/MissionReplay.tsx` and `screens/AgentFlightDeck.tsx` (first 80 lines each), `i18n/replay.ts`,
    `i18n/deck.ts`, `i18n/observatory.ts` (the keys quoted)
- Shared session notes: the BACK-14 hand-over.

Not checked:

- The Blueprint v4 artifact itself (a private claude.ai page). Its content is taken from the BACK-5 comments.
- Product Definition v1 and Architecture v1, beyond what the tickets and the master proposal quote.
- The owner's reference images, and the V2 screenshots. No screen was rendered for this document.
- The rest of `MissionReplay.tsx` and `AgentFlightDeck.tsx` past line 80, V1 `world.ts` agent roster, and the V2
  `logic/` functions. Claims about them come from `comparison.md` and `DESIGN.md`.
- BACK-16's work in progress (a parallel session). §10 lists it as a dependency only.
- Arabic copy quality (no native-speaker review).

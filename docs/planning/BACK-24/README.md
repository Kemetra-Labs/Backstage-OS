# BACK-24 — EVAL Hybrid Mission Map B: Motion and optional WebGL visual pilot (planning and test protocol only)

Jira: [BACK-24](https://rahmaqanater.atlassian.net/browse/BACK-24) (parent BACK-1). Written 2026-11-21 on branch
`claude/back-24-bbf751` from `main` at `ed0497c`.
Related: BACK-18 (V2 fidelity pass, done, not reopened), BACK-22 (G1-03 renderer comparison, separate), BACK-8 (G0
visual/a11y audit, separate and still open).

**This is a planning and evaluation proposal. It authorizes nothing.** It adds no code, package, benchmark run,
fixture, test, CI change or dependency, and it moves no Jira status. Every number marked PROPOSED is a threshold for
the owner to accept or change, not a result. Every library fact marked UNVERIFIED comes from registry metadata only
and has not been installed, built or measured.

| Label | Meaning |
| --- | --- |
| **FACT** | Read from the repo at `ed0497c`, from the BACK-24 ticket text, or from npm registry metadata on 2026-11-21 |
| **PROPOSED** | A recommendation or threshold. Nothing is decided until the owner says so |
| **UNVERIFIED** | Not installed, built or measured. Listed so it is not mistaken for a result |

## Contents

1. [Inputs: what exists and what does not](#1-inputs-what-exists-and-what-does-not)
2. [Baseline](#2-baseline)
3. [Open contradiction: auto-play versus no movement before user action](#3-open-contradiction-auto-play-versus-no-movement-before-user-action)
4. [Test matrix](#4-test-matrix)
5. [Accessibility and device test plan](#5-accessibility-and-device-test-plan)
6. [Metrics and proposed thresholds](#6-metrics-and-proposed-thresholds)
7. [Due diligence per library](#7-due-diligence-per-library)
8. [Truth and fallback rules](#8-truth-and-fallback-rules)
9. [Owner decisions](#9-owner-decisions)
10. [Decision package, risk and rollback](#10-decision-package-risk-and-rollback)
11. [STOP conditions and next gate](#11-stop-conditions-and-next-gate)
12. [Sources read and what was not checked](#12-sources-read-and-what-was-not-checked)

---

## 1. Inputs: what exists and what does not

| Input named in the ticket | State | Consequence |
| --- | --- | --- |
| `docs/design-lab/hybrid-map/ENHANCEMENT-NOTE.md` | FACT: not in `main` (`docs/design-lab` holds only `v2/`). It exists as an **untracked working copy** in the sibling worktree `claude/kawalys-mission-map-visual-a9038d` (HEAD `ed0497c`), and I read it there | Quoted below as "working copy". Its own text says "Nothing here is approved or built" and that package names, licences and sizes were not verified. Both caveats stand |
| `docs/design-lab/hybrid-map/SPEC.md` (bounded spec for B) | Same: not in `main`, untracked working copy in the same worktree, read there | Quoted below as "working copy". It records the owner's 2026-11-21 selection of B with C's list view and says that selection is not approval to implement |
| Concept pages `concept-a/b/c.html`, `motion-b.html`, `README.md`, `tools/`, `out/` | Same worktree, untracked | **Not opened.** Concept B's rendered behaviour and its mobile, Arabic and contrast evidence are **UNVERIFIED** here |
| Confluence experience page 85688334 and ticket standard 85000222 | Linked from the ticket | Not opened. The ticket text and the two working-copy files are the requirement sources used |
| V2 fixture and screens | FACT: `app/src/design-lab/v2/` (Mission Map, Observatory, Replay, Flight Deck, one shared `world.ts`) | The synthetic fixture the pilot must reuse unchanged |

Because the working copy can change without a commit, the first action of any approved experiment is to get the
hybrid-map files committed to a branch the owner names, or handed over, so the baseline is a fixed revision.

What the working-copy files already fix (FACT about their text, not about behaviour):

- SPEC.md section 5: the only motion in B is a one-shot **selection trace**, 720 ms, `cubic-bezier(0.22, 1, 0.36, 1)`,
  `stroke-dashoffset` and `opacity` only, "No loop, no ambient motion". Under reduced motion the trace is not rendered.
- SPEC.md section 7 performance budget (Chromium pilot): about 600 DOM elements and 200 SVG elements on the map screen,
  no `backdrop-filter`, no more than one filter, one-shot animations only.
- ENHANCEMENT-NOTE.md: three layers (motion, D3 maths, WebGL hero), each "separate, removable", adoption order motion,
  then D3, then WebGL. Its own recommendation for motion is "start without the library".

## 2. Baseline

FACT from `app/src/design-lab/v2/PRODUCT.md` and `DESIGN.md`:

- Stack: Vite 5.4.21, React 18.3.1, TypeScript 5.6.3 strict, Vitest 2.1.9, Playwright. "No UI library, no router, no
  third-party requests. V2 adds no dependencies."
- Motion today: tokens `--kv2-dur-micro 120ms` and `--kv2-dur-short 220ms` with an exponential ease-out; "only state
  transitions, no decoration on load". `comparison.md` records "no running animation on any screen" under reduced
  motion.
- Horizon today: a static pre-rendered `assets/horizon.webp` over a CSS gradient fallback, no animation, never behind
  text on the Observatory.
- No Content-Security-Policy meta tag or header exists in `app/*.html` or the Vite configs (grep found none). So "CSP
  reviewed" in the ticket means writing the policy a WebGL or worker build would need, not checking an existing one.

Baseline arm (B0) for every comparison: Concept B built only with CSS, SVG and the Web Animations API, its complete
static and image fallback, Concept C's ledger and list as the non-graphical alternative, the V2 synthetic fixture
as-is, and no new status, data or evidence semantics.

## 3. Open contradiction: auto-play versus no movement before user action

The ticket asks the evaluation to "resolve the contradiction between first-load orbit animation and 'no movement
before user action' before experimenting". Reading the working-copy files locates it (FACT about their text):

| Where | What it says |
| --- | --- |
| ENHANCEMENT-NOTE.md section 1, table row "First load" | "Orbits draw once, then nodes settle inward (about 900 ms, once per session)", with no user action. The table lead-in calls every row "one-shot, all caused by a user action or first load" |
| ENHANCEMENT-NOTE.md section 1, "Not allowed" | "any motion that starts without a user action" |
| SPEC.md section 5 | Only a selection trace, started by selecting a node. No first-load motion at all |

So the note contradicts itself, and the owner-selected SPEC.md sits on the "no movement before user action" side. The
first-load row is the only auto-play item. Two smaller points from the same files: the note says the trace is "about
700 ms" while the spec says 720 ms (use the spec's number), and the note's WebGL section allows a "slow parallax from a
one-time pointer or scroll offset", which is user-driven but should be confirmed as not a continuous effect.

PROPOSED resolution, pending owner confirmation (decision D-24.1):

- Nothing moves before a user action. No auto-play, no loop, no idle drift, on any arm.
- Orbit and link tracing are **one-shot**, started by selecting a node or pressing an explicit "Trace" control that
  only changes view state (allowed under the display-only rule in BACK-17 section 2.2).
- A tracing animation ends in the same static state the fallback shows. Its duration and easing are fixed numbers in a
  token, not random.
- This keeps the BACK-15 rule: no pulse, blink or idle animation that could read as a live feed.

If the owner instead wants a first-load orbit, that is a separate approval with its own reduced-motion and
live-telemetry-look review. It is not assumed here.

## 4. Test matrix

Two independent optional layers, each with its own on, off and load-failure arms. Arms are tested separately and in the
combined cases the owner decides to allow (D-24.2).

| ID | Arm | Motion library | Decorative WebGL | What it proves |
| --- | --- | --- | --- | --- |
| B0 | Baseline | none (CSS / SVG / WAAPI) | static horizon image | The reference. Everything else is judged against it |
| M1 | Motion on | loaded, used for one-shot tracing, transitions, cross-fades | static image | The value of the library, alone |
| M2 | Motion off | library present but disabled by flag | static image | Flag-off equals B0, byte for byte in the DOM that carries information |
| M3 | Motion load failure | chunk blocked or throws | static image | Fallback to B0 behaviour with no console error that breaks the page, no lost information |
| W1 | WebGL on | none | decorative WebGL behind the SVG | The value of the shader or scene, alone |
| W2 | WebGL off | none | flag off | Equals B0 |
| W3 | WebGL load failure | none | context lost, chunk blocked, no WebGL, `webglcontextcreationfailed` | Static image shown, no blank or black area, no layout shift |
| MW | Both on (only if D-24.2 allows) | on | on | Interaction between the two layers |

Constant across all arms (the test oracle):

1. The same fixture, so the same nodes, edges, statuses and counts.
2. The same selection behaviour: selecting a node updates the inspector, the ledger row and the URL state the same way.
3. The same ledger and list content, in the same order.
4. The same truth labels, with the same words and shapes. A test reads them from the DOM and compares across arms.

Each arm is run per persona (Owner, Technical, Nontechnical), per language (EN, AR) and at the four widths in
section 5. V2 has no global ok / stale / down switch (that is the V1 static prototype's `S.src`). Its route `src=`
parameter only selects a provider, and source states live in the fixture. Per SPEC.md section 2 the fixture already
holds the cases that matter: GitHub, Jira and Sentry reachable, Sentry stale, Port unavailable, Datadog and Confluence
never read (unknown). So source-state coverage means selecting each of the six providers in each arm.

Checks that run on every arm (PROPOSED, to be written as tests only after the owner opens the experiment gate):

- Information parity: the set of visible text and `aria` names for graph, ledger and inspector is equal across arms
  for the same state.
- Unknown never reads as Healthy in any arm and any source state.
- No `%` figure or composite score appears.
- No network request except to the app's own origin (guards against CDN-hosted libraries and fonts).
- No `requestAnimationFrame` loop is running when the page is idle (see section 6, "idle frames").

## 5. Accessibility and device test plan

Covers the ticket's list. Screenshots from a self-check are not evidence for adoption; the evidence tiers below are
kept apart.

| Area | Method | Evidence tier |
| --- | --- | --- |
| EN and AR (RTL) | Each arm at `lang=en` and `lang=ar`. Check mirrored layout, isolated numerals and ids, tracing direction in RTL, and that the WebGL layer does not mirror in a way that breaks the horizon composition | Automated plus reviewer screenshots |
| Widths 320, 375, 768, 1440 | Playwright viewport matrix, no horizontal scroll, no clipped label, 44 px targets kept | Automated |
| Keyboard focus | Tab order through graph nodes, ledger rows and inspector; visible focus ring not hidden by the WebGL layer or by an animated element; no focus trap; selection by keyboard triggers the same one-shot trace | Automated plus manual |
| Screen reader and table alternative | The ledger is the accessible equivalent of the graph. Check the graph exposes role, name and state, that the ledger reads in a sensible order, and that the animation does not move DOM order. Real screen-reader pass (NVDA with Firefox or Chromium, VoiceOver with Safari) | **Manual, named reviewer, not simulated** |
| Reduced motion | `prefers-reduced-motion: reduce` in each engine. One-shot tracing becomes an instant state change. WebGL not started at all, not just paused | Automated plus manual |
| Contrast and legibility | Computed contrast of every text and edge state over the decorative layer at its worst frame, not only a still. Text never sits on bright WebGL regions | Automated computed values |
| Chromium, WebKit, Firefox | The root static-prototype suite runs Chromium and WebKit, but the V2 suite (`npm run e2e:v2`) is **Chromium only**. So WebKit is an addition for the V2 arms, and Firefox (opt-in via `PW_FIREFOX=1` in the root suite) is added for the WebGL arms because WebGL context behaviour differs | Automated, after the configs are extended in an approved experiment |
| Real device and low end | Real iPhone and a low-end Android. The BrowserStack SDK route in `CLAUDE.md` is **not yet proven**: the BACK-6 real-device check is paused after the SDK fell back to a local run, so a working Local-tunnel path is a precondition, or the owner supplies hardware. One low-end device class must be named by the owner (D-24.3) | **Independent, owner-gated. Not implied by Playwright** |

PROPOSED rule: an arm is not eligible for an adopt recommendation until the screen-reader pass and the real-device pass
exist as recorded evidence for that arm. A missing pass is reported as "not verified", never as pass.

## 6. Metrics and proposed thresholds

No measurement exists. Each threshold below is either taken from a named source (stated in the row) or left to the
owner. No number here was made up. Real values are recorded only after an approved run, with the revision, device,
browser version and run count beside each number.

| Metric | How it would be measured | PROPOSED threshold, and where it comes from |
| --- | --- | --- |
| Bundle delta, gzip, initial route | `vite build` size of the entry chunk, B0 versus arm, same build | **Owner sets the ceiling.** B0's size is measured at experiment time and the delta is reported against it. WebGL rule from ENHANCEMENT-NOTE section 3: lazy-loaded and code-split, so zero added to the initial route |
| Bundle delta, lazy chunks | Sum of chunks fetched when the feature starts | Reported, not capped. The owner sees the number before deciding |
| Largest Contentful Paint | Throttled profile, 5 runs per arm, median | Published Core Web Vitals "good" limit of 2.5 s at the 75th percentile, and not worse than B0 beyond the noise band. The noise band is the spread of the 5 B0 runs, measured, not assumed |
| Interaction to Next Paint (node select, trace) | Throttled profile, 5 runs per arm | Published Core Web Vitals "good" limit of 200 ms at the 75th percentile, and not worse than B0 beyond the B0 noise band |
| Cumulative Layout Shift | Page load and each trace | Published Core Web Vitals "good" limit of 0.1. Also: a WebGL failure path must add no shift (W3 check in section 4) |
| Frame timing during a one-shot trace | Frame timestamps during the 720 ms trace, desktop and the named low-end device | Report the share of frames over 16.7 ms (60 fps budget) and over 33 ms. **Owner sets the pass limit.** Budget rules from the working-copy files that need no invention: only `opacity`, `transform` and `stroke-dashoffset` animate, at most 10 animated elements, every animation within 1 s |
| Idle frames | Count of animation frames over 10 s with no input | **Zero** for every arm. Rule source: the ticket ("no continuous render loop") and ENHANCEMENT-NOTE section 3 rule 4 (no `requestAnimationFrame` running at idle) |
| DOM and SVG size | Element counts on the map screen | SPEC.md section 7: about 600 DOM and 200 SVG elements, no `backdrop-filter`, at most one filter. Re-measured per arm |
| CPU and GPU | Chrome trace main-thread time and GPU process time during trace and while idle | Idle: no measurable activity beyond B0 (follows from zero idle frames). Active: reported with the device, no limit until the owner sets one |
| Battery and resource use | Real hardware only, with a stated method (for example an OS energy report or a fixed-duration drain test). No cross-browser Battery Status API is assumed | Reported with the method named. No numeric threshold until the owner picks one |
| Memory | Heap and GPU memory after repeated select and trace cycles, WebGL context created and released | No growth across cycles that survives a forced GC, and at most one WebGL context, released on route leave. Cycle count chosen at experiment time and recorded |
| Visual regression | Pixel diff against B0 at a fixed viewport, animations finished or disabled | Fallback arms (M2, M3, W2, W3): identical to B0 in information regions, matching ENHANCEMENT-NOTE section 5 ("screenshots with the layer off are identical"). On-arms: tolerance owned by the owner (D-24.3) |

## 7. Due diligence per library

Registry facts below are FACT as of 2026-11-21 (`npm view`, read-only). Nothing was installed. Licence text, NOTICE
files, transitive trees, installed size versus bundled size, and security advisories are all **UNVERIFIED** until an
approved check.

| Candidate | Registry version | Declared licence | Declared runtime dependencies | Peer constraint that matters here | Notes |
| --- | --- | --- | --- | --- | --- |
| `motion` | 14.14.0 (modified 2026-11-13) | MIT | `framer-motion` 14.14.0, `tslib` | React `^18 \|\| ^19` (the repo is 18.3.1). `react`, `react-dom` and `remix` are all marked optional in `peerDependenciesMeta` | Unpacked size 1.0 MB for the wrapper; `framer-motion` alone is 8.5 MB unpacked. Unpacked size is install size, not bundle size |
| `framer-motion` | 14.14.0 | MIT | `motion-dom`, `motion-utils`, `tslib` | same | The package `motion` re-exports for React. A decision needs the exact import path chosen (for example a "mini" or reduced-feature import) because that sets the bundle size |
| `three` | 0.187.0 (modified 2026-10-30) | MIT | none declared | none | Unpacked 21 MB. A tree-shaken decorative scene would use a small part; the bundled size is UNVERIFIED. Pre-1.0 versioning means minor releases can break |
| `@react-three/fiber` | 9.8.2 (modified 2026-10-21) | MIT | `zustand`, `its-fine`, `scheduler`, `react-use-measure`, `buffer` and others | **React `>=19 <19.4`**, while the repo pins React 18.3.1 | Not usable without a React 19 upgrade, which is a framework change and out of scope. The WebGL arm therefore assumes **plain `three` in an imperative effect**, not R3F, unless the owner approves a React upgrade separately |
| `d3` (umbrella) | 7.9.2 (modified 2026-11-03) | ISC | about 30 `d3-*` packages | none | Not part of this pilot by default. If needed later, take single modules (`d3-shape`, `d3-scale`) instead of the umbrella: `d3-shape` 3.2.1 depends only on `d3-path` |

Items the diligence step must produce before an install request (acceptance criterion 5):

1. Exact version and lockfile integrity hash for each candidate, and the full transitive tree.
2. An SBOM (CycloneDX or SPDX) for the install, produced from a throwaway branch.
3. Licence and NOTICE text for every package in the tree. ISC and MIT are permissive, but declared licence is not a
   substitute for reading the shipped files. No commercial obligation is expected and none is verified.
4. `npm audit` result and advisory review at the pinned versions.
5. Install behaviour: whether any package in the tree runs install or postinstall scripts.
6. Bundled size by `vite build` with the actual import path, gzip and brotli.
7. A CSP proposal. Motion alone needs no relaxation. A WebGL build needs the policy to allow the app's own scripts and,
   if shaders are compiled from strings, no `unsafe-eval` should be needed (to confirm). Workers or `blob:` URLs, if
   any, are listed. All assets stay same-origin, with no CDN.
8. Supply-chain note: pin exact versions, no ranges, same as the existing `app/package.json`.

Dependency-policy note (FACT): V2 states "V2 adds no dependencies". Using any of these libraries is an exception to a
stated V2 rule. That exception is the owner's call (D-24.4) and nothing here relaxes it.

## 8. Truth and fallback rules

These bind every arm. They restate the repo's existing rules and add the pilot-specific ones.

- **Static fallback is complete.** With motion disabled, failed or unsupported, and with WebGL disabled, failed or
  unsupported, every node, edge, status, count and truth label remains visible and readable. The ledger carries the
  same facts as the graph.
- **WebGL is decorative only.** It sits behind the React and SVG layers, carries no source state, no node position
  meaning and no status colour. It is `aria-hidden`. Removing it changes no information. It is never needed to
  understand the graph.
- **Unknown is never Healthy.** Unchanged from `CLAUDE.md`. No animation or glow may paint an unknown, stale or
  unavailable source as healthy.
- **No live look.** No loop, no pulse, no flowing particles that read as traffic, no "now" wording. A one-shot trace
  ends in a static state. A single line in the scene header keeps the "Demo data" marker, so a cropped screenshot still
  says it.
- **No validated-topology implication.** Edge drawing and orbit placement stay deterministic from the fixture. Visual
  polish must not make demo links look like discovered or verified topology.
- **No new status words and no invented data** for any arm.
- **No render loop for WebGL.** Render on demand (on size change, on theme change, once on mount) and stop. Pause or
  skip on `visibilitychange` hidden. Respect `prefers-reduced-motion` by not starting it. Do not assume a Battery
  Saver API exists across browsers (the working-copy ENHANCEMENT-NOTE lists "data-saver, battery-saver, low-power" as
  off-by-default conditions, which the ticket tells us not to rely on): low-performance handling is a capability test at start (context creation, a short
  frame-time probe) with the static image as the answer on any doubt, plus phone-class default of off unless the owner
  chooses otherwise (D-24.5).
- **No remote calls.** No CDN, font, texture or telemetry request. Assets are local files.

## 9. Owner decisions

The ticket asks the owner to resolve (a), (b), (c). They are listed with the extra decisions this document found.

| ID | Decision | Default if unanswered |
| --- | --- | --- |
| D-24.1 | Confirm the auto-play resolution in section 3: no movement before user action, one-shot tracing only | Adopt the PROPOSED resolution in section 3 |
| D-24.2 | Which combined arms are allowed (MW) and whether motion and WebGL are evaluated together or strictly apart | Apart only. No MW arm |
| D-24.3 | Visual regression tolerance for on-arms, and who owns the low-end-device verification and which device class | No default. Adoption stays blocked until named |
| D-24.4 | (a) Whether the V2 "no dependencies" rule may allow a justified Motion exception, and whether any D3 module may follow later | Exception not granted |
| D-24.5 | (b) Whether decorative WebGL is wanted at all, and if so whether phone-class devices get the static image only | WebGL not wanted. Static horizon stays |
| D-24.6 | Whether a React 19 upgrade is out of scope for this pilot (so R3F is excluded and the WebGL arm uses plain `three`) | Out of scope, R3F excluded |
| D-24.7 | Where the experiment may live (detached design-lab branch or environment), and the stop-before-commit and stop-before-PR boundary | Detached branch, no commit, no PR |

## 10. Decision package, risk and rollback

When an approved experiment has run, the owner receives one package per layer, so adopt, defer and reject are
recommended separately for Motion and for WebGL.

Package contents:

1. The filled test matrix (section 4) with pass, fail or "not verified" per cell. No blank cell is read as pass.
2. Screenshots per arm, EN and AR, at the four widths, same state, same revision.
3. Reproducible commands: the exact scripts, the revision, the browser versions, the device list and the run count.
4. The metrics table (section 6) with measured values next to the PROPOSED thresholds.
5. The due-diligence pack (section 7): lockfile diff, SBOM, licence texts, audit output, size by import path, CSP.
6. Named trade-offs: what the layer gives a reviewer that B0 does not, and what it costs.
7. A recommendation per layer, adopt, defer or reject, with the reason and the evidence it rests on.

Risk and rollback:

| Risk | Control |
| --- | --- |
| Library or WebGL breaks information display | Fallback arms M3 and W3 are mandatory tests. Feature flag defaults to off |
| Animation looks like live telemetry | One-shot only, no loop, idle-frame metric at zero, "Demo data" in the scene header |
| Cost to maintainability (dependency drift, `three` pre-1.0) | Exact pins, lazy chunk, isolated to the design-lab entry |
| Performance cost on phones | Static image on doubt, on-demand render, real low-end device check required |
| Dependency or licence surprise | SBOM and licence read before the install request |
| Rollback | The feature is behind a flag and in a separate chunk. Removal is deleting the flag, the chunk and two dependency lines. Because the experiment sits on a detached branch, rejection leaves `main` untouched |

## 11. STOP conditions and next gate

STOP and report, do not continue, on any of these (from the ticket):

- Incomplete mobile, RTL or accessibility proof for an arm that is being recommended.
- A licence that is unclear or has a commercial or NOTICE obligation not yet reviewed.
- Privacy or performance degradation that no fallback removes.
- Any measurement that is estimated, copied or invented instead of run.
- Scope creep: edits to V1 or V2 production screens, data contracts, G1 extraction engines, real sources, auth, backend,
  agent runtimes, CI, deployment, analytics or secrets; auto-play loops; inaccessible motion; remote assets or CDN;
  a framework replacement; a silent WebGL rollout.
- A missing explicit owner implementation gate.

Proposed next gate (matches the ticket): the owner reviews this protocol and the Concept B mobile, Arabic and contrast
evidence (which does not yet exist in the repo), answers D-24.1 to D-24.7, and only then authorizes **one** isolated
experiment on a detached design-lab branch or environment, with a separate stop-before-commit and stop-before-PR
boundary. BACK-8 and BACK-22 stay separate; nothing in this document approves a design, a renderer or a dependency.

## 12. Sources read and what was not checked

Read:

- BACK-24 ticket text in Jira, 2026-11-21.
- Repo files at `ed0497c`: `app/package.json`, `app/src/design-lab/v2/PRODUCT.md`, `DESIGN.md`,
  `docs/design-lab/v2/README.md`, `comparison.md` (the grep lines quoted above), `docs/planning/BACK-17/README.md`
  (label convention and display-only rules).
- npm registry metadata for `motion`, `framer-motion`, `three`, `@react-three/fiber`, `d3`, `d3-shape`, `d3-scale`
  (version, licence, dependencies, peer dependencies, unpacked size, modified date), read-only, 2026-11-21.
- `docs/design-lab/hybrid-map/ENHANCEMENT-NOTE.md` and `SPEC.md`, as untracked working copies in the sibling worktree
  `claude/kawalys-mission-map-visual-a9038d` (not on `main`).

Not checked, and so not used as evidence:

- The hybrid-map concept pages, their README, tools and captures (same worktree, not opened).
- The Confluence experience page and the Jira ticket standard page.
- Any licence file, NOTICE file, SBOM, advisory database or bundle size for any candidate.
- Any browser, device, screen-reader or performance behaviour of Motion or WebGL in this app.
- Whether `three` or Motion needs a CSP change in this app.

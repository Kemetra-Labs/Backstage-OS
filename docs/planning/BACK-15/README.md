# BACK-15 — Kawalys Experience Atlas, Navigation Lenses and Visual Signature (discovery only)

Jira: [BACK-15](https://rahmaqanater.atlassian.net/browse/BACK-15) (parent BACK-1). Written 2026-11-18 on branch
`claude/back-15-experience-atlas-464677` from `main` at `ebb3585`.
Master proposal: [Experience Atlas & Integration Journey v0](https://rahmaqanater.atlassian.net/wiki/spaces/KMC/pages/80052229)
(Confluence, PROPOSED).

**This is a discovery document, not an implementation.** It changes no source, style, test, dependency or CI file. It
moves no Jira status. Everything it suggests is marked **PROPOSAL** and needs the owner's decision (section 9) before
any slice is opened. It gates [BACK-17](https://rahmaqanater.atlassian.net/browse/BACK-17) (surface concepts) and
[BACK-18](https://rahmaqanater.atlassian.net/browse/BACK-18) (V2 fidelity pass).

How to read the labels in this document:

| Label | Meaning |
| --- | --- |
| **FACT** | Read from the repo at `ebb3585` or from Jira/Confluence on 2026-11-18, with the file or ticket named |
| **PROPOSAL** | My recommendation; nothing is decided until the owner says so |
| **NOT VERIFIED** | A claim that no one has checked; listed so it is not mistaken for a result |

## Contents

| § | Section | BACK-15 item it answers |
| --- | --- | --- |
| 1 | [Screen inventory: built vs approved](#1-screen-inventory-built-vs-approved) | Deliverable 1 |
| 2 | [Information architecture and navigation lenses](#2-information-architecture-and-navigation-lenses) | Deliverable 2, design questions 1–3, acceptance 2 |
| 3 | [One scenario, three design treatments](#3-one-scenario-three-design-treatments) | Deliverable 3, acceptance 4 (storyboard) |
| 4 | [Shared visual signature](#4-shared-visual-signature) | Deliverable 4, design question 4 |
| 5 | [Demo, evidence, unknown and permission states](#5-demo-evidence-unknown-and-permission-states) | Acceptance 1 |
| 6 | [Responsive, keyboard, 200% zoom and EN/AR plan](#6-responsive-keyboard-200-zoom-and-enar-plan) | Acceptance 3 |
| 7 | [Dependencies and gap list](#7-dependencies-and-gap-list) | Deliverable 5 |
| 8 | [Conflicts with the repo's hard rules](#8-conflicts-with-the-repos-hard-rules) | Hard rules in `CLAUDE.md` |
| 9 | [Owner decision pack](#9-owner-decision-pack) | Deliverable 6, acceptance 4 |
| 10 | [Sources read and what was not checked](#10-sources-read-and-what-was-not-checked) | — |

---

## 1. Screen inventory: built vs approved

Two separate questions apply to each surface, and they are often confused:

- **Where it exists today:** nowhere, the static prototype (`index.html`), the V1 React app (`app/`, PR #7), or the V2
  visual lab (`app/src/design-lab/v2`, PR #8).
- **What authority it has:** one of the four **approved** v1 screens (BACK-5, Blueprint v4), a **supporting** surface
  that serves those four, a **candidate** that the owner has not yet accepted, or **future** work behind a later gate.

**Built does not mean approved.** Several candidates already exist as demo screens because earlier slices built them.
That does not move them into v1 scope. The owner still ranks them (section 9, D-15.4).

### 1.1 Inventory table (FACT for "where it exists", PROPOSAL for the authority column where marked)

| Surface | V1 route (`app/src/nav/routes.ts`) | V2 lab screen (`design-lab/v2/types.ts` `SCREENS`) | Static prototype | Authority | Ticket |
| --- | --- | --- | --- | --- | --- |
| Portfolio / Mission Overview | `#/portfolio` | — | yes | **Approved** (BACK-5) | BACK-11 (Done) |
| Project Intelligence + dependency map | `#/project/:id[/:component]` | `mission-map` (cross-product constellation, not the same screen) | yes (Network) | **Approved** | BACK-12 (Done) |
| Investigation Room | `#/investigation/INV-DEMO-7`; `INV-DEMO-9` is a summary room | — | yes | **Approved** | BACK-6, BACK-8 |
| Evidence Explorer | `#/evidence/:id?from=` | — (evidence drawer inside each screen) | drawer | **Supporting** (step 4 of the core flow) | BACK-6 |
| Decision Inbox + detail (display only) | `#/decisions[/:id]` | — | yes (Decision Center) | **Approved** | BACK-13 (Done) |
| App shell, persona and language switches | shell (`app/src/shell/`) | own shell (`navigation/Shell.tsx`) | yes | **Supporting** foundation | BACK-10 (Done) |
| Command Home / Daily Mission Briefing | `#/` (the V1 landing route) | — | yes (home) | **Candidate**. Confluence calls it "proposed supporting experience"; it is already the V1 landing page | none (BACK-17 optional) |
| Source Observatory / Trust Center | `#/sources` ("Source health, demo only") | `source-observatory` | yes (Sources) | **Candidate P1** | BACK-17 A |
| Mission Replay / Timeline | — (a Timeline panel inside the Investigation Room) | `mission-replay` | — | **Candidate P1** | BACK-17 B |
| Agent Flight Deck | `#/agents` ("Agent activity, demo only") | `agent-flight-deck` | yes (Agents) | **Candidate P2** | BACK-17 C |
| Cross-product Mission Map (constellation) | — | `mission-map` | — | **Candidate** (PROPOSAL: treat it as the spatial view of Portfolio, see §3.A) | BACK-18 |
| Commercial Operations Lens | — | — | — | **Future** (BACK-3; needs contracts and permissions) | BACK-3 |
| Settings, workspace management, customers | — | — | partly | **Out of scope**. No approved requirement (QA report §1) | — |

### 1.2 What the inventory shows

1. **The four approved screens are built in V1 and connected.** The QA report (`docs/qa/kawalys-frontend/REPORT.md` §2)
   walks the whole chain.
2. **The three P1/P2 candidates are each built twice already:** once as plain V1 demo screens (`#/sources`,
   `#/agents`, the Investigation timeline panel) and once as V2 "signature" screens. Neither build was an owner
   acceptance of the concept. BACK-17 should design from both rather than start blank (section 7).
3. **The V2 lab is a separate app.** It has its own entry (`v2.html`, `npm run dev:v2`), its own token set and its own
   URL scheme. It has no Portfolio, Investigation or Decision screen. It links to V1 only through a plain link to the
   V1 root (`navigation/Shell.tsx` `v1Links()`), and V1 has no link to V2.

---

## 2. Information architecture and navigation lenses

### 2.1 The three lenses (from the master proposal; behaviour is PROPOSAL)

| Lens | User question | What it owns | What it must not do |
| --- | --- | --- | --- |
| **COMMAND** | What needs attention today? | Ranked attention items, product-level three-axis source state, counts that open the list behind them | Hold any fact that is not also on the screen it links to. Invent a global score |
| **EXPLORE** | Where is it, and what is connected to it? | Topology (products → components → edges), evidence records, source coverage | Decide or propose anything. Turn a correlated or hypothesis edge into an observed one |
| **DECIDE** | What can we prove, and what does a human need to decide? | The investigation narrative (Observed / Correlated / Hypothesis), unknowns, options, the proposed next human step | Execute anything. Show an approve, run, release or retry control (`isForbiddenControlLabel`) |

The lenses are **ways of moving through one set of facts, not separate systems.** Each lens reads the same synthetic
world (V1 `app/src/fixture/world.ts`). A lens changes what comes first and how much detail is shown. It never changes
a fact, a truth label or a source state.

PROPOSAL: show the lens as a quiet three-part group in the shell's navigation (Command, Explore, Decide), with the
existing screens listed under it. Do not add a mode switch that restyles the app. A lens is where you are, not a
setting.

### 2.2 Lens map of every existing surface (FACT for routes, PROPOSAL for lens assignment)

| Lens | V1 routes | V2 lab screens | Notes |
| --- | --- | --- | --- |
| COMMAND | `#/` Command Home, `#/portfolio` | `mission-map` at scope `all` | Home ranks; Portfolio lists every product. The QA report flags that Portfolio's attention list repeats Home's (§8, deferred finding) |
| EXPLORE | `#/project/:id[/:component]`, `#/evidence/:id`, `#/sources` | `mission-map` at a product scope, `source-observatory` | Sources belongs here because it answers "where do we have no evidence?" |
| DECIDE | `#/investigation/:id`, `#/decisions[/:id]` | `mission-replay` | Replay is the time view of one investigation |
| (oversight, candidate) | `#/agents` | `agent-flight-deck` | PROPOSAL: keep it outside the three lenses until G3. Agents add no facts of their own in the demo world |

### 2.3 Which screen owns which information (PROPOSAL; answers design question 2)

One owner per kind of information. Other screens show a summary and link to the owner instead of a second copy.

| Information | Owner | Shown as a link or summary on |
| --- | --- | --- |
| Product list and per-product source state | Portfolio | Home (top items only), Mission Map (as nodes) |
| Attention ranking | Home | Portfolio (PROPOSAL: replace the repeated list with "3 items need attention → Home") |
| Components, edges, edge classification | Project Intelligence | Mission Map (cross-product view only) |
| One evidence record (provenance, observed/ingested time, freshness, visibility) | Evidence Explorer | Drawer in Investigation, Decision detail and Project |
| Per-source connectivity, freshness, health and last successful read | Sources / Observatory | Three-axis marks everywhere a source is cited |
| Investigation narrative and its timeline | Investigation Room | Replay (the same events, laid out in time), Decision detail (the observed facts only) |
| Options, trade-offs, unknowns, proposed next human step | Decision detail | Home and Inbox (title and priority only) |
| Agent activity | Agents (candidate) | Investigation (which agent collected which evidence, as text) |

### 2.4 Context that should persist across screens (FACT for today, PROPOSAL for the target)

| Context | V1 today | V2 lab today | Gap | PROPOSAL |
| --- | --- | --- | --- | --- |
| Persona | `?persona=` in the search part (`App.tsx` `initial()`), kept across navigation | `persona` in the hash query (`navigation/route.ts`) | The two schemes do not read each other. The V2→V1 link drops it | One scheme: keep V1's `?persona=&lang=` in the search part for both, since it already survives hash navigation |
| Language | `?lang=` in the search part | `lang` in the hash query | Same as persona | Same as persona |
| Selected project | In the path (`#/project/RT`) only. Not carried to Investigation, Evidence or Decisions | `scope` in the hash | V1 forgets the project when you leave Project Intelligence. The breadcrumb rebuilds it from the case's `projectId` | Derive the project from the case, as V1 already does, and add `?project=` only on list screens that filter by it |
| Selected component or node | Path segment (`#/project/RT/stock-sync`) | `node` in the hash | Both persist it on their own screen only | Keep it local to the map. It is not cross-screen context |
| Evidence source in focus | Not persisted (drawer state is local) | `src` on Observatory, `evt` on Replay | V1 loses the open evidence on reload | PROPOSAL: `?ev=E-1` on Investigation, so a reload or shared link reopens the drawer |
| Timeline position | Not persisted | `evt` | Investigation's timeline and Replay don't share a position | `evt` means the same event id on both |
| Return path | `?from=INV-DEMO-7` on Evidence only (`routes.ts`) | — | Decision detail and Project have no return path besides the breadcrumb and the browser Back button | Extend `from=` to Decision detail and Project when they are opened from a case. Browser Back stays the main return path and must keep working (already covered by `e2e/flow.spec.ts`) |
| Demo source state (normal, stale, unavailable) | Static prototype only (`S.src`); the React apps use fixed fixture states | Fixed | The React apps can't show a reviewer the stale or down variants of a screen | Out of scope here. Note for BACK-17 fixture requirements |

### 2.5 The core v1 flow stays unchanged (acceptance 2)

FACT: the V1 app implements the five-step chain, and every step is a real route:

```
Portfolio            Project                       Investigation                  Evidence                              Decision
#/portfolio  ──▶  #/project/RT/stock-sync  ──▶  #/investigation/INV-DEMO-7  ──▶  #/evidence/E-1?from=INV-DEMO-7  ──▶  #/decisions/DEC-DEMO-3
```

Command Home (`#/`) sits **in front of** Portfolio as the COMMAND landing scene. It offers a shortcut ("Open case
INV-DEMO-7") but it does not replace or reorder any step. Nothing in this document adds a step, removes a step or
changes a route. The candidate surfaces (Observatory, Replay, Flight Deck) hang off the chain as side doors:

- Observatory from any source mark.
- Replay from the Investigation Room's timeline.
- Flight Deck from an agent name.

Each returns to where it was opened.

### 2.6 One end-to-end story, three personas, EN and AR

The story is the existing synthetic case. Every id below is in `app/src/fixture/world.ts` or `inv-demo-7.ts`. All
links in the app point to `example.invalid` and are inert.

> On main, `ci / integration-tests (stock-sync)` run `#DEMO-4471` fails after PR `#DEMO-88` (a test-fixture timezone
> change) is merged. Jira `RT-DEMO-112` ("stock-sync integration test flaky") is linked. Investigation `INV-DEMO-7`
> opens. Sentry is stale, Datadog is not configured and Port is unavailable, so runtime impact is **unknown, not
> evidenced**. The investigation ends in proposal `DEC-DEMO-3`: "Hold release `RT 2.14-rc` until the failing check is
> re-verified?" It has three options (A suggested), and a human decides in `RT-DEMO-112`. Nothing executes.

| Step | Owner | Technical | Nontechnical |
| --- | --- | --- | --- |
| Home | "Retail Tower: one check failing, impact unknown." Opens the case | Same item, plus check and run ids | Plain-language item, with no run, job or PR ids |
| Project | Component state only | Edge classification and evidence ids on `stock-sync` | Summary card. The map is optional, with the table first |
| Investigation | Words-only confidence (D-6) | Full ledger, raw output (E-1) | Summarized read-only room with redaction (D-5) |
| Evidence | Restricted records show "restricted" (E-12) | All records the persona may see | Same restriction rules as Owner |
| Decision | "Hold release RT 2.14-rc …?" | "Hold RT 2.14-rc pending integration-tests (stock-sync) with fixture reverted?" | "Should the planned release wait for a re-check?" |

Arabic: the same frames with `dir="rtl"`. Ids, versions and times stay in `<bdi dir="ltr">`, and digits are Latin
0–9 (D-3). The V1 rule is enforced by `e2e/flow.spec.ts` ("no Latin text outside an LTR isolate in Arabic"). The
dependency map keeps left-to-right geometry in Arabic, and the text inside nodes follows the language (BACK-12).

Screenshots that already show this story (FACT, files exist):

- Desktop EN Owner: [Home](../../qa/kawalys-frontend/screens/desktop-en-owner/01-home.png),
  [Project RT](../../qa/kawalys-frontend/screens/desktop-en-owner/03-project-rt.png),
  [INV-DEMO-7](../../qa/kawalys-frontend/screens/desktop-en-owner/06-investigation-inv7.png),
  [E-1](../../qa/kawalys-frontend/screens/desktop-en-owner/08-evidence-e1.png),
  [DEC-DEMO-3](../../qa/kawalys-frontend/screens/desktop-en-owner/10-decision-dec3.png)
- Desktop AR Technical: [INV-DEMO-7](../../qa/kawalys-frontend/screens/desktop-ar-technical/06-investigation-inv7.png),
  [DEC-DEMO-3](../../qa/kawalys-frontend/screens/desktop-ar-technical/10-decision-dec3.png)
- Mobile EN Nontechnical: [INV-DEMO-7](../../qa/kawalys-frontend/screens/mobile-en-nontechnical/06-investigation-inv7.png)
- Mobile AR Owner: [DEC-DEMO-3](../../qa/kawalys-frontend/screens/mobile-ar-owner/10-decision-dec3.png)

---

## 3. One scenario, three design treatments

All three treatments use the **same case** (INV-DEMO-7 → DEC-DEMO-3), the **same facts** and the **same truth
labels**. They differ only in what leads the composition. They stay inside the accepted C2 direction (dark-first,
dark stage plus ruled ledger, Blueprint v4 §6/§6b) and do not reopen the visual decision. Section 4 covers which token
set carries C2.

Each treatment is a **PROPOSAL** for BACK-17 or BACK-18 to design further. The frames are text wireframes. Where a
built screen already comes close, it is linked as a reference, not as the design.

### 3.A Spatial: Mission Map leads (EXPLORE lens)

Job: show **where** the failure sits and what touches it before saying why.

```
┌ Mission Map · scope: Retail Tower OS ───────────────────────────── [Demo data] ┐
│                                                                                 │
│   pos-client ── api-gateway ══ stock-sync ⚠ ── inventory ── reporting           │
│                    (observed)   CI check failing   (stale)    (not configured)  │
│                               ╲                                                 │
│                                payments (degraded, stale)                       │
│                                                                                 │
│  Legend: ══ observed  ── correlated  ┄┄ hypothesis  ·· unknown                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Inspector (ledger): stock-sync                                                  │
│  Connectivity: not configured · Freshness: unknown · Health: unknown            │
│  Observed  #DEMO-4471 failed on main   (GitHub, current, 6 min)                 │
│  Open case INV-DEMO-7 →        Evidence E-1 →                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- The scene is the map. The ledger is the inspector. Selecting a node fills the ledger, and nothing else on the page
  moves.
- Health is shown on a node only when evidence backs it (`resolveHealth`). Most nodes read "unknown" or "stale", and
  that is correct.
- Accessible alternative: the existing `DepTable`. Under 640 px the table is the default (V2 already does this).
- References: V1 [Project RT](../../qa/kawalys-frontend/screens/desktop-en-owner/03-project-rt.png), V2
  [Mission Map 1440](../../design-lab/v2/screenshots/v2/mission-map-en-owner-1440.jpg).
- Risk: the map invites decoration (glow, orbits). Rule: glow marks selection or a state, never a node at rest.

### 3.B Evidence-led: Investigation leads (DECIDE lens)

Job: show **what we can prove**, in order, with the gaps visible.

```
┌ INV-DEMO-7 · stock-sync integration check failing ──────────────── [Demo data] ┐
│ Stage (dark):  ● PR merged ── ● failed check ── ◌ gap: runtime ── ◌ proposal    │
│                41 min ago      6 min ago       (Sentry stale,     DEC-DEMO-3     │
│                                                 Datadog not set)                 │
├ Ledger (ruled) ─────────────────────────────────────────────────────────────────┤
│ OBSERVED     #DEMO-4471 failed on main                  GitHub · current · E-1  │
│ OBSERVED     PR #DEMO-88 changed fixture timezone       GitHub · current · E-2  │
│ CORRELATED   RT-DEMO-112 linked via the PR's commit     rule-based · E-3        │
│ HYPOTHESIS   Timezone change caused the failure. Not confirmed.                 │
│ UNKNOWN      Customer or runtime impact: not evidenced                          │
│                                          Open proposal DEC-DEMO-3 →             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- This is the existing C2 "dark stage + ruled ledger" layout, so it is the lowest-risk treatment.
- The stage is the Mission Replay idea folded into the room: a scrubbable strip of the same events. PROPOSAL: Replay
  becomes this strip, expandable in place, rather than a separate route (see D-15.4).
- Evidence gaps are drawn as gaps (an open ring with a reason). They are never animated into a line.
- The QA report found the room too long: about 3700 px, with evidence shown three times (§8). PROPOSAL: the ledger
  is the one evidence list, the stage replaces the separate timeline panel, and the evidence list collapses into the
  ledger.
- References: V1 [INV-DEMO-7](../../qa/kawalys-frontend/screens/desktop-en-owner/06-investigation-inv7.png), V2
  [Mission Replay 1440](../../design-lab/v2/screenshots/v2/mission-replay-en-owner-1440.jpg).

### 3.C Trade-off studio: Decision leads (DECIDE lens)

Job: show **what a human must choose**, side by side, with what each option rests on.

```
┌ DEC-DEMO-3 · Proposed · Hold release RT 2.14-rc until the failing check is re-verified? ┐
│ Context: RT 2.14-rc planned 18 Nov; integration check failing on main.                   │
├──────────────────────┬──────────────────────┬────────────────────────────────────────────┤
│ A  Hold the RC       │ B  Keep the date     │ C  Revert fixture first, then decide       │
│    (suggested)       │                      │                                            │
│ + no unexplained     │ + date holds         │ + tests the hypothesis directly            │
│   failing check      │ − real defect could  │ − masks the problem if already flaky       │
│ − 18 Nov may slip    │   ship               │                                            │
│ Rests on: E-1, E-2   │ Rests on: release,   │ Rests on: E-2                              │
│                      │   RT-DEMO-112        │                                            │
│ Unknown: re-check    │ Unknown: runtime     │                                            │
│   time               │   impact             │                                            │
├──────────────────────┴──────────────────────┴────────────────────────────────────────────┤
│ Next human step: review in RT-DEMO-112 with the release owner. Nothing here executes.    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Options are columns of equal weight. "Suggested" is a text label, not a highlighted button.
- There is no approve, choose or submit control. The only allowed action is copying the proposal text, which is
  already the V2 rule.
- "Rests on" links each option to evidence ids, which open the drawer. An option with no evidence says so.
- Under 768 px the columns stack in option order. In Arabic the column order follows the reading direction (A on the
  right). The option letters stay A/B/C.
- Reference: V1 [DEC-DEMO-3](../../qa/kawalys-frontend/screens/desktop-en-owner/10-decision-dec3.png).

### 3.D How the treatments relate (PROPOSAL)

They are not three competing products. They are the EXPLORE and DECIDE scenes of one flow. The owner chooses, per
treatment, between:

- **accept as the target** for its screen,
- **revise**, or
- **reject**.

See D-15.3.

---

## 4. Shared visual signature

### 4.1 The decision this section does not take

FACT: the accepted C2 direction (BACK-5, D-1) is **dark-first on the existing prototype tokens**. Those tokens are
V1's gold-on-navy set in `app/src/styles/tokens.css` (copied from `css/app.css`). The V2 lab has a second token set,
cyan on teal-navy, in `app/src/design-lab/v2/styles/tokens.css`. BACK-18's "adopt V2 as the visual base" is labelled
"assistant's judgement, to be confirmed".

So this document does **not** pick a token set. It defines the signature as **semantic roles** that either set can
fill, shows how each set fills them today, and leaves the choice to the owner (D-15.1). BACK-18 cannot start until
that choice is made.

### 4.2 Semantic roles (PROPOSAL)

| Role | Rule | V1 fills it with | V2 lab fills it with |
| --- | --- | --- | --- |
| Ground and surfaces | Dark, at most three surface levels | `--bg #060B13`, `--surface`, `--surface-2/3` | `--kv2-bg #050c14`, `--kv2-panel`, `--kv2-well` |
| Ink | Three levels, each at least 4.5:1 on the panel | `--ink`, `--ink-2`, `--muted` | `--kv2-ink`, `--kv2-ink-2`, `--kv2-muted` |
| **Structure accent** | Selection, focus, current page. Never a state | Gold `--gold #DDAA57` | Cyan `--kv2-cyan #2de2ec` |
| **Attention** | A state that needs a human: failing, stale, degraded, evidence gap | Amber `--amber` | Amber `--kv2-amber` |
| **Truth hues** | Observed, Correlated, Hypothesis, Proposed; each also carries a shape or icon | green, blue, amber (dashed), violet | green, blue, amber (bulb icon), violet |
| Unknown | Neutral grey, never green | `--unk #9AA7B8` | muted ink plus a question-mark icon |
| Unavailable | Red, for a connector that cannot be read | coral `--coral` | red |

### 4.3 A rule to settle: amber means two things

FACT: in both sets the hypothesis hue is the same amber as the attention states.

- V1 sets `--hyp: var(--amber)`. It also uses `--amber` for stale freshness and degraded health
  (`components.css` lines 58, 61, 99). V1 separates them by shape only: hypothesis is a dashed border
  (`app.css` line 133).
- V2 styles a hypothesis chip and a warning chip with the **same rule**
  (`design-lab/v2/styles/base.css` line 135). They differ only by icon.

Risk: a hypothesis label (a normal, expected part of an investigation) can read as an alarm. A stale source can read
as a guess.

PROPOSAL (D-15.2), any of:

- (a) Keep amber for attention only and give hypothesis its own hue.
- (b) Keep the shared hue, but require the dashed shape and the word on every hypothesis mark, and test it.
- (c) Accept the overlap as is.

Recommendation: **(b)**. It changes no token, and V1 already does most of it.

### 4.4 Scene and ledger (PROPOSAL, builds on Blueprint v4 §6b)

- Every DECIDE and EXPLORE screen has one **scene** (map, stage strip, option columns, source pins) and one **ledger**
  (ruled rows of labelled statements with source, time and evidence id).
- The scene is for orientation. The ledger is the record. A fact may appear in the scene only if it is also a ledger
  row. The scene never holds a fact of its own.
- One signature object per screen, as the V2 lab already does (`DESIGN.md` "Direction"). COMMAND screens have no
  scene. They are lists that link into scenes.

### 4.5 Typography (FACT for today, PROPOSAL for the rule)

- Both sets use a local stack: Inter, then Cairo for Arabic, then system fonts. Ids use a monospaced face (V1
  `--f-mono`). There are no third-party font requests.
- BACK-18 stage 1 proposes self-hosting a geometric sans. PROPOSAL rule: whatever face is chosen, it is self-hosted,
  has an Arabic pair with matching x-height (Cairo today), uses tabular numerals for times and counts, and keeps ids
  in mono.
- Uppercase tracked eyebrows and chips: V2 keeps them for reference fidelity against a recorded Hallmark FAIL
  (`comparison.md` A2). This is an open owner call that already sits in BACK-18. It is not repeated here.

### 4.6 Motion (PROPOSAL)

| Allowed | Not allowed |
| --- | --- |
| State transitions (selection, drawer open, tab change), 120–220 ms, ease-out (V2 tokens `--kv2-dur-micro/short`) | Motion on load for decoration |
| Replay playback, which only starts when the user presses play | Animating an evidence gap closed, or a hypothesis edge turning solid |
| A pulse on a newly arrived item, once | Idle loops (orbits, particles) that run without user action |

Under `prefers-reduced-motion: reduce`, every transition becomes instant and playback steps one event per press. Both
apps already have a reduced-motion block (`app/src/styles/app.css` line 179, `design-lab/v2/styles/base.css`
line 251). The V2 suite asserts that no animation runs.

### 4.7 Responsive, RTL and accessibility fallbacks of the signature

- Every scene has a non-graphic twin: the map has a table, the stage strip has the ledger, the option columns have a
  stacked list, and the source pins have rows. Under 640 px the twin is the default.
- RTL: topology and time axes keep their left-to-right geometry (time and dependency direction are data, not text).
  Panels, ledgers and option columns mirror. Text inside nodes follows the language.
- Glow and colour never carry meaning alone. Every state has a word, and every truth label has a shape or icon.

---

## 5. Demo, evidence, unknown and permission states

Acceptance item 1 asks the proposals to separate four things. For each, the rule and how it is shown today:

| Thing | Rule (FACT: existing contract) | How it is shown (FACT) | What the treatments in §3 add (PROPOSAL) |
| --- | --- | --- | --- |
| **Demo data** | Nothing may be presented as live (`CLAUDE.md`) | A "Demo data" marker on every V1 route (checked by `flow.spec.ts`). V2 has `.kv2-demo`. Inert `example.invalid` links | The marker sits in the scene header of every treatment, so a cropped screenshot still shows it |
| **Observed evidence** | Truth labels from `src/contract/rules.ts` (`resolveLabel`) | Label chips with shape and colour; source, time and evidence id on each row | Scene marks are tied to ledger rows (§4.4), so no scene mark exists without a labelled row |
| **Unknown** | Unknown is never Healthy (`resolveHealth`); three independent axes; no composite score | `HealthTriad` (V1), source rows and pins (V2). "Health unknown", "Stale", "Not configured" | Gaps are drawn as gaps (§3.B). Impact reads "Unknown, not evidenced" until evidence exists |
| **Actual permissions** | Persona switching is **presentation only**. Real redaction must be server-side (ADR-03, a G2 item, BACK-7) | Restricted records say "restricted" (E-12 for Owner). Nontechnical sees no run, PR or job ids | Every treatment labels the persona switch "Preview as …" and says it does not grant access. No screen claims that hiding a field is a permission |

---

## 6. Responsive, keyboard, 200% zoom and EN/AR plan

One plan for all screens and treatments. "Today" is FACT from the QA report and the V2 comparison. Items marked
**NOT VERIFIED** have never been checked, and this plan does not claim they pass.

| Area | Target | Today | How to verify (PROPOSAL) |
| --- | --- | --- | --- |
| Widths | 320, 375, 768, 1024, 1440 px; no horizontal page overflow; scenes may scroll inside their panel | V1: 17 routes × personas × languages at 320 px, no overflow. V2: 4 screens × 4 widths × EN/AR, no overflow | Keep both suites. Add 768 and 1024 to V1 `flow.spec.ts` |
| Keyboard | Skip link first; every control reachable; arrow keys inside maps, tabs and the stage strip; visible focus ring | V1 and V2 both tested (skip link, tabs, graph arrows). WebKit link Tab order is skipped by design | Add the stage strip and option columns to the same keyboard spec when they are built |
| Focus management | Drawer traps focus and returns it to the opener | V1 trap cycles focus itself (WebKit fix, QA §5) | Same test for any new drawer or overlay |
| 200% zoom | Content reflows with no loss at 1280 px × 200% (equivalent to 640 px) | **NOT VERIFIED.** QA report: "320 px layouts pass, which approximates 640 px at 200%" | Manual pass in Chromium at 200% on Home, Project, Investigation, Decision. Playwright `deviceScaleFactor` does not test browser zoom, so this stays manual |
| Touch | 44 × 44 px minimum for controls | V1 buttons, `.btn` links and breadcrumbs tested at 375 px. V2 every visible control at 375 px | Keep |
| Reduced motion | No running animation | V2 asserted; V1 has the CSS block | Add a V1 assertion like V2's |
| Contrast | Text at least 4.5:1 | Computed from tokens (V1 min 5.23:1, V2 min 4.9:1). Not measured on rendered pixels | One rendered-pixel check per token set before BACK-18 merges |
| EN/AR RTL | `dir="rtl"`, Latin digits, ids in `<bdi dir="ltr">`, topology not mirrored | Both suites check "no Latin run outside an isolate" | Keep. **NOT VERIFIED:** native-speaker review of Arabic copy (V2 comparison A3) |
| Screen readers | Landmarks, one h1, valid heading order, labelled scenes with a text twin | Headings checked by `flow.spec.ts`. NVDA, VoiceOver and TalkBack **NOT RUN** | One NVDA pass on the five-step chain before any owner sign-off on accessibility |
| Real browsers and devices | Chromium, WebKit, Firefox; one iOS and one Android device | Chromium and WebKit in CI (root suite plus `app/`). Firefox **NOT RUN**. BrowserStack **NOT RUN** (BACK-4, BACK-8) | `npm run test:browserstack` (small run, credentials from the environment only) |

---

## 7. Dependencies and gap list

Gaps point at existing tickets. **No new tickets are proposed.** Jira was not changed.

| Gap | Where it belongs | Depends on |
| --- | --- | --- |
| Token set that carries C2 forward (V1 gold or V2 cyan) is not chosen | BACK-18 (cannot start stage 1 without it) | Owner D-15.1 |
| Amber overload between hypothesis and attention | BACK-18 stage 1 (tokens) | Owner D-15.2 |
| Persona and language URL schemes differ between V1 and V2; the V2→V1 link drops context | BACK-18 if V2 becomes the base, otherwise none | D-15.1 |
| V1 does not persist the open evidence or timeline position (`?ev=`, `evt`) | Follow-up on the BACK-10 shell (Done). Raise in BACK-18 or a later approved slice | D-15.5 |
| `from=` return path exists only on Evidence | Same as above | D-15.5 |
| Investigation Room is about 3700 px, with evidence shown three times | Treatment 3.B; BACK-8 visual QA | D-15.3 |
| Portfolio repeats Home's attention list | Information ownership §2.3 | D-15.5 |
| Observatory, Replay and Flight Deck each exist twice (V1 demo screen and V2 lab screen) | BACK-17 designs from both and chooses route vs panel | D-15.4 |
| React apps can't show stale or down variants (fixed fixture states) | BACK-17 fixture requirements | D-15.4 |
| 200% zoom, screen reader, Firefox, real devices not verified | BACK-8 (S1 parity and a11y) | — |
| V2 checks (`npm run e2e:v2`) not in CI | BACK-18 open decision | Owner |
| Real redaction and permissions | G2: BACK-7 (Done, planning) then BACK-16 | ADR-03 |
| Reuse of Retail Tower ports | BACK-14 (running in parallel); not touched here | — |

---

## 8. Conflicts with the repo's hard rules

The hard rules in `CLAUDE.md`, checked against what exists and what this document proposes:

| Hard rule | Finding | Status |
| --- | --- | --- |
| English-first with working Arabic/RTL | V1 and V2 both work in Arabic and are tested for isolation. The V2 Arabic copy was written by the assistant and has no native review (`comparison.md` A3) | **Open risk**, not a violation |
| Unknown is never Healthy | Holds in V1 and V2 (tests assert it). The owner's V2 reference images show HEALTHY chips and percentages with no data contract. V2 deliberately did not reproduce them (`comparison.md` B). Any BACK-18 move "towards the reference" must keep that refusal | **Holds.** Flag for BACK-18 |
| Unknown is never Healthy (static prototype) | BACK-5 comment 17261 recorded that some INV-418 nodes in the static prototype show "Healthy" with no evidence, and that `S.src` is a single axis with no "not configured" state | **Recorded in BACK-5, not re-verified here.** The static prototype is out of scope for this ticket |
| Demo data never shown as live | Holds: demo marker and inert links. Risk: a "cinematic" treatment (glow, live-looking pulses, a playing replay) can look live in a cropped screenshot | Mitigated by §4.6 and §5 (marker in the scene header) |
| No customer data, secrets, backend or MCP connection | Nothing proposed adds any | Holds |
| No commit, push, PR or merge without explicit approval | BACK-15's own text says "No … commits/push/PR/merge". The PR for this document was authorized by the owner in chat and relayed by the parent session. That approval overrides the ticket text for this docs-only change. It is stated in the PR body | **Process conflict, resolved by owner approval** |
| Script order in `index.html` | Not touched | n/a |

---

## 9. Owner decision pack

Every item is **PROPOSAL** until the owner records a decision. Accepting this pack authorizes no implementation.
Each accepted concept still needs its own approved mock-only slice (BACK-15 acceptance 4).

| # | Decision | Options | Recommendation | Unblocks |
| --- | --- | --- | --- | --- |
| D-15.1 | Which token set carries C2 forward | (a) V1 gold-on-navy; (b) V2 cyan-on-teal; (c) defer | **No recommendation from this ticket.** It is the visual-direction call BACK-15 must not reopen. BACK-18 holds the assistant's earlier view (b) | BACK-18 |
| D-15.2 | Amber overlap between hypothesis and attention (§4.3) | (a) separate hue; (b) shared hue + mandatory dashed shape and word, tested; (c) accept | (b) | BACK-18 stage 1 |
| D-15.3 | The three treatments (§3) | Each: accept as target / revise / reject | 3.B accept (lowest risk, fixes the long room). 3.C accept. 3.A revise: it is the Project screen's map, not a new route | BACK-17, BACK-18 |
| D-15.4 | Candidate surfaces (§1) | Each: build mock now / keep for later / reject; and standalone route vs panel | Observatory: **build mock now**, as a route (it answers a question no approved screen answers). Replay: **panel** inside Investigation (3.B). Flight Deck: **keep for later** (no facts of its own before G3). Command Home: keep as the landing page, de-duplicated from Portfolio | BACK-17 |
| D-15.5 | Navigation lenses and context (§2) | Accept / revise: the lens grouping in the shell, the ownership table, one URL scheme, `?ev=` and extended `from=` | Accept | A later approved shell slice |
| D-15.6 | Accessibility verification before sign-off (§6) | Which NOT VERIFIED items must pass before the owner signs off a treatment | 200% zoom and one NVDA pass on the five-step chain; BrowserStack stays BACK-8 | BACK-8 |

Not asked here, because they are already open elsewhere: Hallmark caps waivers, horizon asset (image vs WebGL),
`e2e:v2` in CI (all BACK-18); identity provider and server-side redaction (BACK-7, BACK-16).

---

## 10. Sources read and what was not checked

Read on 2026-11-18:

- Jira: BACK-15, BACK-5 (with comments 17261–17285, including the Blueprint v4 acceptance), BACK-18, BACK-8, BACK-10
  to BACK-14, BACK-16, BACK-17.
- Confluence: KMC page 80052229 (master proposal).
- Repo at `ebb3585`:
  - `CLAUDE.md`, `README.md`, `app/README.md`
  - `app/src/nav/routes.ts`, `app/src/App.tsx`, `app/src/screens/Home.tsx`
  - `app/src/fixture/world.ts`, `app/src/fixture/inv-demo-7.ts`
  - `app/src/styles/tokens.css`, `components.css`, `app.css`
  - `app/src/design-lab/v2/` (`DESIGN.md`, `PRODUCT.md`, `navigation/route.ts`, `navigation/Shell.tsx`,
    `styles/base.css`)
  - `docs/qa/kawalys-frontend/REPORT.md`, `docs/design-lab/v2/comparison.md`

Not checked:

- The Blueprint v4 artifact itself (a private claude.ai page). Its content is taken from the BACK-5 comments.
- The owner's five reference images. Only the four V2 references in `docs/design-lab/v2/reference/` are in the repo.
- Product Definition v1 and Architecture v1, beyond what the tickets quote.
- No screen was rendered for this document. The screenshots linked are the ones already committed by PR #7 and PR #8.

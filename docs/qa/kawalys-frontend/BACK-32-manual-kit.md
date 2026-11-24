# BACK-32: manual accessibility and device kit for the B+C pilot

Status: OPEN. This is a kit for a human tester. No row has been run on a screen reader or a real device, and no result below is a pass. Every result cell starts as `NOT RUN`. Replace a cell with `PASS`, `FAIL`, `BLOCKED` or leave it `NOT RUN`, add a short note after it, and keep the evidence (recording, screenshot or note) next to the run. A check that cannot apply to a column (for example arrow keys on a phone) is `BLOCKED` with the reason. There is no N/A.

Scope: the Hybrid Mission Map (B+C pilot) as mounted in the host app at `#/map` (BACK-87), map and list views, Owner, Technical and Nontechnical personas, English and Arabic. Demo data only. Nothing on these pages is live telemetry, and a display persona is not authorization (no backend, X02 or X04 enforcement is claimed).

Build under test: branch `claude/charming-franklin-isieiu`, after BACK-30 (Technical-only evidence hidden from Owner and Nontechnical), BACK-33 (three scroll regions are Tab-reachable named regions) and BACK-34 (B+C link markers are HTML spans that keep their shape on phones; orb sizes shrink on canvases of 700 px and below).

## 1. V2 WebKit run (engine evidence, not a device)

Result: **V2 WebKit: BLOCKED (Playwright's WebKit download was refused by the sandbox network proxy with HTTP 403)**. No WebKit run took place, so there is no pass or fail count and nothing here may be read as WebKit passing.

Command run, once, from the repository root (5-minute timeout):

```bash
npx playwright install webkit
```

Output (the three download mirrors Playwright tries; first error line of each):

```text
Downloading WebKit 27.2 (playwright webkit v2388) from https://cdn.playwright.dev/builds/webkit/2388/webkit-ubuntu-24.04.zip
Error: Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'.
Downloading ... from https://cdn.playwright.dev/dbazure/download/playwright/builds/webkit/2388/webkit-ubuntu-24.04.zip
Error: Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "cdn.playwright.dev"'.
Downloading ... from https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/webkit/2388/webkit-ubuntu-24.04.zip
Error: Download failed: server returned code 403 body 'request blocked: no rule or allowlist entry allows host "playwright.download.prss.microsoft.com"'.
Failed to install browsers
Error: Failed to download WebKit 27.2 (playwright webkit v2388), caused by Error: Download failure, code=1
```

Not retried, and no other way of fetching the browser was attempted. Playwright 1.65.1 expects WebKit 27.2 (build 2388). Update, 24 Nov 2026: since BACK-93 the required CI runs the host suite (`app/e2e`, which includes `mission-map.spec.ts` and `a11y.spec.ts` for the map lens) on WebKit in three shards on every app change, so the B+C map now has automated WebKit evidence in CI. That is engine evidence only; it does not answer any manual row below.

To get this evidence on a machine that can reach the Playwright CDN (human step, not run here):

```bash
cd app
npx playwright install webkit
npx vite build --config vite.v2.config.ts
```

Create an uncommitted config next to the real one, for example `app/playwright.v2.webkit.local.config.ts`:

```ts
import { devices } from '@playwright/test';
import base from './playwright.v2.config';
export default { ...base, testIgnore: /bc-capture/, projects: [{ name: 'webkit', use: devices['Desktop Safari'] }] };
```

Then run `npx playwright test -c playwright.v2.webkit.local.config.ts` (workers stay 1 through the base config). Record the WebKit version (`npx playwright --version` and the browser build), pass, fail and skip counts, and every failing test name with its first error line. The capture spec is excluded because it skips anyway. A failure is a finding for a ticket, not something to fix in the kit. This is an engine check only; it says nothing about iOS Safari touch, the on-screen keyboard or VoiceOver.

## 2. Test run header

Fill one column per environment you actually tested. Leave a column as `NOT RUN` if it was not tested.

| Field | NVDA EN | NVDA AR | VoiceOver EN | VoiceOver AR | iPhone Safari | Android Chrome |
|---|---|---|---|---|---|---|
| OS and version | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Browser and version | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Assistive technology and version | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Device | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Tester | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| URL tested | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Viewport (CSS px) | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Date | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Language (UI / AT voice) | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| Physical device or emulator | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |

An emulator, simulator, desktop browser device mode or resized window does not count for the iPhone Safari and Android Chrome columns: those two columns need a physical device (a real BrowserStack device also counts as physical; record it). Write "physical" or "emulator" in the "Physical device or emulator" row, and if it is an emulator, record the result as `BLOCKED (emulator, not a device)`. The Language row records the UI language and the screen reader voice language (for example "UI AR / voice Arabic").

Suggested pairings: NVDA with Firefox or Chrome on Windows; VoiceOver with Safari on macOS; iPhone Safari with VoiceOver on; Android Chrome with TalkBack on (record TalkBack in the AT row). Run Arabic with the screen reader voice and the page in AR as described in each row.

## 3. How to run the app for testing

The B+C map is tested inside the host app (the V2 lab at `v2.html` is being retired under BACK-92). Serve it on this machine:

```bash
cd app
npx vite build
npx vite preview      # http://127.0.0.1:4178/
```

URL format (persona, language and the selected node are read from the URL, so each case can be opened directly):

```text
/?persona=owner|technical|nontechnical&lang=en|ar#/map/retail-tower/stock-sync
```

Map or list view: use the "Map | List" switch ("خريطة | قائمة") above the canvas. Inspector tabs: Overview, Evidence, Sources ("نظرة عامة", "الأدلة", "المصادر"). These two are not in the URL.

A phone or a second computer cannot open `127.0.0.1`. This repository has no hosted URL for the app, so the tester has to provide a reachable one (the machine's LAN address with `vite preview --host`, or a tunnel the tester controls) and write it in the URL row of the header. No URL has been published by this change. Keep the page on demo data only; do not point it at anything real.

## 4. Checks

All cells are `NOT RUN`. Arabic columns mean the page is in AR (`lang=ar`, RTL); English columns mean `lang=en`. The only result words are `PASS`, `FAIL`, `BLOCKED` (with the reason) and `NOT RUN`. A row that cannot apply to a column (for example arrow keys on a phone) is `BLOCKED` with the reason, not `NOT RUN` and not N/A, once the run is finished.

| ID | Case | Steps | Expected | NVDA EN | NVDA AR | VoiceOver EN | VoiceOver AR | iPhone Safari | Android Chrome |
|---|---|---|---|---|---|---|---|---|---|
| K1 | Landmarks | Open the list of landmarks (NVDA: D / Insert+F7; VoiceOver: rotor, Landmarks). Phone: swipe through headings and landmarks. | A banner (header), a navigation named "Main" ("الرئيسية" in AR), one main region, and the inspector as a complementary region named "Selected item" ("العنصر المحدد"). In list view the ledger, matrix and links tables are named regions. Exactly one h1 ("Mission Map", "خريطة المهام" in AR, followed by the pilot label). | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K2 | Skip link | Load the page, press Tab once, press Enter, press Tab again. | The first stop is "Skip to content" ("انتقل إلى المحتوى"), visibly shown on focus. Enter moves focus to the main region; the next Tab lands on the first control inside main, not back in the header. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K3 | Side navigation `aria-current` | Tab or arrow through the side navigation links (Command Home, Portfolio, Mission Map, Project Intelligence, Investigation Room, Decision Inbox, the three products, Agent activity, Source health). | Only Mission Map is announced as "current page". The others have no current state. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K4 | Ten node names: "title, kind, status" | Map view, Owner, EN then AR. Move through all ten node buttons and note each announcement. Expected (EN, Owner): Retail Tower OS, Product, Health unknown. Khepri, Product, Health unknown. stock-sync, Project, CI check failing. POS client, Project, Health unknown. Inventory service, Project, Health unknown. GitHub, Service, Healthy. Jira, Service, Health unknown. Sentry, Service, Stale. Port, Service, Unavailable. Seshat BI, Service, Health unknown. | Each name is exactly title, kind, status, in that order, once, with no icon or decoration read. Titles are read as Latin (English voice or a clean switch) in AR. Only GitHub is Healthy. Compare with the AR wording in BACK-31. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K5 | Arrows and Enter on the map | Tab into the map group (named "map canvas" in EN). Press the four arrow keys, then Enter on a node. | Arrows move focus between neighbouring nodes by position on screen (the canvas stays left-to-right in AR, so ArrowRight goes to the node on the right of the screen in both languages). Enter selects and updates the inspector. Focus never leaves the map by arrow key and never gets stuck. Desktop only; on phones record BLOCKED with the reason. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K6 | `aria-live` inspector heading | Select a different node with Enter (desktop) or a tap (phone) and listen without moving focus. | The new node title is announced once, politely (not interrupting), by the inspector heading. No double announcement, no announcement when the selection did not change. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K7 | Ledger table reading (list view) | List view. Reach the "Systems ledger" region by Tab. Use the screen reader table commands (NVDA: Ctrl+Alt+arrows; VoiceOver: table navigation). Phone: swipe through a row. | The region is announced with its name, then table, ten rows, with column headings System, Status, Evidence read before each cell. A row reads system, kind, status, evidence count in a sensible order. Arrow keys scroll the region when it overflows (320 px). | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K8 | Matrix table reading (list view) | Same as K7 for the "Source readings" region, at desktop and at 375 px (cards). | Six source rows. Each cell is announced with its column (Connectivity, Freshness, Health) and its own value; the three readings are never merged into one word. Stale and unavailable are said as such; unknown is said as Unknown, never Healthy. Column counters read "N of 6 ...". | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K9 | Links table reading (list view) | Same as K7 for the "Links between systems" region. | Ten link rows for Owner and Nontechnical, eleven for Technical (the Inventory to Sentry link is Technical-only). Each row says from, to, how we know (observed, correlated, hypothesis, unknown) and the basis sentence. For Owner and Nontechnical no row mentions restricted evidence (see K17). | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K10 | The three scroll regions are Tab-reachable and named (BACK-33) | List view at 320 px and at 200% text size (browser or OS text zoom). Press Tab to the ledger, matrix and links regions, then press an arrow key in each. | Each region takes focus with one Tab, is announced as a region with its name (ledger, matrix, links), shows a visible focus ring, and scrolls with the arrow keys when it overflows (ArrowLeft in AR, ArrowRight in EN scrolls toward the hidden end). Report any region that cannot be scrolled by keyboard. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K11 | Age bars and pips | Visit the Sources tab, the readings panel and the matrix. Listen to each age bar and each row of pips. | Each age bar is one image-like item with a label such as "540 of 15 min, 36× target" ("never read" for a source that was never read). Each pip row is one item that lists every source and its state, for example "GitHub: Online; Jira: Online; ...". The six letters (G, J, S, D, C, P) are not read one by one. "×" and "min" ("د" in AR) are understandable aloud. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K12 | RTL tab mirroring | Switch to AR. Tab through the header, side navigation, filters and the inspector tabs from the first stop. | Tab order follows the visual right-to-left order of the chrome: the side navigation and header controls start from the right-hand side. The map canvas keeps its own left-to-right layout (K5). Focus order matches what you see, with no jumps across the screen. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K13 | 44 px targets | On a phone (375 px wide or less) tap each control: filters, Map/List switch, inspector tabs, node buttons, ledger rows, language and persona switches, side navigation links. Use a ruler overlay or the platform accessibility inspector. | Every tap target is at least 44 by 44 CSS px at 640 px wide and below, and every tap hits the intended control the first time. Note any mis-tap, especially on the map near the selected node. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K14 | Reduced motion (OS setting) | Turn on Reduce Motion (iOS: Settings, Accessibility, Motion; Android: Remove animations; Windows: Show animations off; macOS: Reduce motion). Reload the page and select nodes. | The first-load orbit drawing does not play, the selection trace does not animate, no pulsing or looping animation runs, and nothing is lost: all links, markers and states are still visible. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K15 | Phone map orbs at 641 to 730 px (BACK-34) | Use a tablet, a small landscape phone or a resized window at 641, 700, 730 and 768 px. Map view, EN. Look at the orbs and the orbit spacing, then compare with 375 px. | Orbs are 44 px (64 px hub) at a canvas width of 700 px and below. Judge whether the step from 700 to 701 px (full-size orbs) looks acceptable between 641 and 730 px, with no orb covering a neighbouring orb and no clipped orb or label. Record the first width at which anything looks wrong. A resized desktop window is layout evidence only, not device evidence; only a physical tablet or phone fills the iPhone Safari and Android Chrome cells. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K16 | Selected-card overlap at 320 and 375 px (BACK-34, SPEC section 10) | Phone map at 320 and 375 px. Select each node in turn, starting with stock-sync, then Inventory service, POS client, Khepri. EN and AR. | Decide whether the selected node card is readable and whether it covers a neighbour title in a way that blocks reading or tapping. Expected today: stock-sync card can sit over POS client and Inventory service titles. Record which pairs overlap and whether the covered node can still be selected. This is a pass, fail or accept decision for the owner. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |
| K17 | BACK-30 non-disclosure on Inventory (Owner and Nontechnical) | Persona Owner, then Nontechnical, EN and AR. Select Inventory service. Open Overview, Evidence and Sources tabs and the Links section; in list view read the Inventory row and the links table. Also step through the map node name for Inventory (K4). | The reader hears no "E-5", no "Restricted", no "Restricted to Technical" ("مقصورة على الفريق التقني"), no sentence about restricted evidence, and no stale-derived wording for Inventory. Inventory reads Health unknown. Evidence tab says "No evidence has been read for this item." Sentry stays Stale because of its own source reading. The Technical persona is the control: there Inventory reads Stale and E-5 is present. | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` | `NOT RUN` |

## 5. Optional: real-browser smoke on BrowserStack (SDK)

BrowserStack MCP `devicecontrol` cannot enable BrowserStack Local, so it cannot reach `127.0.0.1`. For real-browser runs use the SDK, with credentials in the environment only:

```bash
export BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=…
npm run test:browserstack
```

Platforms are in `browserstack.yml`; the spec is in `tests-bstack/`. The SDK starts its own Local tunnel, so stop any manual tunnel first. Never put credentials in `browserstack.yml`. Keep runs small (the account allows 5 parallel sessions).

Limit of this command: `tests-bstack/smoke.spec.js` and `playwright.bstack.config.js` serve the root static prototype on port 8765 and open its nine screens. They do not open the host app or the B+C map, so a green BrowserStack run does not answer any row above. Covering V2 B+C there would need a new spec and a V2 server in that config, which is a separate change.

## 6. Findings log

Add one line per finding (case ID, environment, what happened, evidence link, severity). Decisions needed from the owner: K15 (641 to 730 px orbs) and K16 (selected-card overlap at 320 and 375 px).

| Case | Environment | Finding | Evidence | Severity |
|---|---|---|---|---|
| | | | | |

## 7. Sign-off

BACK-32 stays open until this block is filled.

| Field | Value |
|---|---|
| Tester name | |
| Date | |
| Rows run / rows total | |
| Rows failed | |
| V2 WebKit run (done / blocked) | BLOCKED (see section 1) |
| Decision on K15 and K16 | |
| Overall decision | |

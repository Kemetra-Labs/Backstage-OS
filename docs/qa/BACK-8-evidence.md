# BACK-8 — S1 visual parity & accessibility evidence (DRAFT for owner review)

Subject: React `app/` Investigation Room (BACK-6) at Backstage-OS `main` `288d6a8`, run locally on 2026-11-17.
Status: **evidence record only.** No source, test or workflow file was changed. This is not the owner's visual sign-off, and the ticket is not closed.
Skills used: `design:accessibility-review` (WCAG 2.1 AA checklist, which supplies the criterion column) and `design:design-critique` (§4).
Rules checked against: BACK-8 scope, BACK-6 acceptance, and Blueprint v4 (BACK-5 artifact `GUpo2XW4Zz5GUGtmovVDVx`): §5 personas, §7 RTL test, §3 control vocabulary.

## 1. How the checks ran, and their limits

- **Browser:** the Claude desktop in-app browser pane (Chromium-based; exact version not recorded), Windows 11, Vite dev server on `127.0.0.1:4178`. Viewports were emulated with `resize_window`; nothing ran on a real device.
- **Painting limit:** the pane intermittently failed to paint (several screenshots and key presses timed out and were retried) and CSS animations did not advance while it was throttled. Geometry that depends on the drawer's slide-in was therefore measured with the animation disabled (row 12).
- **Programmatic checks** ran in-page on computed styles and the DOM for **EN and AR × Owner / Technical / Nontechnical** at **320, 375, 768 and 1440 px** (24 combinations), plus 640 px for the 200 % zoom equivalent. Keyboard checks used real key presses.
- **Contrast method:** computed styles, ancestor opacity multiplied up the chain, the real page background (`body` = `rgb(6,11,19)`, asserted from computed style). It cannot see gradients or images: 11–13 text nodes per state sit on the stage's radial gradient and were measured against the solid base colour only. 1.4.11 (non-text contrast) was not measured.
- **Unit tests:** `vitest run --coverage` → 4 files, **115 passed**, 100 % statements/lines/functions, 98.77 % branches (`segments.ts` 18–20). Same as the BACK-7 review at this commit. `npm run check` also runs `tsc`, which fails here with `Cannot find module '@playwright/test'` because `app/playwright.config.ts` imports it from the repo root and root dependencies are not installed in this worktree. That is an environment gap, not a finding. The Playwright e2e suite was **not run**.
- **Saved screenshots:** five, in [`docs/qa/BACK-8/`](BACK-8/). Others were viewed in the session and not saved.

## 2. Evidence matrix

Result values: **Pass** = executed and met the criterion within the stated scope; **Partly**; **Blocked** = attempted, could not run; **Not verified** = not run.

| # | Check (BACK-8 scope item) | WCAG | Result | Scope actually covered / evidence |
| --- | --- | --- | --- | --- |
| 1 | Parity with the five approved C2 reference images (item 1) | — | **BLOCKED** | See §3. The images are not in the repo, in Jira attachments, in the Blueprint, or in the owner's local Downloads, Desktop and Pictures. Nothing compared |
| 2 | Hierarchy, spacing, tokens, layout, truth-state presentation (item 1) | — | Reviewed, **no sign-off** | §4. Judged from screenshots and the code's own tokens, not against the owner's references |
| 3 | Persona variants: same facts, redaction, no misleading controls (item 2) | 1.3.1 | **Pass** (client-side only) | Truth class of every ledger item (`data-fact` / `data-truth`) is the same sequence in all six persona × language states: observed → correlated → hypothesis → unknown → proposed. Nontechnical text hides `RT-DEMO-112`, the release name and the run id. No "healthy" appears in any state |
| 4 | Blueprint §5 plain-word labels for Nontechnical (item 2) | 3.1.5 (n/a) | **Pass** | EN Nontechnical chips read exactly "Confirmed · Linked · Likely reason · Not known · Suggested step". The Arabic equivalents differ from the Arabic Owner/Technical set (مؤكد · مرتبط · سبب مرجّح · غير معروف · خطوة مقترحة). This resolves my earlier open question: the wording is specified by §5 |
| 5 | No forbidden control verb (Approve, Reject, Defer, Go, No-go, Release, Retry, Run) (BACK-6 AC) | — | **Pass** | 22 controls per state × 6 states: button text, link text, `aria-label` and `title`, matched against the English verbs plus Arabic equivalents (اعتماد، موافقة، رفض، تأجيل، إصدار، إطلاق، إعادة المحاولة، تشغيل، تنفيذ). 0 hits. The only action control is "Copy proposal text" |
| 6 | Customer impact reads "Unknown, not evidenced" (BACK-6 AC) | — | **Pass** (EN) | All three EN personas. Arabic wording was not read |
| 7 | Confidence number only with a complete basis, Technical only | — | **Pass** (EN) | Technical: "Confidence: Medium (no calibrated score)". No numeric score anywhere (the fixture has no complete basis) |
| 8 | No horizontal overflow, EN + AR, 4 widths (item 3) | 1.4.10 | **Pass** | `scrollWidth − clientWidth = 0` in all 24 combinations |
| 9 | RTL: `dir`, isolates, Latin digits, map not mirrored (item 3, Blueprint §7 test) | 1.3.2 | **Pass** | AR at 375 px: `dir=rtl`, `lang=ar`, 47 `bdi dir=ltr` isolates, 0 Latin tokens outside an isolate in Arabic text, 0 Arabic-Indic digits. Map order POS client → stock-sync → Inventory service is left-to-right in both languages (1440 px screenshots) |
| 10 | Touch target ≥ 44 px (item 3) | 2.5.5 | **Pass** (emulated) | All visible buttons and links ≥ 44 × 44 px in all 24 combinations; the drawer Close button is 44 px. No touch device |
| 11 | Text contrast (item 4) | 1.4.3 | **Pass** (computed, limits in §1) | 24 combinations, 0 failures. Lowest 5.71 : 1 (11 px "Correlated" / "Linked" label). No text has ancestor opacity < 1 |
| 12 | Non-text contrast (chips, dashed map links, borders) | 1.4.11 | **Not verified** | Only the selected-pill focus ring was reasoned about (dark outline inside the amber fill) |
| 13 | Landmarks, headings, names, roles (item 4) | 1.3.1, 4.1.2 | **Pass** | One `h1`, no skipped level, `header`/`nav`/`main`, named button groups, `aria-pressed` on persona and language, 0 unnamed buttons, 0 unlabelled SVG, polite live region, truth labels are text (not colour only) |
| 14 | Skip link | 2.4.1 | **Pass** | Real Tab from load: first stop is the skip link. Enter → URL `#main`, focus on `<main tabindex="-1">` |
| 15 | Keyboard order and focus visible, **EN**, 1440 px | 2.1.1, 2.4.3, 2.4.7 | **Pass** | Real Tab presses; every stop has a 2 px amber outline, `:focus-visible` true. Order is DOM order |
| 16 | Keyboard order and focus visible, **AR**, 1440 px | 2.1.1, 2.4.3, 2.4.7 | **Pass** | Skip link, persona (3), language (2), evidence E-1…E-7, Copy; all with a visible 2 px outline |
| 17 | Evidence drawer keyboard behaviour, **EN, 1440 px** | 2.1.2, 2.4.3 | **Pass** | Enter opens a `role=dialog aria-modal=true`; focus lands on Close; Tab stays inside; Esc closes; focus returns to the trigger |
| 18 | Evidence drawer keyboard behaviour, **EN, 375 px** | 2.1.2, 1.4.10 | **Pass** | Same as 17, plus Shift+Tab stays on Close (one focusable). With the slide-in animation disabled the dialog spans x = 0–375 px, nothing is off-screen. **Note:** measured *during* the animation the panel read as x = 24–399 px because the pane was not painting frames (keyframes end at `transform: none`); this is a measurement artifact, not a layout defect |
| 19 | Drawer keyboard behaviour in **AR** | 2.1.2 | **Not verified** | Not run (only the Tab order in AR was) |
| 20 | Reduced motion | 2.3.3 (AAA) | **Partly** | `app.css` has a `prefers-reduced-motion: reduce` block removing all animation and transition. The media query was **not emulated** and the animations could not be observed running |
| 21 | 200 % zoom / text resize | 1.4.4, 1.4.10 | **Partly** | 640 CSS px (= 200 % of 1280): no overflow. Root `font-size` 200 % at 640 px, EN and AR: no overflow, no clipped box. This scales rem-based text only; real browser zoom was not run |
| 22 | Screen readers (NVDA / VoiceOver / TalkBack) (item 4) | 4.1.2 | **NOT VERIFIED** | No assistive technology used. Rows 13–14 are necessary, not sufficient |
| 23 | BrowserStack / real devices (item 6) | — | **NOT VERIFIED** | 0 remote device results (BACK-6 comments 17293, 17295). Kept visible on purpose |
| 24 | Firefox, real Safari, Linux fonts | — | **NOT VERIFIED** | The BACK-7 review already flags Linux font width until `app/` runs in CI |

### Source references

| What | Where |
| --- | --- |
| Reduced-motion block | `app/src/styles/app.css:177` |
| Global focus ring; segmented-control ring (inside, `outline-offset: -4px`) and its selected-state colour | `app/src/styles/app.css:19`, `:52`, `:53` |
| Drawer: focus to Close, Esc, Tab / Shift+Tab trap, `role="dialog" aria-modal="true"` | `app/src/components/EvidenceDrawer.tsx:36`, `:38`, `:45-49`, `:66-67` |
| Skip link | `app/src/App.tsx:35` |
| LTR isolate helper (`bdi dir="ltr"`) | `app/src/components/Text.tsx:9` |
| Truth data attributes used for the fact-sequence check | `app/src/components/Ledger.tsx:48`, `app/src/components/TruthChip.tsx:14` |
| Drawer slide-in keyframes (`drawer-in`, 220 ms, from `translateX(24px)`) | `app/src/styles/app.css` |

## 3. Reference images: what was searched

Row 1 stays **BLOCKED**. Searched, 2026-11-17:

1. The repo: `git ls-files` for png/jpg/webp/svg at `288d6a8` → none; `docs/qa/` holds only `BACK-4-report.md`.
2. Blueprint v4 (BACK-5 artifact): an HTML spec with CSS specimens and wireframes; no embedded image. Its own verification table says the five images were "not accessible, so no comparison was made".
3. Jira `attachment` field on BACK-2, BACK-4, BACK-5, BACK-6: empty on all four.
4. BACK-2 comments (all 8 read): comment 17206 says the prototype was "built from the five reference images", which appear to have been supplied in chat; comment 17271 says they "were not accessible"; comment 17286 records that "the owner's own comparison against the five reference images" is **not recorded**. No link to them.
5. The owner's local Downloads, Desktop and Pictures folders (name search for kawalys / blueprint / investigation / c2).
6. Not read: BACK-5 comment 17285.

To unblock: the owner checks the five images into `docs/qa/reference/` (or attaches them to BACK-8), after which a side-by-side review can be recorded with date and verdict. That review would still not be the owner's sign-off.

## 4. Design critique (observations, not defects)

- **First impression.** The "Demo data · not live" marker, the page title and the source chips are read first, correct for a screen whose job is to show what is *not* known. Stale Sentry, not-configured Datadog and unavailable Port differ by wording and colour, not colour alone.
- **Hierarchy.** Title → one-line status → case chips → "What we know" ledger beside the "Affected path" map, as Blueprint §3 specifies. The truth chips are small (11 px) but uppercase, outlined and ≥ 5.71 : 1.
- **Consistency.** Chips, buttons and focus rings share one amber accent and a 44 px rhythm across personas and languages. The Arabic Owner/Technical chip set and the Nontechnical set are separate vocabularies by design (§5).
- **Works well:** health shows "unknown" rather than green when evidence is stale or missing; the Arabic layout flips the page but not the map; the drawer is a proper modal dialog with a working trap; the selected-pill focus ring is drawn inside the fill so it stays visible on the dark page.
- **Watch item:** 11 px chip text at ~5.7 : 1 passes AA but is the smallest text on the screen; check it against the reference images once they exist.

## 5. Findings for separate approval

**No failing defect was found by the executed checks.** Nothing was patched.

Gaps that keep the ticket from closing, all needing owner input or approval:

1. Reference images missing → row 1 blocked (§3).
2. Screen reader, real device, BrowserStack, Firefox and Safari evidence does not exist (rows 22–24).
3. Not run: real `prefers-reduced-motion` emulation, non-text contrast (1.4.11), real browser zoom, the drawer in Arabic, the Arabic customer-impact wording, the Playwright e2e suite and `tsc`.

## 6. Reproduction

```bash
cd app && npm ci --ignore-scripts && npm run dev      # http://127.0.0.1:4178
./node_modules/.bin/vitest run --coverage             # 115 tests
```

In the page: the Owner / Technical / Nontechnical and EN / عربي buttons switch state. The in-page audit scripts were not saved to the repo.

---

## 7. Re-check at `dabf523` (2026-11-19, owner-approved QA slice)

Sections 1–6 above were measured at `288d6a8`, before the shared shell (`AppShell`, `TopBar`, `Sidebar`, `DemoSearch`) and four later merges (#7, #8, #14, #17) changed `app/src` by +1,071 / −53 lines. They are **historical** for the current app. This section is the current record for the S1 room `#/investigation/INV-DEMO-7`.
Status: **evidence record only.** No source, test, config or workflow file was changed; nothing was installed. Not the owner's visual sign-off.

### 7.1 How the checks ran, and their limits

- **Unit tests:** `cd app && npx vitest run --coverage` → 25 files, **380 passed**, 99.95 % lines, 97.08 % branches. `tsc` and the Playwright e2e suite were **not run** (they need root `node_modules`, which is absent and was not installed).
- **Server:** `npx vite --host 127.0.0.1 --port 4178` from `app/`.
- **Browser:** headless **Microsoft Edge 157.0.4341.60** (Chromium) on Windows 11, driven over the DevTools protocol by a one-off script kept outside the repo. The cached Playwright Chromium (`chromium-1255`) failed to start ("side-by-side configuration is incorrect"), so the OS-installed Edge was used with a throwaway profile. Not a real device, not Safari, not Firefox.
- **Real key events:** keyboard checks used `Input.dispatchKeyEvent` (Tab, Shift+Tab, Enter, Escape), not `element.focus()` loops.
- **Matrix:** EN and AR × Owner / Technical / Nontechnical × 320 / 375 / 768 / 1440 px = 24 states, `deviceScaleFactor` 1, Google Fonts blocked (V1 fonts are not self-hosted; rendering depends on locally installed fonts).
- **Reduced motion:** emulated with `Emulation.setEmulatedMedia` (`prefers-reduced-motion: reduce`).
- **200 % zoom:** emulated as the layout a 200 % browser zoom produces: 640 and 720 CSS px wide at device scale 2 (= 1280 / 1440 px windows at 200 %). Not the browser's own zoom control.
- **Contrast:** computed colours, ancestor opacity multiplied, composited over the nearest opaque background. Up to 3 text nodes per state sit on a gradient and were measured against its base colour only.
- **Visual spot-check:** the Claude desktop browser pane (skip link at 375 px AR; project-context navigation; 640 px source strip).
- **Screenshots:** [`docs/qa/BACK-8/2026-11-19/`](BACK-8/2026-11-19/), full-page JPEG from the same Edge run.
- **Console:** 0 errors and 0 uncaught exceptions across every load.

### 7.2 Results

Result values as in §2. "Re-check" rows repeat a §2 check on the new shell.

| # | Check | WCAG | Result | Scope actually covered / evidence |
| --- | --- | --- | --- | --- |
| 7.1 | Parity with the five C2 reference images | — | **BLOCKED** | Unchanged from §3. `docs/design-lab/v2/reference/*.webp` are four V2-lab references, **not** the C2 set, and were not used |
| 7.2 | No horizontal overflow (re-check) | 1.4.10 | **Pass** | `scrollWidth − clientWidth = 0` in all 24 states |
| 7.3 | One `h1`, no skipped heading level, landmarks (re-check) | 1.3.1 | **Pass** | 24/24: one `h1`, 0 skips; `header` 1, `nav` 2, `main` 1, `footer` 1; 2 `aria-live` regions. The search field is named by its `<label>` ("Search demo data") |
| 7.4 | Touch target ≥ 44 px (re-check) | 2.5.5 (AAA); BACK-8 item 3 | **Fail (finding F-1)** | All controls ≥ 44 × 44 **except the new `Kawalys` brand link, 66 × 27 px at every width** incl. 320 and 375. At 1440 px two breadcrumb links are 24 px high (desktop; meets 2.5.8 AA 24 px) |
| 7.5 | Text contrast (re-check) | 1.4.3 | **Pass** (computed) | 0 failures in 24 states; lowest **5.71 : 1** |
| 7.6 | Non-text contrast | 1.4.11 | **Partly (finding F-2)** | Dashed stage-map links: `2px dashed rgba(154,167,184,.4)` ≈ **2.18 : 1** on the page. They carry meaning ("Dashed lines are not verified") but are `aria-hidden`, and node text says the same thing, so whether 1.4.11 applies is a design judgement. Quiet buttons have a 1.77 : 1 border, but their text identifies them (not required by 1.4.11). Pressed segment fill and the gold focus ring are high contrast |
| 7.7 | RTL: `dir`, isolates, digits (re-check) | 1.3.2 | **Pass** | AR 12/12 states: `dir=rtl`, 0 Latin runs outside an LTR isolate, 0 Arabic-Indic digits anywhere |
| 7.8 | Arabic customer-impact wording (was not run) | — | **Pass (read)** | Owner/Technical: "أثر العملاء: مجهول، لا دليل عليه. فشل فحص CI على main لا يدل على أثر في التشغيل أو على العملاء." Nontechnical: "…لا شيء يدل على تأثر العملاء أو المتاجر." No "healthy" / "سليم" in any of the 24 states. Not reviewed by a native speaker |
| 7.9 | Keyboard order and visible focus, EN + AR, 1440 + 375 (re-check incl. new shell) | 2.1.1, 2.4.3, 2.4.7 | **Pass** | Real Tab sweeps: 39 stops at 1440, 31 at 375. Every stop `:focus-visible`, has an outline, and is on screen. Fresh load: first stop is the skip link, which becomes visible at 375 px AR (pane spot-check). Order: skip → brand → search → persona (3) → language (2) → sidebar (1440 only) / menu (375) → source strip → breadcrumbs → evidence → … |
| 7.10 | Evidence drawer, EN, 1440 + 375 (re-check) | 2.1.2, 2.4.3 | **Pass** | Enter opens `role=dialog aria-modal=true`; `#root` gets `inert`; focus on Close; 6 Tab + 3 Shift+Tab stay inside, all focus-visible; Esc closes, `inert` removed, focus returns to "Open evidence E-1". Panel fully on screen (1440: x 920–1440; 375: x 0–375) |
| 7.11 | Evidence drawer, **AR**, 1440 + 375 (was not run) | 2.1.2, 2.4.3 | **Pass** | Same as 7.10 with `dir=rtl`, `drawer-in-rtl` animation, panel on the left (x 0–520 at 1440, 0–375 at 375); focus returns to "عرض الدليل E-1" |
| 7.12 | Reduced motion (was Partly) | 2.3.3 (AAA) | **Pass** (emulated) | Drawer open without emulation: 1 running animation (`drawer-in` / `drawer-in-rtl`, 0.22 s). With `prefers-reduced-motion: reduce`: **0 running animations**, `animation-name: none`, EN and AR |
| 7.13 | 200 % zoom / reflow (was Partly) | 1.4.4, 1.4.10 | **Partly (finding F-3)** | 640 and 720 CSS px at scale 2, EN + AR: page `overflowX = 0`, no clipped text. But the header **source strip** (`overflow-x: auto`) is 928 px wide in a 608 px box, so Datadog / Port status (the not-set-up / unavailable sources) is off-screen until scrolled. It is a Tab stop in Chromium (focusable scroller); not checked in Safari |
| 7.14 | Restricted evidence display (Owner, Nontechnical) | — | **Observed; owner decision** | E-5 row shows "Restricted to Technical" twice plus the button text **"Open evidence E-5"**, and `data-evidence="E-5"`. Technical: no restricted row. Whether the id and count may be shown is the open M05-D05-B decision (preflight §D); not judged here |
| 7.15 | Project context across navigation | — | **Observed** | Room breadcrumb links to `#/project/RT/stock-sync` (component kept); Explorer back link `#/investigation/INV-DEMO-7`; `?persona=&lang=` kept on every hash link. The Sidebar's "Project Intelligence" and "Investigation Room" are fixed to `RT` / `INV-DEMO-7`. Portfolio product filter (Khepri) resets to "All products" after Sources → Back (local state, not in the URL) |
| 7.16 | Screen readers | 4.1.2 | **NOT VERIFIED** | No assistive technology used |
| 7.17 | BrowserStack / real devices, Safari, Firefox | — | **NOT VERIFIED** | `browserstack.yml` targets the static prototype, not `app/` |
| 7.18 | Playwright e2e, `tsc` | — | **NOT RUN** | Needs root `npm ci` (not approved in this slice) |

### 7.3 Findings for separate approval (nothing patched)

- **F-1 (BACK-8 item 3):** the brand link `a.brand` ("Kawalys", `app/src/shell/TopBar.tsx`) is 66 × 27 px at 320 and 375 px, under the 44 px mobile minimum. Introduced with the shared shell after `288d6a8`.
- **F-2 (1.4.11, judgement):** dashed stage-map links at ≈ 2.18 : 1 (`rgba(154,167,184,.4)`). Decide whether the line style must be perceivable on its own or whether the node text is the accessible equivalent.
- **F-3 (1.4.10 / "Unknown is never Healthy" visibility, judgement):** at 200 % zoom and narrow widths the header source strip scrolls sideways, and the unknown / not-set-up sources sit past the visible edge.
- **Observations, not defects:** restricted id/count display (7.14) awaits the M05-D05-B decision; the Portfolio filter and the fixed sidebar targets (7.15) are local-state design choices for the owner to confirm.

### 7.4 Screenshots (`docs/qa/BACK-8/2026-11-19/`)

`room-en-owner-1440`, `room-ar-owner-375`, `room-ar-technical-320`, `room-en-nontechnical-375`, `drawer-en-owner-1440`, `drawer-ar-owner-375`, `zoom200-en-owner-640css`, `zoom200-ar-owner-640css` (JPEG, full page, Edge 157 headless). Full-page capture draws the fixed drawer at the top of the image.

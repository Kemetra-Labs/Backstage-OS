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

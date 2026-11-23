# BACK-86 (S4): semantic role tokens and CSS isolation for the B+C map

Synthetic only. No visual redesign, no rebrand, no new package, font file, route or screen. Nothing mounts B+C yet (BACK-87). Persona is a display switch, not authorization.

Base: BACK-85 (draft PR #60). Stacked on `feat/back-85-typed-id-host-bridge`.

## The finding that made this slice necessary

The B+C stylesheets were safe to embed except three things, all in the lab's global layer:

1. `base.css` styled `*`, `html`, `body`, headings, lists, buttons, links and `:focus-visible` for the whole page, including `html[lang="ar"] body { font-family }`. Imported into the host, that restyles every V1 screen (V1 has its own gold focus ring, its own margins and fonts).
2. `base.css` also carried an unscoped `*` reduced-motion rule inside `@media (prefers-reduced-motion)`.
3. `fonts.css` declares the self-hosted faces as `"Manrope"` and `"Cairo"`. V1's font stack lists `"Cairo"`, so declaring that family in the host would silently switch the Arabic text of every V1 screen to the lab's file.

Everything else (`map`, `bc`, `observatory`, `replay`, `deck` and the remaining `base.css`) is already `.kv2-*` scoped, tokens are already `--kv2-*`, and every keyframe is `kv2-` prefixed.

## What changed

| File | Change |
|---|---|
| `design-lab/v2/styles/reset.css` (new) | The 14 global rules (13 plus the reduced-motion `*` rule) moved out of `base.css`, declarations unchanged. Only the lab imports it. |
| `design-lab/v2/styles/base.css` | Those rules removed; everything else untouched. |
| `design-lab/v2/main.tsx` | Imports `reset.css` before `base.css`. |
| `design-lab/v2/styles/scope.css` (new) | The same declarations under `.kv2-scope`, wrapped in `:where()` so they keep the lab's zero specificity and every `.kv2-*` class still wins. Not imported yet: the host imports it in BACK-87. |
| `design-lab/v2/styles/embed-fonts.css` (new) | The same two woff2 files under the family names `"Kawalys BC Manrope"` / `"Kawalys BC Cairo"`, used only by `.kv2-scope` through `--kv2-f-ui` / `--kv2-f-ar`. No new file, no `local()`, no remote URL. Not imported yet. |
| `styles/semantic.css` (new) | 23 semantic roles (`--sem-surface`, `-ink`, `-focus`, `-accent`, four truth labels plus approved and unknown, four health states, radii, ease). `:root` points each at the existing V1 token; `.kv2-scope` points each at the existing B+C token. No role has a value of its own. Not imported yet: the V1 bundle is guarded to contain no `.kv2-` text (`e2e-v2/structure.spec.ts`, isolation), and BACK-87's mount is what deliberately ends that separation, so BACK-87 imports it (a first attempt to import it here failed that guard; the guard was left as is). |
| `styles/isolation.test.ts` (new) | 23 static tests over the CSS text. |
| `e2e/css-isolation.spec.ts` (new) | Browser proof (Chromium and WebKit, below). |
| `design-lab/v2/scope.test.ts` | Updated for the move: the overflow/reduced-motion guarantee is asserted on `reset.css` plus `base.css`; `reset.css` joins the stylesheet list; the "everything is `.kv2-` scoped" check excludes the two files that are global by design. No assertion was weakened. |

## Identity preserved (no unification)

V1 keeps gold focus, its green/amber/coral health colours and its `--obs/--cor/--hyp/--pro` truth colours; B+C keeps cyan focus and its teal-navy palette. A role is a name, not a new value. Unknown has its own colour and is never the Healthy one in either surface (tested). Both sources are dark only, so there is no light theme to alias; this is recorded rather than invented.

## Proof

- **Lab unchanged:** the lab's flattened rule set before (`base.css` at the base commit) and after (`reset.css` plus `base.css`) is identical: 182 rules, same selectors, same declarations, same media wrapping.
- **Static (23 tests):** every selector of the nine embeddable sheets carries a `.kv2-` class or is a custom-property-only rule; every keyframe is `kv2-`; font faces only under `Kawalys BC *`, only the two shipped files, no `local()` or remote URL; V1's `Cairo` stack is untouched; `reset.css` is imported only by the lab entry; `scope.css` re-states every `reset.css` declaration except the page background; `scope.css` rules have zero specificity at the boundary; the semantic file has only `:root` and `.kv2-scope`, only `--sem-*` properties, each a `var()` of a token that exists in its own source, the same role set on both surfaces, no V1 role references `kv2`.
- **Browser (42 tests):** for 9 V1 routes, in English and Arabic, in Chromium and WebKit: every element's computed style (34 properties) and box, plus the keyboard focus ring, measured before and after injecting all nine embeddable sheets. Identical. Controls: an unscoped `button` rule is detected; the lab's own `reset.css` injected into V1 is detected (the leak the split removes); inside `.kv2-scope` the sheets apply (`--sem-focus` resolves cyan, font `Kawalys BC Manrope`, headings reset), outside it V1 resolves gold.
- **Not covered, stated:** the fonts' actual glyph rendering is checked by name isolation, not by pixels (the injected sheet cannot load files); pixel comparison of the future mounted map belongs to BACK-87. 320/375/768/1440 widths, 200% zoom and reduced motion of the mounted map are BACK-87 and BACK-91 work: there is no mounted component to measure here.

## Evidence

| Check | Result |
|---|---|
| `npm run check` | PASS: 620 tests in 37 files (was 597 on BACK-85), coverage 99.83% |
| `npm run build`, `npm run build:v2` | PASS, PASS |
| `npm run e2e` (Chromium and WebKit) | PASS in two steps, both recorded: the full run gave 1,488 passed, 66 skipped, 2 failed, and the 2 failures were my own new control (it relied on V1 bundling `semantic.css`, which I had just taken out, see above); after fixing the spec, `e2e/css-isolation.spec.ts` alone gives 42 passed. 1,448 existing plus 42 new = 1,490, all green; the full suite was not re-run end to end after that last spec edit. |
| `npm run e2e:v2` (Chromium) | PASS: 313 passed, 32 skipped, 0 failed (an earlier run failed `structure.spec.ts` isolation because I had imported `semantic.css` into V1, which that guard forbids; fixed by deferring the import) |
| Axe, screen reader, real devices, native Arabic | NOT RUN |

## Rollback

Revert the commit. It restores `base.css`, deletes `reset.css`, `scope.css`, `embed-fonts.css`, `semantic.css` and the two new tests, and removes the lab's `reset.css` import. No other file references them.

## Next

BACK-87 imports `tokens.css`, `base.css`, `scope.css`, `embed-fonts.css`, `semantic.css` and the map sheets in the host (and replaces the V1-bundle isolation guard with a precise one), wraps the lens in `<div className="kv2-scope">`, and may consume `--sem-*` in any shared component.

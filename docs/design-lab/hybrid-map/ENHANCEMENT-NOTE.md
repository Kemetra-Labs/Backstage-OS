# Design note: motion library, D3 and WebGL for the Hybrid Mission Map (concept B)

Status: design note only. **Nothing here is approved or built.** It extends [SPEC.md](SPEC.md) (B with C's list view, selected 2026-11-21). The pilot pages contain none of these libraries: B's trace is plain CSS, its layout is plain arithmetic.

## 0. Principle

React and TypeScript stay. Each addition is a **separate, removable layer** that only adds polish. The product must be complete, truthful and accessible with all three layers switched off. If a layer fails to load, is unsupported, or the user prefers reduced motion, the screen falls back to the SPEC.md rendering with **no information lost**.

Rules that apply to every layer (from `PRODUCT.md` and `DESIGN.md`, unchanged):
- Unknown is never Healthy; connectivity, freshness and health are never combined; no invented percentages, scores or trends.
- Nothing may read as live telemetry: no looping "heartbeat", pulse or data-flow animation. Demo data is labelled.
- Every graphic has a text or table alternative; keyboard and focus order are unchanged; 44 px touch targets; visible focus.
- RTL: the map canvas keeps left-to-right geometry in Arabic; text follows the language.
- No third-party request at runtime: libraries are bundled, assets self-hosted.
- `V2 PRODUCT.md` says V2 "adds no dependencies". **Each library below needs an explicit owner decision**, a licence check and a bundle measurement before adoption. Package names, licences and sizes were not verified for this note.

## 1. Motion library (choreography only)

**Candidates:** Motion (the successor to Framer Motion; check the current package name) or GSAP. Alternative with no dependency: keep CSS transitions and the Web Animations API, which is what the pilot uses.

**What it is for in B (all one-shot, all caused by a user action or first load):**

| Moment | Behaviour | Information carried |
| --- | --- | --- |
| Select a node | Own links draw in from the selected node outward (about 700 ms); other links ease to 18 % | Which links belong to the selection |
| Change selection | Hub and selected card cross-fade; inspector content fades in place (no layout jump) | Continuity of focus |
| First load | Orbits draw once, then nodes settle inward (about 900 ms, once per session) | None (orientation only); skipped on later visits |
| Filter change | Non-matching nodes fade to 32 % | Same as the static dim |
| Map / List switch | Cross-fade, no slide | None |

**Not allowed:** infinite loops, pulsing "alive" halos, travelling dots along links, ambient star drift, any motion that starts without a user action.

**Reduced motion:** `prefers-reduced-motion` (and the in-app setting) turns every item above into an instant state change. The static highlight, dim and focus ring carry the same meaning. Test: zero running animations.

**Budget:** animate only `opacity`, `transform` and `stroke-dashoffset`; at most 10 animated elements at once; every animation finishes within 1 s; no layout-triggering properties.

**Decision needed:** is a dependency justified, or do CSS and the Web Animations API suffice? The pilot suggests they do for everything in the table except coordinated sequencing (first-load settle) and interruptible transitions. Recommendation: **start without the library**; adopt one only if sequencing proves hard to maintain.

## 2. D3 (maths, not rendering)

**Use only the sub-modules we need** (for example shapes, scales, interpolation), never D3's DOM control. **React renders every element**; D3 only computes numbers.

**What it improves in B:**
- Orbit placement: a pure function `orbitPosition(kind, angle)` already works with trigonometry; D3 adds nothing there. Use D3 only if we later place many nodes per orbit and need collision avoidance (a small force pass that runs once, offline or at load, never as a live simulation).
- Link curves: smoother curve generators and consistent mid-point markers.
- Scales for the age bar and ring (linear scale, clamp at 3x target) so the maths is shared and tested.

**Determinism:** layouts must be reproducible. No random seeds; the same input gives the same pixel positions, so screenshots, tests and Arabic and English renders agree. Computed positions are rounded and cached.

**Not allowed:** a live force simulation that keeps nodes moving; layout that depends on data values (orbit and position stay "kind", never importance or health).

**Honest assessment:** with 10 nodes and 11 links, D3 is **not needed today**. Adopt it when the map has to grow (dozens of nodes), not before. Cost of waiting is low because `orbitPosition` is isolated behind one function.

## 3. WebGL hero (optional background only)

**Candidates:** Three.js, usually through React Three Fiber, with a small custom shader; or a single full-screen shader without a scene graph.

**Scope: a decorative layer behind the map, nothing else.** The planet limb, atmosphere glow and a sparse star field rendered with real depth (slow parallax from a **one-time** pointer or scroll offset, never a loop). It replaces the static `horizon.webp` and CSS stars, nothing more.

**Hard rules:**
1. **Never the only carrier of meaning.** No node, link, label, status or number is drawn in WebGL. The SVG and HTML layers on top are unchanged.
2. **Static fallback is the default.** The existing `horizon.webp` and CSS stars render first; WebGL replaces them only after it has initialised successfully. If it fails, is blocked, is unsupported, the device is weak or the tab is hidden, the static layer stays.
3. **Off by default for:** reduced motion, data-saver, battery-saver, low-power devices, any viewport under 900 px, and print.
4. **No loop:** render on demand (load, resize, one pointer settle). No `requestAnimationFrame` running at idle.
5. **Contrast first:** the hero must not lower text contrast; node cards keep their opaque backgrounds; check contrast on rendered pixels with the layer on.
6. **Self-hosted and bundled;** lazy-loaded only on the map route so other screens do not pay for it; code-split from the main bundle.

**Budget (to be measured, targets not yet verified):** the layer adds no more than 0 ms of idle CPU; first paint of the map is never blocked by it; the lazy chunk stays small enough that the screen is usable without it on a slow connection.

**Risks:** GPU and driver variance; harder visual regression tests (tolerance needed); testing on WebKit and Firefox before shipping; an animated hero can drift towards "live telemetry", so keep it still; maintainers need shader skills.

**Honest assessment:** highest visual wow, lowest information value. It belongs after the product is correct, behind a feature flag, and can be dropped without touching anything else.

## 4. Adoption order and gates

| Order | Layer | Gate before starting |
| --- | --- | --- |
| 0 | Port B + C list view in React with CSS only (SPEC.md) | Owner approves implementation |
| 1 | Motion (CSS and Web Animations API first; library only if needed) | Owner decision on dependencies |
| 2 | D3 maths | Node count or collision needs justify it |
| 3 | WebGL hero behind a flag | Layers 0 to 1 done, owner asks for more visual depth |

## 5. Acceptance (each layer, in addition to SPEC.md section 8)

- The full Playwright suite passes with the layer **on, off and failing to load**.
- Screenshots with the layer off are identical to the SPEC.md render; with it on, only the background or timing differs.
- Zero running animations under reduced motion; no animation longer than 1 s; none that loops.
- No new network request to another origin; bundle size measured before and after and recorded.
- No `%`, no composite score, "Healthy" still appears once for nodes and once for sources.
- WebKit and a low-end device checked for any WebGL work (not done in this pilot).

## 6. Open decisions for the owner

1. May V2's "no dependencies" rule be relaxed for a motion library, D3 maths, or neither?
2. Is WebGL wanted at all, given it adds polish but no information? If yes, behind a feature flag and off by default on phones?
3. Who owns visual-regression tolerance and low-end device testing if WebGL is adopted?

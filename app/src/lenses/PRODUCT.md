# Product

<!-- impeccable:product-schema 1 -->

> Scope: this record covers the lenses only (`app/src/lenses`). It is derived from the owner's written brief and the repo's `CLAUDE.md`, not from an interview round: the brief already answers users, purpose and constraints. Everything below is the brief's own statement, nothing inferred except where marked (inferred).

## Platform

web

## Stack

Existing: Vite 5, React 18, TypeScript strict, Vitest, Playwright. No UI library, no router, no third-party requests. The lenses add no dependencies.

## Users

Internal Kawalys / Kemetra staff (customers never sign in to Mission Control): the owner, technical staff and non-technical staff, reviewing the product's operational picture. Three demo perspectives: Owner, Technical, Nontechnical. English first with real Arabic RTL.

## Product Purpose

Kawalys is a unified mission control for product and operations. The lenses began as a visual experiment: four screens (Mission Map, Source Observatory, Mission Replay, Agent Flight Deck) built from owner reference images so the owner can compare it side by side with host and decide which direction to adopt.

## Positioning

Mission control that is honest about what it knows: every statement carries a truth label (observed, correlated, hypothesis, proposed), every source shows connectivity, freshness and target health separately, and unknown is never shown as healthy.

## Operating Context

Review prototype. Demo data only: no backend, auth, AI calls, or real GitHub / Jira / Sentry / Datadog / Port access. Nothing may be presented as live telemetry.

## Capabilities and Constraints

- Truth semantics come from `src/contract/rules.ts` (resolveLabel, resolveHealth, freshnessOf, countDisplay). The lenses must call them, never re-decide.
- Control vocabulary: no approve / reject / defer / go / release / retry / run style controls (`isForbiddenControlLabel`, EN and AR).
- No functional approval, execution, deployment or source-write controls. Agents are simulated.
- One shared synthetic data world: INV-DEMO-7, RT-DEMO-112, #DEMO-4471, PR #DEMO-88, sources github / jira / sentry / datadog / port (+ confluence, read by the Source Observatory).
- Latin digits in both languages; LTR identifiers isolated in `<bdi dir="ltr">`.
- Responsive at 320, 375, 768, 1440 px; keyboard operable; reduced motion respected.

## Brand Commitments

Name: Kawalys. The four owner reference images in `docs/design-lab/v2/reference/` are the primary visual references; the accepted C2 direction and Blueprint v4 stay the behavioural, accessibility and truth constraints.

## Evidence on Hand

Four reference images (1448 x 1086). They contain invented figures (trust 72 %, mission health 78 %, confidence 0.91, per-source percentages) which have no data contract and are therefore not reproduced.

## Product Principles

1. Unknown is never healthy.
2. Connectivity, freshness and health are independent facts and are never merged into one score.
3. A label says how we know it (observed, correlated, hypothesis, proposed).
4. Nothing on screen acts on the world; proposals are display only.
5. Same facts, three perspectives: personas change detail and wording, never truth.

## Accessibility & Inclusion

WCAG 2.1 AA target (the repo's BACK-8 evidence uses it). Genuine RTL, accessible text/table alternatives for graphical views, visible focus, 44 px touch targets.

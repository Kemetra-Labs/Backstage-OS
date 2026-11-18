# Kawalys V2 design system (lab)

Recorded from the shipped CSS and components, not from intentions. Scope: `app/src/design-lab/v2` only. V1 keeps its own gold-on-navy system in `app/src/styles` and `css/app.css`; the two are never merged.
Mode (impeccable): **Operate**. Dense dark operations screens built from four owner reference images (`docs/design-lab/v2/reference/`).

## Direction

A night-sky operations console: deep teal-navy ground, translucent panels with a hairline cyan border, and one authored object per screen (the signature move):

| Screen | Signature object |
| --- | --- |
| Mission Map | Glowing hub over a planet horizon with orbit rings; classified links; HTML nodes over an SVG edge layer |
| Source Observatory | Three independent "pins" (connectivity, freshness, target health) standing on the horizon; no composite |
| Mission Replay | Five stages on glowing orbits, an amber evidence-gap marker, a scrubber with event ticks |
| Agent Flight Deck | Fleet orbit around an "AI agents" core with four activity satellites |

Navigation, controls, tables and tabs are standard components; the world lends palette, type, density and the signature object only.

## Tokens (`styles/tokens.css`, all colour goes through `:root`)

- Ground `--kv2-bg #050c14`, panel `--kv2-panel #0a1824`, well `--kv2-well #07111b`.
- Ink `--kv2-ink #e8f3f9`, `--kv2-ink-2 #adc2cf`, `--kv2-muted #86a0b0` (all at least 6.5:1 on panels by token maths; text inside the four signature scenes is also checked on rendered pixels, EN and AR at 1440 and 375 px, by `e2e-v2/fidelity.spec.ts`).
- **Cyan** `--kv2-cyan #2de2ec` = structure, selection, focus. **Amber** `--kv2-amber #f5a524` = attention (failing check, stale, evidence gap, hypothesis). Green, blue and violet appear only as truth labels (observed, correlated, proposed); red only for unavailable.
- Truth label chips carry an icon as well as colour: observed check, correlated link, hypothesis bulb, proposed doc, unknown question mark.
- Alphas are `color-mix` over tokens (`--kv2-line`, `--kv2-line-hi`, `--kv2-*-soft`); no literal colours outside `tokens.css` (unit-tested).
- Type: self-hosted **Manrope** (variable 200 to 800, Latin) for English and **Cairo** (variable, Arabic subset) for Arabic, declared in `styles/fonts.css` from `assets/fonts/` (OFL 1.1, provenance in `assets/fonts/SOURCE.md`). Latin inside Arabic pages falls through to Manrope. Local stack (Segoe UI, system-ui) is only the swap fallback. Scale 11 / 12 / 13.5 / 15 / 18 / 23 / 36 px. Tabular numerals. No third-party font request.
- Luminosity (BACK-18): `--kv2-cyan-bloom`, `--kv2-cyan-haze` and `--kv2-bloom-sel` add a second, tighter glow layer to the selected node, the selected hub, observed links (two drop-shadows), the current and reached replay stages, the fleet core and ring. Unknown and unavailable nodes at rest keep a blur-free ring (e2e asserts it). No decorative amber.
- Horizon: a static pre-rendered webp (`assets/horizon.webp`, drawn by `docs/design-lab/v2/tools/horizon.py` from the token colours) laid by `.kv2-horizon::before` over the original CSS gradient, which stays as the fallback. No animation. In Source Observatory the planet sits in a band under the three pins, never behind their text.
- Radius 6 / 10 / 14. Motion tokens `--kv2-dur-micro 120ms`, `--kv2-dur-short 220ms`, exponential ease-out; only state transitions, no decoration on load.

## Layout

- App grid: 57 px top bar, 215 px side navigation, fluid main. Screens use a main column plus a 330 px inspector; the inspector stacks under the main column at 1180 px, the side navigation becomes a menu at 860 px.
- Reference size is 1448 x 1086; screens are fluid, not pixel-locked.
- Logical properties throughout. The Mission Map canvas and the Flight Deck orbit keep left-to-right geometry in Arabic (placed with physical `left`); text inside nodes follows the language.

## Truth presentation rules (from the V1 contract, not restyled)

1. Unknown is never Healthy (`resolveHealth`). Claimed-healthy nodes with no or stale evidence read "Health unknown" or "Stale".
2. Connectivity, freshness and health are shown as three readings; there is no composite trust or health figure anywhere.
3. Counts come from `countDisplay`-style derivation ("3 of 6"); no invented percentages (e2e asserts no `%` on any screen).
4. Confidence is words only; V2 fixtures carry no calibrated basis.
5. Proposals are text labelled "Proposed, nothing executes". The only action control is "Copy proposal text".

## Deliberate departures from the reference images

See `docs/design-lab/v2/comparison.md`. In short: no trust/health percentages, no confidence decimals, no "+27 %" trend, no bell or avatar, no dead navigation items, "Active runs" reworded, tagline in sentence case.

## Hallmark waivers (recorded in the `tokens.css` stamp)

Tracked-caps eyebrows and status chips (owner references use them on every screen), meaning-bearing status dots beside words, no hero or word budget (app screen scope).

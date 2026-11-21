# BACK-30: Technical-only evidence is hidden from unauthorized personas (V2 Mission Map and B+C pilot)

Date: 2026-11-21. Scope: the V2 Mission Map (`v2.html#/mission-map`) and the B+C pilot (`?concept=bc`). Synthetic demo data only.

**A display persona is not authorization. No server-side identity, tenant, X02 or X04 enforcement exists or is claimed.**
This change scopes what the two named screens are handed in the demo. It is not an access control.

## Ratified rule (M05-D05-B, Confluence page 85164033; quoted from Jira BACK-30)

"For a viewer not authorized for a Technical-only event, do not expose its existence in event rows, IDs, timestamps,
provider/source hints, counts, links, derived rollups, status or freshness labels, accessible names, tooltips or alternate
map/list/inspector views. Hide downstream derivatives that are supported only by restricted records. A generic 'unknown /
no authorized basis' state must not itself reveal the hidden event. Preserve facts independently supported by authorized
evidence; unknown never means healthy. A display persona switch is not authorization."

## Matrix

| Persona | Technical-only records (E-5) | Anything supported only by them |
|---|---|---|
| Technical | all shown | shown |
| Owner | none: not rendered, not counted, no placeholder | removed or reduced to unknown |
| Nontechnical | none: not rendered, not counted, no placeholder | removed or reduced to unknown |

## How it works

`authorizedWorld(WORLD, persona)` in `app/src/design-lab/v2/logic/authorize.ts` returns a new world (memoized per input
world and persona; Technical gets the input itself). `MissionMap.tsx` (3 places) and `MissionMapBC.tsx` read it instead of
`WORLD`. Every field that holds a record or its id is scoped:

- `evidenceById`: Technical-only records removed.
- `nodes[].evidence` and `nodes[].state.basis`: restricted ids and records removed. If the whole basis of a node is
  removed, its claimed health becomes `unknown` and its freshness is re-derived from the node's own (authorized) source
  authority, or `unknown` when it has none. Connectivity is a source fact and is kept.
- `edges[].evidence`: restricted ids removed. An edge that had evidence and has none left is removed.
- `sources[].health.basis`: restricted records removed. Source authority (reachability, age, TTL) is authorized for all and untouched.
- `missions[].evidence` and `replay[].evidence`: restricted ids removed (replay entry becomes `null`).

`scopeSet` (`logic/graph.ts`) now keeps a node with no link at all in every scope. Without this, Sentry (linked only by the
removed link d4) would drop out of the default Retail Tower scope and vanish from the B+C list and the Risks filter while
its authorized stale state is still true.

## Surfaces traced (before, then after, for Owner and Nontechnical)

| Surface | Before | After |
|---|---|---|
| V2 and B+C evidence tab, node Inventory | row `E-5` (Owner) with "Restricted to Technical" | "No evidence has been read for this item." |
| V2 and B+C evidence tab, node Sentry | row `E-5` placeholder | same empty state |
| Node evidence count (V2 list, B+C ledger) | Inventory 1, Sentry 1 | 0 and 0 |
| Inventory status chip, aria-label, tooltip | "Stale" (revealed a stale read exists) | "Health unknown" |
| Link d4 Inventory to Sentry, V2 list and B+C links table | row with "Based on evidence restricted to Technical" | no row |
| Link d4 drawn on the map (V2 SVG, B+C `.kv2-bc-edge[data-id="d4"]`) | drawn, flagged stale | not drawn (B+C edges 11 to 10) |
| Stale-link chip, link counts, neighbourhood up/down counts | counted d4 | follow the scoped edges |
| Sources tab, Inventory | already listed no provider (evidenceView filtered it) | unchanged: no providers listed, and no record behind it |
| Sentry node scope membership | in scope through d4 | stays in scope (unattached nodes are shown) |
| Sources matrix, Sentry stale state | shown | unchanged: from source authority, not from E-5 |
| Source health basis (Sentry) | E-5 inside `sources[].health.basis` | removed (display unchanged, still unknown) |

Technical sees exactly what it saw before. The old restricted branches (`evidenceView`, `edgeRestricted`, the
`edge.restricted` copy) stay as defence in depth and are now unreachable from these two screens.

## Tests

- `logic/authorize.test.ts`: Technical identity; no `E-5`, id, target label or external id anywhere in the scoped JSON;
  d4 removed (length - 1); Inventory unknown, not stale; Sentry kept with `[]`; mixed mission keeps `['E-9']`; memoized; world not mutated.
- `e2e-v2/nondisclosure.spec.ts`: Owner and Nontechnical x EN and AR, V2 (overview, Evidence, Sources tabs, list) and B+C
  (map and list); a `leaks()` probe over visible text and every `aria-label`, `title`, `alt` and `data-*`; the permitted
  Technical case; the persona switch from Technical to Owner.
- Updated old expectations (assertions changed, tests kept): `world.test.ts`, `bc.test.ts`, `logic.test.ts`,
  `bc.spec.ts`, `interactions.spec.ts`, `structure.spec.ts`.

## Screenshots (`screens/BACK-30/`, node Inventory, Evidence tab, 1280x900)

`v2-*` and `bc-*` for Owner EN, Owner AR, Nontechnical EN and Technical EN.

## Out of scope (still read the raw `WORLD`)

Source Observatory, Mission Replay, Agent Flight Deck and the Shell search. They can still show E-5 to every persona and
are tracked as follow-ups. Source-level events (for example the Sentry readings on the B+C signal timeline) come from
source authority and are not scoped here.

## Rollback

Revert this commit. Nothing else depends on it.

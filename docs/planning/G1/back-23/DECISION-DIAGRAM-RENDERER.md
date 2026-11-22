# BACK-81: DiagramRenderer = in-house SVG, no new dependency (option A)

**Decision.** On 22 Nov 2026 the owner answered "Approve A" in chat to "Approve option A and the docs-only decision ticket?". This record captures option A for the **DiagramRenderer** capability and supersedes the "DEFER selection" row for that one capability in [DECISION-PACKAGE.md](DECISION-PACKAGE.md) §1. It follows the pattern of [DECISION-2026-11-22.md](DECISION-2026-11-22.md), which left DiagramRenderer deferred.

**What A means.**
- Keep the two in-house SVG renderers: V1 `DepGraph` (grid) and the V2 B+C `Canvas` (orbit).
- Add no dependency. React Flow is **not adopted**, and Archify stays rejected.
- Both renderers read the `kawalys.graph.v1` view model ([CONTRACT-V1.md](../contract-v1/CONTRACT-V1.md)). The `DiagramRenderer` port is carried by BACK-65 slice S3b (adapter), not by this ticket. BACK-65 is an unmerged proposal in To Do, so S3b is not an approved plan.

This record approves a decision only. It changes no code, dependency, CI or Jira status.

## Why

- **No approved surface needs React Flow's strength.**
  - The B+C Mission Map is hand-rolled SVG with about 10 nodes. Its SPEC drops pan and zoom on purpose.
  - There is no Architecture Explorer screen. The only "Explorer" in `app/src` is the Evidence Explorer (BACK-11), and the full map (M03) is not built.
  - The 250-node scale in [BACK-22](../back-22/REPORT.md) comes from the synthetic G1 fixture, not from an approved surface.
- **React Flow's costs land on constraints the owner already set.**
  - 89,095 B gzip and 28 packages, including 9 D3 modules, while the D3 decision is deferred (D-24.4 allows single D3 modules later and is not an install approval).
  - A 54-press keyboard path and 74 touch targets under 44 px at 375 px, against 10 presses and 0 targets for DepGraph.
  - On the Mission Map it would need zoom disabled and custom node and edge components to reach the B look.
- **Archify is not reopened.** Its validator rejected every full graph, selection cannot reach the shared inspector from its sandboxed frame, and its license statements conflict (MIT vs Apache-2.0). No new evidence was offered.

## Evidence status

Figures come from [back-22/REPORT.md](../back-22/REPORT.md) and [DECISION-PACKAGE.md](DECISION-PACKAGE.md). Counts, not percentages.

| Item | Status |
|---|---|
| Truth classes kept, axe 0, EN/AR RTL, three identical Chromium runs, 35/60/250 nodes (React Flow and DepGraph) | PASS |
| React Flow keyboard path (54 presses) and touch targets (74 under 44 px at 375 px) | FAIL, needs custom work |
| Archify full graphs, selection parity, license | FAIL / conflict |
| React Flow on React 19.3.1 (measured on 18.3.1; 13.0.2 depends on `react-compiler-runtime`) | NOT RUN |
| WebKit, real devices, real screen reader ([BACK-32](https://rahmaqanater.atlassian.net/browse/BACK-32)) | NOT RUN |
| Cost of extending the in-house renderers (routing, zoom): a judgement, not a measurement | NOT RUN |
| Orbit layout in React Flow, user comprehension | NOT RUN |

## Corrections to earlier wording

- **BACK-26 is fixed in code.** Commit `40e55d7` (#44) added `splitEdges` and an undrawn-edge note, and the edge key now includes kind and index. `DepGraph.tsx:64` is no longer the `if (!a || !b) return null` line that the BACK-22 report and DECISION-PACKAGE R5 cite. Those documents describe the code as it was when they were written. Jira may still show BACK-26 as To Do; its status is the owner's to change.
- **Two in-house renderers, not one.** BACK-65 proposes retiring `DepGraph` after B+C parity (D-3). That proposal is open. A holds either way.

## Re-open trigger for React Flow

Both conditions must hold:
1. An approved dense, zoomable surface exists, such as the Architecture Explorer (gated by [BACK-80](https://rahmaqanater.atlassian.net/browse/BACK-80) and M03).
2. The owner has accepted the D3 dependency.

Then run the spike already defined in [DECISION-PACKAGE.md](DECISION-PACKAGE.md) §5 item 4: edges removed from the tab order, 44 px targets, React 19.3.1, and WebKit. Until then, nothing here is a plan to adopt it.

## Rollback

No dependency is added, so there is nothing to roll back in the product. To undo this record, revert the docs PR.

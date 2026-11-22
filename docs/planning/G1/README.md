# G1: code-graph evidence evaluation

Executed on 2026-11-21 with the owner's approval given in chat: install and execution were authorized, and the fixture was accepted at the G1-01 gate. All engines ran in a local sandbox outside the repository (`<HOME>\kawalys-g1-sandbox\`), offline, with no keys and only on the synthetic fixture. Nothing in `app/`, V1, V2 or CI changed. No Jira status was changed.

| Ticket | Task | State |
|---|---|---|
| BACK-20 (G1-01) | Evaluation fixture, ground truth, envelope schema, scorer: [fixture/](fixture/README.md) | Built; accepted by the owner (G1-01 gate passed) |
| BACK-21 (G1-02) | Graphify vs CodeGraph on the fixture: [back-21/REPORT.md](back-21/REPORT.md) | Run and scored. Both strictly FAIL on symbol-level import duplicates; no invented relations; neither rejected |
| BACK-22 (G1-03) | DepGraph vs React Flow vs Archify on the same envelope: [back-22/REPORT.md](back-22/REPORT.md) | Run. React Flow is the provisional candidate if the D3 dependency is accepted; Archify not suggested; DepGraph not replaced |
| BACK-23 (G1-04) | Decision package: [back-23/DECISION-PACKAGE.md](back-23/DECISION-PACKAGE.md) | Ready for owner review. Recommendation: defer selection for both capabilities; next approval slice listed |
| BACK-29 / BACK-77 / BACK-78 | Hold-out fixture v1 and engine pass: [holdout-v1/](holdout-v1/README.md), [holdout-v1-run/](holdout-v1-run/REPORT.md), [holdout-v1-rescore/](holdout-v1-rescore/REPORT.md) | Both engines FAIL strict v1; CodeGraph 107/114, no invented relations |
| BACK-23 decision | [back-23/DECISION-2026-11-22.md](back-23/DECISION-2026-11-22.md) | **Owner picked CodeGraph as RepositoryAnalyzer (22 Nov 2026)**, conditional on licence sign-off BACK-80. DiagramRenderer still deferred |

Not run anywhere in G1: languages other than TS, TSX, JS and Python; WebKit; real devices; screen readers; private or real source code.

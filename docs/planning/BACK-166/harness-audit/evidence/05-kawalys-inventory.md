# Kawalys inventory at 49eab2d (Explore subagent, read-only, no tests run)

Key: NO agent runtime, NO Claude/Codex adapter, NO worktree/cancel/queue, NO VIE/WebGL, NO Software Factory, NO MCP server. Agent UI = synthetic fixtures. Real code: evidence store (Postgres, forced RLS, append-only), Descope auth + sessions (single owner role, deny-by-default 404), human decisions + audit trigger, cognitive core (memory/retrieval/reasoning rules/learning core, one /cognition search route), read-only GitHub/Jira/Confluence connectors.

| Capability | Status | Paths |
|---|---|---|
| Flight Deck / roster | synthetic | app/src/lenses/screens/AgentFlightDeck.tsx, app/src/lenses/logic/deck.ts, app/src/contract/world.ts (AgentDemo, AgentCapability status simulated/not_available, ActivityEvent, Mission), app/src/fixture/world.ts; BACK-96 removed undefined Mission.events |
| Replay | synthetic playback | app/src/lenses/screens/MissionReplay.tsx, app/src/lenses/logic/replay.ts, contract ReplayEvent/ReplayStage (observed, ingested, correlated, hypothesis, proposed) |
| Evidence model/API | implemented | server/migrations/0001..0006, server/src/evidence/* (EvidenceRepository, idempotency, visibility, source-approval), routes /evidence, /decisions, /investigations/:id/decisions|notes; evidence type Observation/Correlation/Hypothesis/HumanDecision, state ok/stale/unknown/denied/error, source_ref, observed_at, received_at, payload jsonb <=64KB; no agent-run provenance field |
| Decisions/audit | human decisions implemented; Decision Studio plan-only; no agent-action approval flow | server/src/audit/audit-row.writer.ts, migration 0004 |
| AuthZ | implemented, single role | server/src/auth/capabilities.ts (8 caps, owner only), workspace.guard.ts, auth.guard.ts, identity/descope-verifier.ts, session/* |
| Cognitive core | core implemented; live reasoning, COG-05 write path plan-only | server/src/memory, retrieval, reasoning, learning; cognition.controller.ts; docs BACK-105..111, 154-156 |
| VIE | plan-only | prototype js/war.js 2D SVG demo |
| Software Factory / Code Review Room | plan-only, zero code | BACK-184 decision-brief section 6 |
| Scheduling BACK-97 / queue | absent | only github.scheduler.ts refresh timer |
| MCP / Intelligence API | plan-only | nearest: /cognition search route |
| Agent runtime/adapters/worktrees/cancel | absent | — |
| BACK-14 reuse inventory | docs-only; no DeepSeek/Cordis mention | docs/planning/BACK-14/README.md |

No docs/planning folders exist for BACK-45, 97, 118/119/126, 166/167/169, 168.

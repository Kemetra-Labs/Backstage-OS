# COG-07 shadow UI: scope decision

Status: **scope decided 2026-11-27; build not started.** The owner delegated this decision to the implementing session, which consulted the advisor tool and took the most conservative scope.

**Scope:** a read-only shadow view in `app/`.
- It shows retrieval hits and reasoning results. Stale, unknown and unavailable states are shown explicitly (unknown is never Healthy).
- English first, with working Arabic and RTL.
- By default it reads committed fixtures. It makes a request only in live mode (`VITE_KAWALYS_LIVE=1`), through `app/src/live/http.ts` alone.
- It is labelled as shadow output, never as live telemetry.
- It has no actions, no writes and no new network path.

**Gate:** building starts only after an independent review of the current commit returns GO (matrix section 4). A NO-GO means the findings are fixed first.

The owner can change this scope before the build starts.

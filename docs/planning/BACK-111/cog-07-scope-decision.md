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

## Built (2026-11-27, after the GO at `3c675da`)

- **Route:** `#/shadow` in `app/` (`app/src/screens/Shadow.tsx`), not in the sidebar. It is a read-only view.
- **Data:** `app/src/fixture/shadow-cognition.json`, synthetic. `server/test/shadow/shadow-fixture.spec.ts` keeps it equal to the real COG-03 search and COG-04 reasoning output over the synthetic retrieval world, and records that the independent validator accepted the reasoning result. It is regenerated with `SHADOW_FIXTURE_WRITE=1`.
- **View model:** `app/src/view/shadowView.ts` refuses a malformed fixture, or a result the validator did not accept, as a whole. The screen then says so in words and shows nothing else.
- **Copy:** `SHADOW_COPY` in English and Arabic, covered by the shared copy rules and the copy snapshot.
- **What it shows:** a marker saying the output is synthetic shadow output, not live telemetry, and that nothing is requested. Not-verified evidence, blocked and unknown tasks, and the never-granted approval are all said in words.
- **Tests:**
  - `app/src/view/shadowView.test.ts` and the route tests.
  - `app/e2e/shadow.spec.ts` (chromium and webkit): layout in English and Arabic at 320 to 1440 px; no request outside the app and none to `/api/`; no controls; unknown and blocked shown in words; axe WCAG A and AA.
- **Not built:** a live read. It would need a BFF route that wires the cognitive core, and the guards keep that unwired; that would be a separate decision.

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

## Live read: decided by the owner 2026-11-27 (search only)

The owner chose to build a live read for the shadow view. The design was checked with the advisor tool before building.

- **Search only.** No real source of task plans exists, so reasoning stays fixture-only. In live mode the reasoning panel says in words that it is not available live; synthetic and live output are never shown together under one label.
- **Route:** `GET /cognition/projects/:projectId/search?q=`. Database mode only (registered like Portfolio), behind the global session guard and `WorkspaceGuard` with the existing `evidence.read` capability (no new capability or auth change). The persona header is never read.
- **Nondisclosure:** a malformed id, a project that does not exist, one in another workspace, and one whose grants are revoked or never existed all answer the same 404 body (no visible granted source = not found).
- **Response:** a trimmed DTO: query, outcome, total, truncated, and per hit title, kind, source reference, evidence status and match tier. No fingerprint, evidence ids or projection internals.
- **Bounded:** the query is bounded by retrieval (500 characters, 32 tokens; invalid gives 400). Reads are rate-limited per user (fixed window, reusing the sign-in limiter design), so the memory read is no longer an unbounded per-request cost; the memory read work budget stays tracked.
- **Guards:** `src/cognition` becomes the one allowed consumer of the memory and retrieval modules; its own guard pins its imports and forbids writes. Reasoning stays unwired.
- **Process:** two PRs (server route, then app wiring). The server PR gets an independent read-only security review before it merges.

**Server route built (2026-11-27).** `server/src/cognition/` and `MemoryRepository.readVisible`. An independent security review returned **GO** with no critical, high or medium findings; it was done by reading the code. Fixed from its low findings: an empty, blank, oversized or non-string query is refused before the database read; a fake-repository spec pins that a refused request (rate limit or query) never reaches the read; the object-shaped `q` case is tested. Accepted: the fixed window allows a burst at a window boundary (single-owner process).

**App wiring built (2026-11-27).**
- **Live build:** in a live build (`VITE_KAWALYS_LIVE=1`), `#/shadow` reads `GET /api/cognition/projects/:id/search` for `?project=<uuid>` and up to five `?q=` in the address, through `src/live/reads.ts` only. It shows the live marker; any failed search fails the whole read, said in words; the reasoning panel says it is not available live. The default build is unchanged and requests nothing.
- **Tests:** `app/e2e-live/shadow-live.spec.ts` runs against the real BFF. It checks the signed-in search and its live label, that a foreign-workspace project reads as not found, and that a missing project or query is said in words with no request.

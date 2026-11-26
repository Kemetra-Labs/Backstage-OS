# BACK-51 P3: record a decision (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In live mode, a signed-in owner records a decision on the open investigation from the Investigation Room, then sees it in the decision list. The fixture demo is unchanged.

**Architecture:** Pure form rules and the one POST live in `src/live/decisions.ts` (a second sanctioned caller of `http.ts`, like `session.ts`). The draft lives in P2's `useSessionDraft` (in memory, above the screens). A prop-driven `RecordDecisionView` renders every state; a thin `RecordDecision` wires it to the session, the draft and the request. `ServerRecords` renders it and re-reads the decisions after a 201.

**Tech Stack:** React 19, Vitest (node, `.test.ts` only, `react-dom/server` for render tests). No new dependency.

**Spec:** [gate-path-plan.md](gate-path-plan.md) section 3 (P3), decisions D4 and D5 (approved 2026-11-26), sections 4 and 5. Server contract: `POST /investigations/:id/decisions`, body `{ decision, rationale, evidenceIds }`, 201 on success, capability `decision.create` (`server/src/evidence/evidence.body.ts`, `evidence.controller.ts`).

## Global Constraints

- Live mode only; owner and Technical personas see the form, Nontechnical gets no panel (as `ServerRecords`). The persona switch is display only: the server's capability check is the real gate.
- Fields: decision 1-2000, rationale 1-4000, cited evidence 0-50, all counted in UTF-16 code units (`string.length`, like the server). Text must be non-blank after trim, with no NUL and no unpaired surrogate (the server's `storableText`).
- A recorded decision is shown as recorded, never as Approved: the existing label rule (`decisionLabel`) stays; copy never says "approved".
- D5 (a): client-side double-submit protection only (in-flight guard, button disabled, draft kept on failure). Server `Idempotency-Key` is a logged follow-up.
- 401 and 404 both mean `not_found` and reveal nothing; a `not_found` is reported to the session store (P2), which decides signed out versus hidden case.
- No new dependency, no CORS, no cookie or session change. All new copy in EN and AR; snapshot additions only. `src/live/http.ts` stays the only file naming a request API; the new importers go in `HTTP_IMPORTERS`.

## Review Focus

1. **Double click / retry:** two submits in one tick make one POST (Task 1 `submitGuard` test).
2. **Session ends mid-form:** the draft survives, the form says why submit is off, and one submit after re-sign-in records once (Task 2 view test + P2 draft tests).
3. **Long Arabic text:** a 2000-unit boundary counted in code units, and an unpaired surrogate refused before any request (Task 1 validation tests).
4. **Hidden or unknown case:** 404 reads "not visible", names nothing, keeps the draft (Task 1 result mapping, Task 2 copy test).
5. **Server unreachable or erroring after submit:** the request may have been recorded before the answer was lost, so the copy says "not confirmed, check the decision list before trying again, draft kept", never "recorded" and never "not sent" (Task 1 `unavailable` and `error`, Task 2 copy test).

---

### Task 1: Form rules and the POST (`src/live/decisions.ts`)

**Files:** Create `app/src/live/decisions.ts`, `app/src/live/decisions.test.ts`; modify `app/src/live/live.guard.test.ts` (add both files to `HTTP_IMPORTERS` and the importer/`files` expectations).

**Interfaces (produces):**
- `export const DECISION_MAX = 2000; RATIONALE_MAX = 4000; EVIDENCE_MAX = 50`
- `export interface DecisionDraft { readonly decision: string; readonly rationale: string; readonly evidenceIds: readonly string[] }`
- `export const EMPTY_DRAFT: DecisionDraft`
- `export type DraftProblem = 'decisionBlank' | 'decisionTooLong' | 'rationaleBlank' | 'rationaleTooLong' | 'tooManyEvidence' | 'unstorable'`
- `export function draftProblems(d: DecisionDraft): readonly DraftProblem[]`
- `export type SubmitResult = 'recorded' | 'invalid' | 'not_found' | 'rate_limited' | 'unavailable' | 'error'`
- `export async function submitDecision(investigationId: string, d: DecisionDraft, signal?: AbortSignal, fetcher?: Fetcher): Promise<SubmitResult>`: non-UUID id or any `draftProblems` returns `invalid` with no request; POST `/api/investigations/<id>/decisions`; only status 201 is `recorded` (any other 2xx is `error`); failures map from `HttpFailure`.
- `export function investigationIdOf(body: unknown): string | null` (UUID `id` of an investigation body).
- `export function planSubmit(draft: DecisionDraft, citable: readonly string[]): SubmitPlan` (`problems` | `citationsChanged` with the pruned draft, nothing sent | `send`) and `export const refreshesList = (r: SubmitResult): boolean` (true for `recorded`, and for `unavailable` and `error`, where the server may have recorded it anyway: the list the copy points to must be current before a retry)
- `export function createSubmitGuard(): { run<T>(f: () => Promise<T>): Promise<T> | null }` (null while one is in flight).

- [ ] Tests first (name them as the focus lines), run red, implement, run green.

### Task 2: Copy and the form view

**Files:** Create `app/src/screens/investigation/RecordDecision.tsx`, `app/src/screens/investigation/recordDecision.test.ts`; modify `app/src/i18n/screens/investigation.ts` (`recordDecision` block, EN and AR), `app/src/i18n/__snapshots__/all-copy.json`, `app/src/i18n/shell.ts` (the live footer no longer says no action is taken), `app/src/styles/screens/investigation.css`.

**Interfaces:** `RecordDecisionView(props: { draft: DecisionDraft; records: readonly RecordRow[]; technical: boolean; sessionStatus: SessionStatus; submitting: boolean; showProblems: boolean; result: FormResult | null; onChange(d: DecisionDraft): void; onSubmit(): void })` where `FormResult = SubmitResult | 'citationsChanged'` (prop-driven, no hooks, so it renders in node tests); `RecordDecision(props: { investigationId: string; records: readonly RecordRow[]; technical: boolean; onSubmitted(): void })` (hooks wiring).

- [ ] Render tests (EN and AR): idle form; counters in code units; blank/too-long problems named in words; submit disabled while submitting or when not `signedIn` (with the "draft is kept" note); each result's message; picker shows each record once with its label; no word "Approved"; no raw ids; Arabic has no leftover English.
- [ ] Implement; update the copy snapshot and check it is additions only.

### Task 3: Wire into the Investigation Room

**Files:** Modify `app/src/screens/investigation/ServerRecords.tsx`.

- Renders `RecordDecision` below the records panel in live mode for owner and Technical, once an investigation has been read. It stays through a re-read and through a failed one (so a "Decision recorded" confirmation never vanishes); while the session is signed out or ended its record rows are dropped and the draft stays. After `refreshesList`, a refresh counter in the read key re-reads the case (pinned to the same case id, not "newest" again). A `not_found` result calls `reportNotFound()`; it is not shown once the session has left `signedIn`.
- Fields and checkboxes are read-only while a submit is in flight. The live footer copy now says the build can record a decision (a deliberate change to an existing string; the snapshot diff is that line in EN and AR plus additions).
- [ ] `npm run check`, default-build e2e unchanged, live build checked in a browser with stubbed `/api` (record, 400, 404, 429, unreachable, session ends mid-form, double click, EN/AR, 320 and 1280 px).

## Risks and limits

- The server returns no reason for a 400, so the message is generic plus the client's own checks. No server change in P3.
- P4 adds the real end-to-end run (app + server + Postgres); P3 tests the app side against a stubbed server.
- Locally the app e2e WebKit shards are flaky under load; CI is the reference.

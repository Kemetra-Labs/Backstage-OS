# BACK-127 slice: SEC-02 protected-screen and draft locking, expiry and reauthentication

**Status: IMPLEMENTED on branch `claude/back127-sec02-session-lock` (owner approved the slice and decisions E(a), F, G, 27 Nov 2026).** Independent review fixes applied (a failed sign-out stays locked through later checks; an identity change while signed in drops the previous user's records; locked panels say locked; copy matches decision F). Note: with one source per project a revoked grant hides the whole case, so the browser test proves the case and draft stay hidden; the "record left the list" re-show path is unit-tested. Original preflight on `origin/main` `e021403`
(27 Nov 2026 UTC). Scope: the owner-approved "Final Execution Blueprint alignment" on BACK-127 (Blueprint SEC-02, R2 A+).

## 1. Preflight

| Check | Result |
| --- | --- |
| The D3(a) half of BACK-127 | **Delivered**: `/sign-in` with the Descope magic link (#168, #169, #170), enforcing CSP (#171), real sign-in on the pilot (P5 PASS, evidence bundle). What is left is SEC-02. |
| Overlap | BACK-131 merged (#173), no app change. BACK-172 owns server idempotency/rate/audit ids; not touched here. |
| Constraints from the ticket | No session persistence, no new DB, no auth bypass, draft in memory only, test with the real session guards plus a browser regression. |

## 2. Existing controls (reuse)

| Control | Where |
| --- | --- |
| One session store above every screen; signed in only from a 200 of `GET /api/auth/me` naming the owner; 401/404 read as signed out; network failure reads as unavailable, never signed in | `app/src/live/session.ts:5-60` |
| Live panels drop their data when the session is signed out or ended (`liveReadKey` adds `#out`), read again after a re-sign-in (`generation`), abort a read whose key changed, never paint the previous key's answer | `session.ts:38-46`; `app/src/app/useLiveRead.ts:17-41` |
| A panel's not_found re-checks `/auth/me` (one check at a time) to tell an expired session from a hidden case | `session.ts:96-99` |
| Drafts in memory only (a Map in the store), survive expiry and the next sign-in, cleared by an explicit sign-out | `session.ts:65,113,120-128`; `app/src/app/SessionContext.tsx:29-43` |
| Sign-out is claimed only with proof (DELETE ok, or not_found plus `/auth/me` signed out); otherwise `signOutFailed` | `session.ts:106-118` |
| Decision form: submit only when signed in, one submit at a time, ticked records that left the list are pruned before sending (`citationsChanged`) | `app/src/screens/investigation/RecordDecision.tsx:57,159-186` |
| Server: every auth failure is the same 404; sessions expire on idle (1 h) and absolute (8 h); the cookie is HttpOnly | `server/src/auth/*` (evidence pack C1-C4, C14) |
| Browser regressions: expiry mid-form keeps the draft; sign-out leaves no record on screen | `app/e2e-live/negatives.spec.ts:79,112` |

## 3. Gaps against the R2 acceptance

| # | Requirement (BACK-127, R2) | Today | Gap |
| --- | --- | --- | --- |
| G1 | Lock all protected views on **expiry, revoke or unverifiable** session; do not confuse a transient unavailable with authenticated | `unavailable` and `error` leave `liveReadKey` unchanged, so panels **keep showing the owner's data** while the session cannot be verified | No locked state for "was signed in, now unverifiable" |
| G2 | Suppress **draft content** while locked; disable writes | On `ended` the decision form still **shows the draft text** (submit is off) | Draft is displayed while locked |
| G3 | Re-show the draft only after the **same identity** reauthenticates | The store deliberately keeps no identity, so a different owner after a rebinding would see the previous draft | No in-memory identity check |
| G4 | Re-show only with **current investigation/evidence/source authorization**; revoked citations never reappear | Ticked ids are pruned only at submit time; the draft is shown as soon as the form renders | Re-show is not gated on a fresh successful read; ids not pruned on re-show |
| G5 | A **failed server logout leaves the display locked** and says the server logout is unconfirmed | `signOutFailed` sets a flag but the status stays `signedIn`: **everything stays visible** | No lock on failed sign-out |
| G6 | **Revalidate on return** without wasteful polling **or extending idle life** | No revalidation on return; and every `GET /auth/me` passes the guard, which **touches `last_seen_at`** (`session.service.ts:60`), so any check extends idle life | Needs a check that does not slide the idle window (decision E) |
| G7 | Tests for expiry, unavailable, sign-out failure, identity change, revoked source, reload, **stale in-flight response**, with the real guards and a browser regression | Expiry and sign-out are covered; the rest are not | Missing tests |

## 4. Design

1. **One derived `locked` state** in `SessionStore`: true when the owner was signed in since the last explicit sign-out and the
   current status is `ended`, `unavailable` or `error`, or the last sign-out failed (`signOutFailed`). `liveReadKey` adds
   `#locked`, so every live panel drops what it held (and an in-flight read for the old key is aborted and ignored), and shows
   a locked state in words. "Unavailable before ever signing in" stays as today (nothing to protect).
2. **Drafts are kept but never shown while locked.** `useSessionDraft` returns `undefined` while locked; the form shows a locked
   notice and no field contents; writes are off. Memory only, as today: reload or close loses it.
3. **Same identity.** The store keeps the `user.id` from `/auth/me` in memory only (never storage, never displayed, never
   logged). On a successful check whose id differs from the held one, all drafts are cleared before anything renders.
4. **Re-show rule.** After unlock with the same identity, the decision draft is shown only once the investigation read for the
   new generation succeeded, and its ticked ids are pruned to the records that read returned (revoked citations drop out and the
   form says a record left the list, as `citationsChanged` does today).
5. **Failed sign-out locks.** The display stays locked with the existing "server logout is unconfirmed" wording and a retry;
   drafts are cleared locally either way (an explicit sign-out is a request to clear them).
6. **Stale in-flight submit.** A decision answer that arrives after the session locked or the generation changed is not shown as
   a result and does not clear or change the draft; the decision list is re-read on unlock.
7. **Revalidate on return (decision E).** On `visibilitychange` to visible and on `online`, re-check at most once per 60 s, never
   on a timer. With option E(a) the check uses a new read-only endpoint that does not slide the idle window.

## 5. Affected files

| File | Change |
| --- | --- |
| `app/src/live/session.ts` | `locked`, in-memory identity, failed-sign-out lock, `liveReadKey` lock key, return revalidation with a 60 s floor |
| `app/src/app/SessionContext.tsx` | `useSessionDraft` hides drafts while locked; a `useLocked()` hook |
| `app/src/app/useLiveRead.ts` | No logic change expected (the key carries the lock); test it |
| `app/src/screens/investigation/RecordDecision.tsx`, `ServerRecords.tsx` | Locked view, re-show gate, prune on re-show, stale-answer rule |
| Session bar component and `app/src/i18n/*` | Locked wording and "server logout unconfirmed" in EN and AR (RTL) |
| E(a) only: `server/src/auth/auth.controller.ts`, `server/src/auth/session/session.service.ts`, `postgres-session-store.ts` | A `GET /api/auth/session-state` that verifies the cookie **without touching** `last_seen_at`, same uniform 404, no body beyond the owner role and user id; rate-limited like sign-in |
| Tests | `app/src/live/session.test.ts`, `app/src/screens/investigation/recordDecision.test.ts`, new `app/e2e-live/session-lock.spec.ts`; E(a): `server/test/auth/session-state-http.spec.ts` |

No new dependency, no schema, no storage of any token or draft, no change to sign-in.

## 6. Tests (red first)

Unit (`session.test.ts`, fake fetcher): G1 `unavailable` and `error` after sign-in lock and change the read key, before sign-in
they do not; G3 a check returning another `user.id` clears all drafts; G5 failed sign-out locks and keeps the warning, a later
success unlocks and clears; G6 return revalidation fires once per 60 s at most and never on a timer; the identity is not in
`localStorage`, `sessionStorage` or any snapshot field.

Form (`recordDecision.test.ts`): G2 no draft text and no enabled control while locked; G4 after unlock the draft appears only
after the new read, and an id missing from that read is pruned with the "record left the list" notice; G6/stale: an answer
landing after the lock does not show a result or clear the draft.

Browser (`app/e2e-live`, real BFF, fake verifier, disposable Postgres): server unreachable mid-session locks the case and the
form (no record or draft text on screen) and unlocks on recovery with the draft back; failed sign-out (DELETE intercepted)
keeps the screen locked and says so; grant revoked while signed out, then sign in again: the revoked record and its citation do
not come back; reload drops the draft; a decision response delayed past expiry shows nothing and records nothing visible.
E(a) server: the new endpoint returns the same 404 for absent, malformed, expired, idle and revoked cookies and does not change
`last_seen_at` (asserted in the DB).

## 7. Acceptance

- Section 6 passes; `npm run check` in `server/` (E(a)), app typecheck/unit, `app-e2e` and `live-e2e` green in CI.
- While locked, no protected record, count, source reference or draft text is on screen, and no write can be sent.
- No token, identity or draft in browser storage or logs; reload loses the draft.
- EN/AR copy for every new string, RTL, keyboard focus moves to the locked notice.
- Reviewed (independent review, security review, CodeRabbit). Merge on green and your approval of this plan.

## 8. Decisions for the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| E | How to revalidate on return without extending idle life | **(a) a small read-only server check** (`GET /api/auth/session-state`, no touch, uniform 404). (b) Client-only: re-check `/auth/me` on return, which counts as activity and slides the idle window; simpler, but it does not meet R2's wording. |
| F | Failed sign-out: clear drafts locally anyway | **Yes**: the owner asked to sign out; the screen stays locked until the server confirms |
| G | Locked notice offers "Sign in again" (to `/sign-in`) and "Check again" | **Yes**, both; no automatic redirect |

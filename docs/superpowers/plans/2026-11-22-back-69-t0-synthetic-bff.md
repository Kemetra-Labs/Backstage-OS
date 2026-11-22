# BACK-69 T0: Kawalys synthetic BFF + Retail Tower error envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tiny Kawalys-owned NestJS 11 synthetic BFF in `server/` whose only routes are a process-up check and one synthetic evidence lookup, returning every error through a non-disclosing envelope extracted from Retail Tower with provenance.

**Architecture:** `server/` is a standalone npm package, isolated from the static prototype (root) and the React app (`app/`); nothing imports across. Retail Tower's pure `envelope.ts` and its tests are copied verbatim with a provenance header. A Kawalys wrapper (`safe-error.ts`) is the only way the app builds an envelope: fixed messages per code, no `details`, sanitized request ids. A global Nest exception filter routes every failure (including unknown routes and body-parser errors) through that wrapper.

**Tech Stack:** Node 24 (ADR-002 v2 PS-02; local runner has Node 22, see Global Constraints), NestJS 11.2.11 + Express adapter, TypeScript 5.9.3, Jest 29.7.0 + ts-jest 29.2.5, supertest.

**Spec:** Jira BACK-69 (description + owner comment 18363), ADR-002 v2 (Confluence 89423937), Retail Tower reuse matrix row #11 (Confluence 89423971). Owner T0 authorization and choices given in session on 22 Nov 2026: implement T0; backend in `server/`; add Apache-2.0 LICENSE/NOTICE to the repo; commit, push branch and open a PR, never merge.

## Global Constraints

- Donor: `Kemetra-Labs/Retail-Tower-Erp` at `dea1adc386ad6e8129e7342c873c74ea6f9e5b0c` (verified identical to RT `main` `510706c` for the two files). Never modify Retail Tower.
- Copy only `services/backend-core/packages/shared/src/errors/envelope.ts` and `services/backend-core/packages/shared/__tests__/errors/envelope.spec.ts`. No `@data-pulse-2/*` import, no other RT file. `correlation.ts` is deferred (needs `@opentelemetry/api`).
- Pinned versions: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing` = `11.2.11` (ruled 22 Nov: 11.1.19 pulls multer <=2.4.0 with 2 high advisories; ADR-002 v2 fixes the Nest 11 line, not the patch); `typescript` `5.9.3`; `jest` `29.7.0`; `ts-jest` `29.2.5`; `@types/jest` `29.5.14`. Exact versions, no ranges.
- Node: `server/.nvmrc` = `24` and `engines.node` = `">=24"` (owner approved runtime/language updates 22 Nov). Local default is 22.23.5, so the Node 24 suite runs via `npx -y node@24`; record PASS/FAIL/NOT RUN honestly.
- Synthetic only: no DB, auth provider, Descope, connectors, network calls, secrets, env files, queues, deploy. Server binds `127.0.0.1` only.
- A display persona header is not authorization. Every doc and code comment that mentions it says so.
- Unknown is never Healthy: the process route reports `process: "up"`, never `healthy`.
- M05-D05-B: a restricted record must be indistinguishable from an absent one (same status, body shape, headers apart from request id).
- No change to `index.html`, `js/`, `css/`, `tests/`, `app/`, `.github/`.
- Commit format `<type>: <description>`; end commits with the session attribution lines.

## Review Focus

1. Inbound `x-request-id` carrying CR/LF, an over-long or non-[A-Za-z0-9-] value: must not be echoed; a fresh UUID is used instead. (Task 3 test `requestIdFrom rejects ...`; Task 4 HTTP test.)
2. A thrown plain `Error("db password=...")`: response is 500 `internal_error` with the fixed message, no stack, no original text. (Task 4.)
3. Unknown route `GET /nope`: our 404 envelope, not Nest's default `Cannot GET /nope` text. (Task 4.)
4. Restricted `E-5` for Owner vs absent `E-999`: identical status, body (minus `request_id`), `content-type` and `content-length`. (Task 4.)
5. Malformed JSON body: 400 `validation_error` with the fixed message, no parser error text. (Task 4.)

---

### Task 1: Licence, rule amendment and `server/` scaffold

**Files:**
- Create: `LICENSE` (Apache-2.0 full text, copied byte-for-byte from RT `LICENSE` at donor SHA — standard text, no RT-specific content)
- Create: `NOTICE`
- Modify: `CLAUDE.md` (hard-rules bullet about backend), `package.json` (add `"license": "Apache-2.0"`)
- Create: `server/package.json`, `server/package-lock.json` (via npm install), `server/tsconfig.json`, `server/jest.config.js`, `server/.nvmrc`, `server/test/smoke.spec.ts`

**Interfaces:**
- Produces: `server/` npm scripts `build` (`tsc -p tsconfig.json`), `typecheck` (`tsc -p tsconfig.json --noEmit`), `test` (`jest`), `check` (`npm run typecheck && npm test`), `start` (`node dist/main.js`). `tsconfig`: `strict: true`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `module: commonjs`, `target: ES2022`, `rootDir: src`, `outDir: dist`; jest via ts-jest with `testMatch: ["<rootDir>/test/**/*.spec.ts"]` and its own `tsconfig` allowing `test/`.

- [ ] **Step 1:** `NOTICE` content:
  ```
  Backstage-OS (Kawalys Mission Control)
  Copyright 2026 Kemetra-Labs

  Licensed under the Apache License, Version 2.0. See LICENSE.

  This product includes software from Retail Tower Backend Core
  (https://github.com/Kemetra-Labs/Retail-Tower-Erp), Copyright 2026 Kemetra-Labs,
  licensed under the Apache License, Version 2.0. See server/THIRD_PARTY.md.
  ```
- [ ] **Step 2:** In `CLAUDE.md` replace the bullet `No customer data, secrets, backend or MCP connection added to the prototype.` with: `No customer data, secrets or MCP connection added to the prototype. The only backend is the synthetic Kawalys BFF in server/ (BACK-69 T0): no DB, auth provider, connectors, network calls or secrets; nothing in index.html, js/, css/ or app/ calls it yet.` Keep `Customers never sign in ...` sentence.
- [ ] **Step 3:** Create `server/package.json` (`"private": true`, `"license": "Apache-2.0"`, name `kawalys-bff`) and run `cd server && npm install --save-exact @nestjs/common@11.2.11 @nestjs/core@11.2.11 @nestjs/platform-express@11.2.11 reflect-metadata rxjs && npm install --save-exact -D @nestjs/testing@11.2.11 typescript@5.9.3 jest@29.7.0 ts-jest@29.2.5 @types/jest@29.5.14 @types/node@24 supertest @types/supertest`. Expected: lockfile written, `npm audit` summary recorded (not fixed).
- [ ] **Step 4:** `server/test/smoke.spec.ts`: `it('runs on Node >= 22', () => expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22))`. Run `cd server && npm run check`. Expected: typecheck clean (empty `src/index.ts` exporting nothing is acceptable for now), 1 test PASS.
- [ ] **Step 5:** Try Node 24: `cd server && npx -y node@24 --version`. If it prints `v24.*`, record that command for Task 5; if it fails, record NOT RUN with the error.
- [ ] **Step 6:** Commit `chore: add Apache-2.0 licence and scaffold synthetic Kawalys BFF (BACK-69)`.

### Task 2: Extract the Retail Tower error envelope with provenance

**Files:**
- Create: `server/src/errors/envelope.ts`, `server/test/errors/envelope.spec.ts`, `server/THIRD_PARTY.md`

**Interfaces:**
- Produces (unchanged from donor): `ErrorCodes` (const map), `type ErrorCode`, `interface ErrorEnvelope { error: ErrorEnvelopeBody }`, `ErrorEnvelopeBody { code: string; message: string; request_id: string; details?: unknown }`, `errorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelope`, `isErrorEnvelope(value: unknown): value is ErrorEnvelope`.

- [ ] **Step 1:** Copy donor test to `server/test/errors/envelope.spec.ts`; change only the import path to `../../src/errors/envelope`. Prepend a provenance comment (Step 3 wording).
- [ ] **Step 2:** Run `cd server && npx jest test/errors/envelope.spec.ts`. Expected: FAIL, cannot find module.
- [ ] **Step 3:** Copy donor `envelope.ts` byte-for-byte below this header:
  ```ts
  // Copied from Kemetra-Labs/Retail-Tower-Erp at dea1adc386ad6e8129e7342c873c74ea6f9e5b0c,
  // services/backend-core/packages/shared/src/errors/envelope.ts. Apache-2.0, Copyright 2026 Kemetra-Labs.
  // Unmodified below this header. Use safe-error.ts to build envelopes; it adds the non-disclosure rules.
  ```
  (test header: same, pointing at `__tests__/errors/envelope.spec.ts`, "import path changed only").
- [ ] **Step 4:** Run the test. Expected: all donor tests PASS (10).
- [ ] **Step 5:** Verify the copy: `diff <(git -C /home/user/kemetra-labs/retail-tower-erp show dea1adc386ad6e8129e7342c873c74ea6f9e5b0c:services/backend-core/packages/shared/src/errors/envelope.ts) <(tail -n +4 server/src/errors/envelope.ts)` prints nothing. Do the same for the spec with only the import line differing.
- [ ] **Step 6:** `server/THIRD_PARTY.md`: table of the two files (RT path, donor SHA, Kawalys path, change), licence Apache-2.0 with link to RT `LICENSE` and `services/backend-core/NOTICE` at the donor SHA, statement "no runtime dependency on @data-pulse-2/*, no shared credentials, Retail Tower unchanged", and rollback "delete server/src/errors/envelope.ts and its test".
- [ ] **Step 7:** Commit `feat: extract Retail Tower error envelope with provenance (BACK-69)`.

### Task 3: Non-disclosing Kawalys wrapper

**Files:**
- Create: `server/src/errors/safe-error.ts`, `server/test/errors/safe-error.spec.ts`

**Interfaces:**
- Consumes: `errorEnvelope`, `ErrorCodes`, `ErrorEnvelope` from Task 2.
- Produces:
  - `type SafeErrorCode = 'not_found' | 'validation_error' | 'rate_limited' | 'internal_error'` (no `forbidden`/`unauthorized`: a denied read is reported as `not_found`, M05-D05-B).
  - `SAFE_MESSAGES: Readonly<Record<SafeErrorCode, string>>` = `not_found`: `"Not found."`, `validation_error`: `"The request is not valid."`, `rate_limited`: `"Too many requests."`, `internal_error`: `"Something went wrong."`.
  - `STATUS_FOR: Readonly<Record<SafeErrorCode, number>>` = 404, 400, 429, 500.
  - `safeErrorEnvelope(code: SafeErrorCode, requestId: string): ErrorEnvelope` — never sets `details`.
  - `requestIdFrom(header: string | string[] | undefined): string` — returns the header only if it is a single string matching `/^[A-Za-z0-9-]{8,64}$/`, else `crypto.randomUUID()`.

- [ ] **Step 1: Failing tests** (`safe-error.spec.ts`):
  - `safeErrorEnvelope returns the fixed message and no details for every code`: for each code, `env.error.message === SAFE_MESSAGES[code]`, `!('details' in env.error)`, `isErrorEnvelope(env)`.
  - `does not offer forbidden or unauthorized`: `Object.keys(SAFE_MESSAGES).sort()` equals `['internal_error','not_found','rate_limited','validation_error']`.
  - `requestIdFrom keeps a well-formed id`: `requestIdFrom('req-1234abcd') === 'req-1234abcd'`.
  - `requestIdFrom rejects CR/LF, too long, too short, arrays and undefined`: inputs `'abc\r\nSet-Cookie: x=1'`, `'a'.repeat(65)`, `'short'`, `['req-1234abcd','req-5678efgh']`, `undefined` each return a value matching `/^[0-9a-f-]{36}$/` and not equal to the input.
- [ ] **Step 2:** Run `npx jest test/errors/safe-error.spec.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `safe-error.ts` per Interfaces.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: add non-disclosing error envelope wrapper (BACK-69)`.

### Task 4: Nest app — filter, process route, synthetic evidence route

**Files:**
- Create: `server/src/app.module.ts`, `server/src/main.ts`, `server/src/http/safe-error.filter.ts`, `server/src/http/request-id.ts`, `server/src/health/process.controller.ts`, `server/src/demo/evidence.fixture.ts`, `server/src/demo/evidence.controller.ts`, `server/src/create-app.ts`, `server/test/http/app.spec.ts`
- Delete: `server/src/index.ts` if created in Task 1

**Interfaces:**
- Consumes: Task 3 exports.
- Produces:
  - `createApp(): Promise<INestApplication>` in `create-app.ts`: builds the app with `SafeErrorFilter` as global filter and the request-id middleware; used by `main.ts` and tests. `main.ts` listens on `127.0.0.1`, port `Number(process.env.KAWALYS_BFF_PORT ?? 8787)`.
  - Request-id middleware: sets `req.requestId = requestIdFrom(req.headers['x-request-id'])` and response header `x-request-id`.
  - `SafeErrorFilter implements ExceptionFilter` (`@Catch()` everything): `HttpException` 404 → `not_found`; 400/422 → `validation_error`; 429 → `rate_limited`; 401/403 → `not_found` (404); anything else, non-HTTP errors included → `internal_error` (500). Body = `safeErrorEnvelope(code, requestId)`, status `STATUS_FOR[code]`. Never logs or returns `exception.message`/stack.
  - `GET /process` → `200 { service: "kawalys-bff", process: "up", synthetic: true }`.
  - Fixture: `EVIDENCE: readonly { id: string; visibility: 'all' | 'technical'; title: string }[]` = `{ id: 'E-1', visibility: 'all', title: 'Synthetic build log summary' }`, `{ id: 'E-5', visibility: 'technical', title: 'Synthetic error read' }`.
  - `GET /demo/evidence/:id` with header `x-kawalys-demo-persona` (`technical | owner | nontechnical`, default `nontechnical`; comment: display persona, not authorization): returns `200 { id, title, synthetic: true }` when found and visible; otherwise throws `NotFoundException`. Unknown persona value → treated as `nontechnical`.
  - A test-only route is not added; Review Focus #2 is tested by a module that overrides `/demo/boom`… instead: test registers an extra controller via `Test.createTestingModule({ imports: [AppModule], controllers: [BoomController] })` where `BoomController` throws `new Error('db password=hunter2')`. `createApp` therefore accepts an optional `extraControllers: Type[]` parameter: `createApp(extraControllers?: Type<unknown>[])`.

- [ ] **Step 1: Failing tests** (`test/http/app.spec.ts`, supertest against `createApp()`):
  - `GET /process is up and synthetic, never "healthy"`: 200, body equals the object above, `JSON.stringify(body)` does not contain `healthy`.
  - `technical reads E-5; E-1 readable by all`: technical → 200 with `id: 'E-5'`; owner `E-1` → 200.
  - `restricted E-5 is indistinguishable from absent E-999 for owner and nontechnical`: for each persona, both responses 404; bodies equal after deleting `error.request_id`; `content-type` equal; `content-length` equal when both sent the same `x-request-id: req-aaaaaaaa` (use same id for both requests so lengths match exactly); body text contains neither `E-5` nor `technical` nor `Synthetic error read`.
  - `unknown route returns our envelope`: `GET /nope` → 404, `isErrorEnvelope(body)`, text does not contain `Cannot GET`.
  - `thrown Error leaks nothing`: `/boom` → 500, `error.message === 'Something went wrong.'`, text contains neither `hunter2` nor `password` nor `at `.
  - `malformed JSON gives a fixed 400`: `POST /process` with `content-type: application/json` body `{"a":` → 400 `validation_error`, text contains no `Unexpected` / `JSON`. (If Nest returns 404 for POST on a GET-only route before parsing, assert 404 envelope with no parser text instead and note which in the test name.)
  - `x-request-id is echoed only when well-formed`: `req-1234abcd` echoed in header and body; `abc\r\n` cannot be sent by supertest, so use `'a'.repeat(100)` → header and body carry a UUID instead.
  - `nest does not advertise itself`: response has no `x-powered-by` header (call `app.getHttpAdapter().getInstance().disable('x-powered-by')` in `createApp`).
- [ ] **Step 2:** Run `npx jest test/http`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the files per Interfaces.
- [ ] **Step 4:** Run `npm run check`. Expected: all suites PASS, typecheck clean.
- [ ] **Step 5:** Boot check: `npm run build && (KAWALYS_BFF_PORT=8799 node dist/main.js & echo $! > /tmp/bff.pid); sleep 2; curl -s 127.0.0.1:8799/process; curl -s 127.0.0.1:8799/demo/evidence/E-5; kill $(cat /tmp/bff.pid)`. Expected: process body; 404 envelope.
- [ ] **Step 6:** Commit `feat: add synthetic Kawalys BFF with process and evidence routes (BACK-69)`.

### Task 5: README, full verification, Jira and PR

**Files:**
- Create: `server/README.md`
- Modify: `README.md` (one short "Synthetic BFF (server/)" section pointing at `server/README.md`)

- [ ] **Step 1:** `server/README.md`: purpose and limits (synthetic, not authorization, no DB/auth/connectors), commands (`npm ci`, `npm run check`, `npm run build`, `npm start`, port env var), routes table, provenance pointer to `THIRD_PARTY.md`, rollback (delete `server/`, revert `CLAUDE.md`/`NOTICE`/`LICENSE`/`README.md` lines), out of scope list (BACK-55/56/58, correlation helper, Nest 12).
- [ ] **Step 2: Verify on exact SHA** and record each as PASS/FAIL/NOT RUN with the command:
  - `cd server && npm ci && npm run check` (Node 22.23.5).
  - Same on Node 24 using the Task 1 Step 5 command, if it worked.
  - `cd app && npm run check` (existing app untouched).
  - Root: `npx playwright test --project=chromium --trace off` (prototype untouched); webkit is NOT RUN locally if its browser is not installed.
  - `git diff --stat main...HEAD -- index.html js css tests app .github` prints nothing.
  - `cd server && npm audit --omit=dev` summary.
- [ ] **Step 3:** Commit `docs: document the synthetic BFF and its limits (BACK-69)`; push branch; open PR to `main` using the repo PR template if present, with the verification table and a "Not done / still gated" list. Never merge.
- [ ] **Step 4:** Comment on BACK-69: owner T0 authorization recorded (date, scope as above), PR link, verification table, what remains gated (BACK-47 exit criteria, Nest 12, correlation helper, DB/auth/connectors, CI job for `server/`). Do not change the ticket status.

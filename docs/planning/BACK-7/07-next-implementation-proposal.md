# 07 — Next implementation proposal (outline for a separate ticket)

Status: **Proposal.** This becomes a new BACK ticket only after the owner accepts ADR-01, ADR-03 and ADR-04 and
signs the gate in §8. Nothing below is authorised by BACK-7.

## 1. Title

Kawalys G2 — read-only GitHub CI evidence for one project (BFF + REST adapter), behind synthetic-first tests.

## 2. Scope

In: one BFF, one project, one repo, one workflow, read-only, polling with TTL, the four GET endpoints in 03 §3, UI
switch from fixture to BFF for the Investigation Room behind a flag (fixture stays the default).
Out: Jira, webhooks, logs, AI, writes, other providers, production telemetry, tenant data, deployment beyond a lab.

## 3. Module boundaries (assuming ADR-01 option A)

```
server/                      new, own package.json + lockfile
  src/http/                  routes, envelope, error mapping (03 §3–4)
  src/auth/                  session check (IdP adapter; stub IdP in tests only)
  src/scope/                 scope tuple, project→repo config, deny by default (ADR-03 §2)
  src/evidence/              normaliser (03 §6), rule re-use from app/src/contract
  src/connectors/github/     GitHubRestAdapter implementing SourceAdapter (ADR-04 §3)
  src/audit/                 audit + upstream call logs (ADR-03 §6)
  test/fixtures/github/      sanitised recorded JSON
app/src/data/                client fetcher; fixture remains default
```

Sharing `app/src/contract` with `server/` needs a small decision (path import vs a shared `contract/` package).
Decide in the ticket; do not duplicate the rules.

## 4. Dependencies (to justify individually in the ticket)

HTTP framework (Fastify or Hono), runtime schema validation, official GitHub REST client or plain `fetch`, test fake
server. Each: exact pin, published ≥ 2 weeks, `--ignore-scripts`, licence check. No database.

## 5. Acceptance criteria

- All P1–P5 and N1–N17 in 06 pass in CI (chromium + webkit for e2e).
- Server-side rule parity tests: same inputs give the same `resolveHealth` / `effectiveFreshness` / `countDisplay`
  on server and client.
- Every endpoint has an authz test for every role × in-scope / out-of-scope project.
- No secret in repo, logs, responses or test artefacts (secret scan clean).
- Fixture mode still works offline and remains the default; demo marker shown whenever `synthetic` is true.
- `app/` and `server/` both run in the required CI job (01 §4 done first or in the same ticket).

## 6. Operational cost (estimate, unverified)

One small container or serverless function and a secret store. GitHub API use per refresh = 1 runs call + 1 jobs
call per run read (+1 per extra page). Reading the latest run for one ref at a 60 s TTL: about 2–3 calls/minute,
120–180/hour, roughly 2–4% of a 5,000/h token budget and far below the 900 points/min secondary limit. Hosting price
depends on ADR-08.

## 7. Rollback and STOP conditions

Rollback: turn the UI flag off (back to fixture); revoke the GitHub token / uninstall the App; remove the deployment.
No data migration exists, so rollback is complete.

STOP and return to the owner if any of these happen:
- the read needs any write permission, org-wide scope or a classic `repo` token;
- a test shows `healthy` from missing, stale, unconfigured or unauthorised data;
- any secret or log text reaches a browser or a log line;
- cross-project data appears in a response;
- a new dependency, provider, database or host is needed that the ticket did not name;
- GitHub returns data the normaliser cannot map, for more than the malformed-item path.

## 8. Human approval gate (required before any real-data work)

The owner confirms in Jira, in writing, each of:

1. ADR-01 option chosen (TS or Python).
2. ADR-03 accepted, including the IdP choice or an approved lab-only stub.
3. ADR-04 accepted, with all "unverified" items resolved.
4. Candidate repo and workflow named (06 §1).
5. Credential type, owner, scope (one repo, Actions read), expiry and storage location named. **The credential is
   created by the owner**, not by an agent.
6. Lab environment named; no production or tenant data.
7. The implementation ticket created with this outline, and permission to branch, commit and open a PR for it.
8. If a failing run must be produced (06 §1), explicit permission for that push, naming the repo and branch.
   Otherwise an existing failed run is used.

Until all of these are recorded, implementation stays at synthetic fixtures only.

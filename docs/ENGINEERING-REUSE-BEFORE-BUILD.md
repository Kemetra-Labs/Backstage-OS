# Engineering rule: Reuse before build

Status: mandatory engineering policy (owner, 2026-11-23).
Source repository: `Kemetra-Labs/Retail-Tower-Erp`. Target repository: `Kemetra-Labs/Backstage-OS`.

**Search first. Reuse what works. Adapt what differs. Build only what is missing.**

## Principle

Before implementing new functionality in Kawalys, check whether equivalent or reusable functionality already exists in:

1. the current Kawalys codebase;
2. the approved Retail Tower reuse inventory (the BACK-14 audit, `docs/planning/BACK-14/`, and the 26-candidate Retail Tower Reuse Matrix v2);
3. the relevant Retail Tower source code and tests.

Do not rebuild from scratch when a proven, compatible implementation can be reused or adapted safely.

## Workflow (per approved implementation task)

1. **Inspect Kawalys.** Check whether the functionality exists. Prefer extending existing code over creating duplicates. Preserve the architecture and contracts.
2. **Check Retail Tower.** Consult the BACK-14 audit and Matrix v2, then the relevant source files and their tests. Verify the current source revision and its dependencies. Search beyond the inventory only when the feature needs it. Do not repeat the full audit for every task.
3. **Choose a strategy.**
   - **COPY**: reuse a self-contained implementation and its tests with minimal modification.
   - **ADAPT**: extract proven logic and adapt project-specific dependencies and domain types.
   - **EXTRACT**: isolate a reusable component from a larger implementation.
   - **REFERENCE**: reuse an architectural pattern or test strategy when copying is unsuitable.
   - **BUILD**: write new code only when the alternatives are unsuitable or would add excessive coupling.
4. **Validate.** For every reused component: verify functional compatibility; keep provenance, licensing and notices; adapt names, contracts and dependencies to Kawalys; reuse and extend the relevant tests; run regression and negative tests; confirm there is no runtime dependency on Retail Tower.

## Independence

Retail Tower and Kawalys are separate products. Reuse does not mean sharing runtimes, databases, users, credentials, sessions, business logic or infrastructure. Copied or adapted code becomes independently maintained Kawalys code. Never modify Retail Tower to support Kawalys unless a separate task explicitly authorizes it.

## Security and architecture

- Never blindly copy authentication, authorization, multi-tenancy or RLS implementations.
- Preserve the Kawalys permission and evidence-scoping contracts. Persona remains a display switch on synthetic data; X02/X04 are not delivered.
- Security-sensitive adaptations need their applicable approval and negative-test gates.
- Never transfer secrets, production data or project-specific configuration.
- No unnecessary abstractions, dependencies or duplicate modules. Respect the scope and approval boundaries of the current task (this rule does not authorize new dependencies, schema, auth or CI changes).

## No unnecessary blocking

Reuse assessment is part of implementation, not a separate research project. If an existing implementation is clearly suitable and the task authorizes its use, proceed with reuse and tests. Do not repeatedly ask for approval for decisions already documented. Escalate only when reuse needs changes outside the approved scope, brings material security or licensing risk, or conflicts with an existing architecture decision.

## Required report in every relevant PR

1. Whether existing Kawalys or Retail Tower code was inspected.
2. Which implementation was selected, with source path and revision when reused.
3. Strategy: COPY / ADAPT / EXTRACT / REFERENCE / BUILD.
4. Why that strategy was chosen.
5. Tests and compatibility evidence.
6. Remaining risks or deferred reuse opportunities.

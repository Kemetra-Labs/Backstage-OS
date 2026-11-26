# CI on Depot runners (trusted main only)

Status: proposed, awaiting review and merge. Tracker: BACK-112. This page documents the `runs-on` routing in `.github/workflows/ci.yml` for the jobs `app-e2e` and `server`.
Scope: infrastructure only. No test, shard, classifier, gate or job-name change. The repository stays public. Depot CI (`.depot/workflows`) is not used.

## What changed

| Job | Pull requests, forks, other refs | Push to `main`, manual run on `main` |
|---|---|---|
| `classify`, `root`, `app-check`, `g1`, `gate` | `ubuntu-latest` | `ubuntu-latest` (unchanged) |
| `app-e2e` (4 jobs), `server` | `ubuntu-latest` | `depot-ubuntu-24.04-4` (4 vCPU, 16 GB) |

The expression, identical in both jobs:

```
github.repository == 'Kemetra-Labs/Backstage-OS' && github.ref == 'refs/heads/main'
  && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
  && vars.DEPOT_RUNNERS != 'off' && 'depot-ubuntu-24.04-4' || 'ubuntu-latest'
```

Also changed in those two jobs: `actions/checkout` now has `persist-credentials: false` (no step pushes, so the token is not left in `.git/config` on a shared runner image).

`gate` and `classify` stay on GitHub-hosted runners so the required check `Playwright (chromium + webkit)` keeps being reported by the GitHub Actions app (check source app id 15368, as in branch protection) and a Depot outage can never remove it.

## Security model

1. **The routing expression is defence in depth, not the barrier.** Pull requests (same repo or fork) and `workflow_dispatch` from other branches resolve to `ubuntu-latest` through the ternary. But a pull request run reads `ci.yml` from its own merge ref, so a same-repo PR author, or a fork contributor after a maintainer's approval click, can write `runs-on: depot-ubuntu-24.04-4` unconditionally, and the ternary does nothing against that. **The only barrier for that case is item 2. It is an organization setting this session could not verify: do not merge until it is confirmed.**
2. **Runner group allowlist (owner setting, NOT verified from this session).** The Depot runner group must restrict workflows to `Kemetra-Labs/Backstage-OS/.github/workflows/ci.yml@refs/heads/main`. With that pin, a run on `refs/pull/N/merge` or on a feature branch cannot use the group even if it asks for the label: the job waits unassigned and never runs. A stronger confirmation (needs a pushed branch, so it needs the owner's approval): open a throwaway same-repo PR whose workflow requests the Depot label unconditionally and check that its job stays queued, then close the PR.
   **Trust model:** "trusted main" means anyone with write access. Branch protection has no required reviews and does not enforce admins (checked), so a collaborator can merge their own PR and that code then runs on Depot. Acceptable for a one-person team; revisit when contributors are added.
3. **No other group may serve Depot labels or accept public repositories without the pin.** Not verified from this session (see "Open verification").
4. **Token and secrets.** Workflow-level `permissions: contents: read` is unchanged and repository default workflow permissions are `read` with `can_approve_pull_request_reviews: false` (checked). These jobs use no secrets. `pull_request_target` is not used anywhere and must not be added to this workflow.
5. **Fork pull requests.** Repository setting `fork-pr-contributor-approval` is `all_external_contributors` (checked): every external contributor's workflow run needs maintainer approval. Even after approval the job runs on GitHub-hosted runners.
6. **Cache isolation.** Per Depot's documentation (not verified here), Depot runners transparently use Depot Cache for `actions/setup-node` (`cache: npm`), scoped by repository with no branch isolation. Because only trusted main runs execute on Depot runners, nothing from a PR can write to it, if the pin in item 2 holds. Do not move PR jobs to Depot runners without revisiting this (see the follow-up design). Depot cache disks (`depot/cache-mount`) are organization-wide and are not used here.
7. **Credential persistence.** Checkout does not persist the token (above). Per Depot's documentation (not verified here), runners are ephemeral EC2 instances that are never reused.
8. **Kill switch.** Repository variable `DEPOT_RUNNERS=off` sends the next run back to `ubuntu-latest` without a code change.

## Open verification (owner, one-time, before merging)

This session's token cannot read organization runner settings (`admin:org` scope missing). Please confirm, or run the commands after `gh auth refresh -h github.com -s admin:org`:

```powershell
gh api orgs/Kemetra-Labs/actions/runner-groups --jq '.runner_groups[] | {name, visibility, allows_public_repositories, restricted_to_workflows, selected_workflows}'
gh api orgs/Kemetra-Labs/actions/runners --jq '.runners[] | {name, labels: [.labels[].name]}'
```

Expected: exactly one group serves the label `depot-ubuntu-24.04-4`; it has `restricted_to_workflows: true` with `selected_workflows` equal to the single `ci.yml@refs/heads/main` entry; every other group either contains no Depot runners or has `allows_public_repositories: false`.

**The Default-group question (blocks merge).** Depot's documentation says its runners register in the organization's **default** runner group, and its setup guide asks you to enable "Allow public repositories" on Default. If the Depot runners live in Default, pinning Default to one workflow affects the whole organization, and leaving Default unpinned means a Backstage-OS pull request that edits `runs-on` could run on Depot, which is exactly the bypass this design must prevent. Confirm that the Depot runners are in a **dedicated** group (not Default) and that Default either has no Depot runners or does not allow public repositories. Also confirm that no other repository needs the label: a search of the default-branch workflow files of all 8 Kemetra-Labs repositories for `depot-ubuntu` found 0 hits on 2026-11-26 (GitHub code search can lag), and `depot jobs` could not list actual usage because it needs a Depot organization token, which this session does not have. Retail-Tower-Erp's earlier Depot runs were Depot CI runs, not runner jobs.

Checked from this session with `gh api` on 2026-11-26 (`repos/Kemetra-Labs/Backstage-OS/branches/main/protection`, `.../actions/permissions/workflow`, `.../actions/permissions/fork-pr-contributor-approval`, `.../actions/runners`): branch protection on `main` requires only `Playwright (chromium + webkit)` (source GitHub Actions, app id 15368, `strict: false`, no required reviews, admins not enforced); default workflow permissions `read`; fork PR approval `all_external_contributors`; no repository-level self-hosted runners registered. Everything said about Depot's own behaviour (cache scope, ephemeral instances, runner group registration) comes from Depot's documentation and was not tested.

## Validation done before review

- `ci.yml` parses; the job set, names, `needs`, matrices, shard counts and `if:` conditions are identical to `main` (only `runs-on` and the checkout `with:` differ in two jobs).
- Routing simulation (a Python re-implementation of the logic, not GitHub's own evaluation; GitHub parses the real expression for the first time on push): push main and manual run on main use Depot; pull request (same repo or fork), manual run on another branch, a push to a fork's own main, and `DEPOT_RUNNERS=off` use `ubuntu-latest`.
- Run in this session on 2026-11-26: `bash .github/scripts/test-classify-changes.sh`: 41 passed. `bash .github/scripts/test-ci-gate.sh`: 19 passed. (They do not read runner labels.)
- The workflow cannot be run on Depot runners without pushing; the first run after merge is the activation test (below).

## Activation and benchmark

Because the PR run itself stays on GitHub-hosted runners, activation happens on the first push to `main` after merge (the workflow change is a `.github/` change, so the classifier selects every suite). Then:

```powershell
# the five heavy jobs of that run, with runner label, duration, status
gh api repos/Kemetra-Labs/Backstage-OS/actions/runs/<run-id>/jobs --jq '.jobs[] | [.name, .runner_name, .labels[0], .started_at, .completed_at, .conclusion] | @tsv'
depot jobs --repo Kemetra-Labs/Backstage-OS --runner-label depot-ubuntu-24.04-4 --output json
depot jobs metrics <github-job-id> --repo Kemetra-Labs/Backstage-OS --output json   # CPU and memory
depot jobs analytics --repo Kemetra-Labs/Backstage-OS --job "App e2e" --output json
```

Record at least three runs. Compare with the GitHub-hosted baseline (run 45858400387, 2026-11-26): chromium 1034 s, WebKit shards 812, 860, 581 s, server 54 s, whole run 1061 s. Expected from the Depot CI pilot, **not yet measured on runners**: about 1.65x faster per job. Accept if test counts are unchanged (chromium 1242 passed + 59 skipped, WebKit 1225 passed + 76 skipped across shards; server 49 suites, 753 tests) and there are no new failures or flakes. Confirm Docker and Testcontainers work on the first `server` job.

## Rollback

1. Fastest, no PR: set the repository variable and re-run.
   ```powershell
   gh variable set DEPOT_RUNNERS --body off --repo Kemetra-Labs/Backstage-OS
   gh workflow run ci.yml --ref main --repo Kemetra-Labs/Backstage-OS
   ```
   Use a fresh `workflow run` (manual runs always select every suite). Do not rely on `gh run rerun`: whether a re-run re-reads `vars` was not verified. The variable only affects runs that start after it is set. A job already queued for a Depot runner that never gets one (Depot outage, the pin rejecting it, the Depot app uninstalled, a label typo) is **not** bounded by `timeout-minutes`, which only starts when a runner picks the job up; GitHub's own queue limit is much longer (about a day, from memory, not verified), and the `gate` of that run waits for it. So always cancel the stuck run first with `gh run cancel <run-id>` (or `POST /repos/Kemetra-Labs/Backstage-OS/actions/runs/<id>/force-cancel`), then start the fresh run.
2. Revert the PR (restores `ubuntu-latest` in both jobs).
3. Stop the leak of cost or access entirely: remove the workflow pin or the repository from the runner group, or uninstall the Depot GitHub App.

Merge protection for pull requests is unaffected by a Depot outage: PR runs never use Depot and the required check comes from `gate`, which never leaves GitHub-hosted runners. The `gate` result on the push-to-`main` commit itself is affected while a Depot job is stuck or failing (it waits or goes red), which is why step 1 says to cancel and re-run.

## Follow-up design: trusted internal PRs on Depot (not implemented)

Goal: speed up PRs from people with write access without letting external forks or untrusted code near Depot runners or Depot Cache.

Constraints found:
- A PR run has `github.ref = refs/pull/N/merge`, so the main-pinned allowlist will not match it. That is a feature today and the main obstacle for this follow-up.
- Depot Cache has no branch isolation, so any PR job on Depot can write caches that main jobs later read (cache poisoning). Either disable Depot Cache for those jobs (org setting, applies to all Depot jobs) or keep trusted-PR jobs from restoring caches written by main.

Options, in the order I would evaluate them:
1. **Pinned manual run (`workflow_dispatch` on main, input `sha`).** A new main-only workflow checks out the given SHA, verifies it belongs to a same-repo PR branch (head repository equals this repository), runs read-only with no secrets and `persist-credentials: false`, and reports through a commit status. Dispatch needs write access, so it is a maintainer action; the allowlist stays pinned to main. Cost: the required check must still come from the normal PR run on GitHub-hosted runners, so this speeds up feedback, not the gate.
2. **A second runner group for same-repo PRs only**, allowed for `ci.yml@refs/pull/*/merge` if GitHub's workflow allowlist accepts ref patterns (not verified; if it does not, this option is closed). Every PR job would additionally need `github.event.pull_request.head.repo.full_name == github.repository`. Anyone with write access can edit the workflow in their PR, which is acceptable for a one-person team and must be revisited when contributors are added.
3. **Merge queue:** run the heavy suite on `merge_group` events on Depot runners after review. Needs GitHub merge queue enabled and a separate allowlist entry; not evaluated.

Whatever is chosen: never `pull_request_target` for code from the PR; keep read-only token and zero secrets on Depot jobs; add Depot egress filtering (org settings, Linux runners: default deny, allow only the npm registry, GitHub, Playwright download hosts, Depot and AWS service ranges) before any PR job runs there.

## Further speed (separate PRs, later)

Measured on Depot CI in the benchmark rounds (`depot-poc.md`, `depot-poc-round2.md` in the shared notes), not on runners: native shards 3 to 6, timing-balanced splitting (`depot/tests-run-action`, only inside Depot CI or Depot runner jobs), `--workers=2` (1.4x to 1.7x per job, no failures in repeated runs), cache disk (saves 5 to 8 s per job). Each needs its own review; none is part of this change.

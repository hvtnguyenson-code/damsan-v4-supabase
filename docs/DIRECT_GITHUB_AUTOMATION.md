# Direct GitHub Execution Workflow

**Task:** DEV-AUTOMATION-000  
**Repository:** `hvtnguyenson-code/damsan-v4-supabase`  
**Canonical local clone:** `D:\Kiem_tra_Online_V4_Supabase`

## 1. Purpose

This document defines the default development control plane for this repository. ChatGPT may inspect, edit, commit, open pull requests, review CI, and merge through the authorized GitHub connection. Local coding agents are optional fallbacks, not the default executor.

GitHub `main` is the authoritative source between local synchronization checkpoints. The local clone must be synchronized periodically and always before a local agent is asked to work.

## 2. Non-negotiable safety rules

1. Never edit or commit directly to `main`.
2. Resolve the exact current `main` SHA immediately before creating a task branch.
3. Create each task branch from that exact SHA. Use `feat/`, `fix/`, or `chore/` naming according to scope.
4. Keep each task scoped. Do not mix unrelated cleanup or refactoring into a functional change.
5. Review the changed-file set and semantic diff before merge.
6. Run the required CI/test class for the task. A failing required check blocks merge.
7. Merge only the reviewed PR head. Use the PR's exact expected head SHA so a moved head cannot be merged accidentally.
8. No force-push, history rewrite, rebase, or amend by default. Use forward commits for corrections.
9. If `main` moves while a task is in progress, re-evaluate the branch against the new `main` before merge. Never assume the original baseline is still current.
10. After merge, verify the final `main` SHA and wait for any main-triggered automation that can create an additional commit before declaring the task complete.
11. Database/schema mutations must follow the repository's migration and Supabase security conventions. Do not weaken RLS/auth boundaries merely to make tests pass.
12. Never expose `.env`, credentials, service-role keys, staff tokens, or other secrets in commits, PR bodies, logs, or generated artifacts.

## 3. Standard task lifecycle

### G0 — Baseline

- Read current `main` SHA.
- Confirm the intended repository is exactly `hvtnguyenson-code/damsan-v4-supabase`.
- Inspect relevant code, tests, migrations, and existing invariants before editing.
- Record the baseline SHA in the task/PR summary.

### G1 — Branch

Create a dedicated branch from the exact G0 SHA. Never branch from a stale remembered SHA.

### G2 — Implement

Make only the changes required by the task. Prefer an atomic logical change. For multi-file work, preserve cross-file consistency and update tests/contracts together.

### G3 — Pre-PR review

Before opening the PR:

- verify the branch is based on the intended baseline;
- inspect the complete changed-file list;
- inspect the semantic diff;
- check for accidental secrets or unrelated changes;
- ensure formatting/whitespace checks are clean where applicable.

### G4 — Pull request

Open a PR to `main` with:

- task purpose;
- exact baseline SHA;
- changed files/areas;
- invariants preserved;
- tests expected to run;
- any required real-device smoke steps.

### G5 — CI and correction loop

Read GitHub Actions results directly. If a required job fails, inspect the failing job/log, make a forward correction commit on the same task branch, then re-run/re-observe CI. Do not merge around a failing required check.

### G6 — Final merge gate

Immediately before merge:

- refresh PR metadata;
- confirm expected head SHA;
- confirm required checks are successful;
- confirm no unresolved semantic issue remains;
- compare branch with current `main` if `main` has moved.

Merge using the exact expected head SHA.

### G7 — Post-merge verification

After merge:

- verify the PR is actually merged;
- read the resulting `main` SHA;
- observe main-triggered workflows;
- if an automation creates another main commit, use the resulting stabilized SHA as the new canonical GitHub baseline;
- record whether a local synchronization checkpoint is now due.

## 4. Test classification

Every task must be classified before merge.

| Class | Required verification | Typical use |
| --- | --- | --- |
| `CI_ONLY` | Static/unit/simulation checks in GitHub Actions | Pure logic, validators, schema contracts, documentation, deterministic transformations |
| `CI_BROWSER` | CI plus automated browser/integration coverage where available | Teacher/student UI flows, browser state, rendering, room actions |
| `CI_REAL_SMOKE` | CI plus a short real-machine/user smoke test | PWA/service-worker cache, native file picker/download, Windows/browser-specific behavior, production-only interaction that must not be exercised destructively by CI |

Local testing is not mandatory for every task. It is required only when the task's risk cannot be represented reliably in GitHub CI or a safe staging/integration environment.

## 5. GitHub ↔ local synchronization policy

Direct GitHub development means the local clone can become stale. It must not silently become an alternate source of truth.

### Periodic checkpoint

By default, synchronize the canonical local clone **after every 3 merged direct-GitHub tasks**. Synchronize earlier when changes are large or tightly coupled.

### Mandatory immediate synchronization

Synchronize before any of the following:

- running Antigravity, Codex, Claude Code, or another local coding agent on this repository;
- performing a local real-device smoke test that depends on current source;
- starting a local emergency fix;
- making a release/deployment decision from the local clone;
- after significant database schema/migration, dependency, build, CI/workflow, or repository-structure changes.

### Safe PowerShell synchronization

First inspect the local state; do not overwrite local work blindly:

```powershell
cd D:\Kiem_tra_Online_V4_Supabase

git branch --show-current
git status --short
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

If the worktree is not clean, stop and reconcile deliberately. Do not use reset/clean as an automatic remedy.

If the worktree is clean and the repository is on `main`:

```powershell
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Synchronization is PASS only when:

- local branch is `main`;
- local `HEAD` equals `origin/main`;
- `git status --short` is empty.

Before a local agent starts work, refresh `origin/main` again and give the agent the exact verified SHA as its baseline.

## 6. Concurrent-main policy

If another PR or automation advances `main` while a task branch is open:

- do not force-push or rewrite the branch merely to make SHAs look linear;
- inspect the new main delta and determine whether it affects the task;
- if independent and GitHub reports the PR safely mergeable, continue only after re-running required checks against the effective merge state when available;
- if interacting or uncertain, update the task with a forward integration/correction strategy or recreate the task branch from current `main` and reapply the intended change;
- re-review the final diff before merge.

Correctness is more important than preserving an old branch.

## 7. Fallback policy

If the GitHub connector temporarily loses write capability:

1. keep GitHub read/review as the control plane if available;
2. do not modify `main` manually;
3. use a local agent or PowerShell only as a controlled fallback on a dedicated branch;
4. preserve the same baseline, test, PR, and merge gates defined here;
5. restore the direct GitHub path when access returns.

No fallback may bypass CI or exact-SHA verification.

## 8. DEV-AUTOMATION-000 qualification gates

This workflow is considered qualified only after one real docs-only PR demonstrates the full path:

- `G1` exact main read — PASS required;
- `G2` branch creation from exact main SHA — PASS required;
- `G3` repository write/commit — PASS required;
- `G4` PR creation — PASS required;
- `G5` GitHub Actions observation — PASS required;
- `G6` required CI success — PASS required;
- `G7` merge using the reviewed expected head SHA — PASS required;
- `G8` post-merge main verification — PASS required.

After these gates pass, direct GitHub execution becomes the default workflow for this repository. Local agents remain available for tasks requiring a real local environment or as a temporary fallback.

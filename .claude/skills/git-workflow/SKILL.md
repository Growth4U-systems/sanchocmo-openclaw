---
name: git-workflow
description: Use BEFORE creating any branch, commit, PR, or release in sanchocmo-openclaw — the repo's mandatory git conventions. Triggers whenever you are about to `git checkout -b`, name a branch, write a commit message, open a PR (`gh pr create`), pick a merge method, or cut/ship a release. Covers branch naming (`<author>/san-<n>-<desc>`), Conventional Commits, squash-to-staging, the main-ff-only rule, and the release + hotfix flow.
---

# Git workflow — sanchocmo-openclaw

Authoritative summary for agents. Full detail: `docs/CONTRIBUTING.md`. **These
rules are mandatory — follow them without being asked.**

## The one model

`staging` is the trunk. **Everything** — feature, fix, hotfix — branches off
`staging` and squash-PRs back into `staging`. `main` is a **fast-forward-only
pointer** to the latest release, moved *only* by automation. You never touch it.

## Starting work

```bash
git fetch origin
git checkout -b <branch> origin/staging   # ALWAYS branch from fresh origin/staging
```

**Branch name:** `<author>/san-<n>-<kebab-description>`
(e.g. `nahuel/san-230-branching-model`, `alfonso/san-104-retire-escudero`).
- `<author>` = your handle (the human you act for). Use `claude/...` only if none.
- `san-<n>` = the Linear issue id, lowercase. **Every code change needs one** —
  the `Require Linear issue ID` check fails without `SAN-<n>` in the branch,
  title, or body. No issue yet? Create one in the SanchoCMO Linear team first.
- Prefer copying the branch name straight from the Linear issue.

## Committing

**Conventional Commits, enforced by commitlint** (`commit-msg` hook — don't
`--no-verify`). release-please reads these to compute the version bump:

| Type | Bump | Example |
|---|---|---|
| `feat:` | minor | `feat(chat): add thread search` |
| `fix:` | patch | `fix(auth): handle missing session token` |
| `feat!:` / `BREAKING CHANGE:` footer | major | `feat!: drop /v1 routes` |
| `chore: docs: refactor: perf: test: build: ci: style:` | none | `docs: update README` |

Scope optional but encouraged. End the body with the Linear ref: `Refs SAN-<n>`
(use `Fixes SAN-<n>` only if the merge should close the issue).

## Opening the PR

- **Base is ALWAYS `staging`.** `gh pr create --base staging`. A PR into `main`
  is never correct — refuse it.
- Fill the PR template; keep the `Refs SAN-<n>` line.
- **Merge method: squash.** Every PR into staging squashes to one Conventional
  Commit (staging keeps a linear history).

## Releasing (cut a version)

You don't tag by hand or touch `main`. release-please runs on `staging` and keeps
one open `chore: release vX.Y.Z` PR accumulating every Conventional Commit since
the last release.

1. **Merge that release PR (squash)** when told to cut the version → creates the
   tag + GitHub Release on the staging commit.
2. Automation then fast-forwards `main` to the tag (`promote-main.yml`) and
   `deploy-prod.yml` **waits at the `production` approval gate**. A human approves
   to deploy. You do not approve prod deploys.

Merging the release PR does **not** freeze staging — keep working immediately.

## Hotfix = normal flow

No special procedure. A hotfix is a `fix:` change: branch from `staging`, commit
`fix: ...`, squash-PR to `staging`, then it ships via the next (patch) release PR.
The only exception — prod down *and* staging has unreleasable work in flight — is
the emergency runbook in `docs/CONTRIBUTING.md` (§Hotfixes); it's the only time you
touch git by hand. Not the default.

## Never

- Touch `main` — no PR, no push, no merge, no manual tag. Automation owns it.
- Open a PR with base `main`.
- Merge to `staging` with anything but **squash**.
- Push directly to `main`/`staging`, force-push protected branches, or
  `--no-verify` without a stated reason.

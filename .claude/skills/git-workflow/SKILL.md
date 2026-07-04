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
- `san-<n>` = a Linear issue id, lowercase. **Every code change needs one** —
  the `Require Linear issue ID` check fails without `SAN-<n>` in the branch,
  title, or body. Which id to use:
  - **Discrete work** (a reported bug, a planned feature — anything a human
    should track or discuss on its own) → create/use its **own** issue in the
    SanchoCMO Linear team.
  - **Incremental PRs inside an ongoing epic/initiative** (e.g. an autonomous
    agent shipping many small PRs toward one parent) → **reference the parent
    epic** (`Refs SAN-<epic>` in the body / branch); do **not** mint a fresh
    issue per PR. One-issue-per-PR floods the Linear→Slack channel and adds no
    tracking value for work already scoped by the epic.
- Prefer copying the branch name straight from the Linear issue.

## Committing

**Conventional Commits, enforced by commitlint** (`commit-msg` hook — don't
`--no-verify`). release-please reads these to compute the version bump:

| Type | Bump | Example |
|---|---|---|
| `feat:` | minor | `feat(chat): add thread search` |
| `fix:` | patch | `fix(auth): handle missing session token` |
| `feat!:` / `BREAKING CHANGE:` footer | major | `feat!: drop /v1 routes` |
| `chore:` `docs:` `style:` `refactor:` `perf:` `test:` `build:` `ci:` | none | `docs: update README` |

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

## Hotfix

A "hotfix" request is a **decision, not a fixed procedure**. Answer one question
first: **can we ship staging's current tip to prod right now?**

### Case A — staging is shippable → it's a normal `fix:` (the default)

Almost every hotfix is this. There is no special path: branch from `staging`,
commit `fix: ...`, squash-PR to `staging`, then it ships via the next (patch)
release PR + prod-gate approval. Don't touch `main`, don't tag by hand. This works
because `staging` is kept always-releasable (small PRs + feature flags).

### Case B — TRUE emergency: prod is broken AND staging has unreleasable work in flight

The **only** time you touch git by hand. You can't ship staging's tip (half-done
features / no flags), but prod is down. Confirm both conditions hold before doing
this — if staging is shippable, use Case A. Execute:

```bash
# 1. Branch from the EXACT tag running in prod (the latest published release),
#    NOT from staging. Confirm it's what prod actually runs if unsure.
git fetch origin --tags
PROD_TAG="$(git tag --sort=-creatordate | grep '^v' | head -1)"   # e.g. v0.6.0
git switch -c hotfix/san-<n>-<desc> "$PROD_TAG"

# 2. Minimal fix + a fix: Conventional Commit. Push the branch.
git commit -am "fix: <summary> (SAN-<n>)"
git push -u origin hotfix/san-<n>-<desc>

# 3. Patch-bump the prod tag, push it, publish a Release on it. Publishing the
#    release fires promote-main (ff main → tag), docker-image (build), and
#    deploy-prod (waits at the production gate).
NEW="v0.6.1"   # patch bump of $PROD_TAG
git tag -a "$NEW" -m "hotfix: <summary> (SAN-<n>)"
git push origin "$NEW"
gh release create "$NEW" --title "$NEW" --notes "Hotfix: <summary> (SAN-<n>)"

# 4. A human approves the `production` gate → prod deploys the hotfix.
```

Then **restore the invariant** so the next normal release stays a fast-forward —
forward-merge the hotfix into `staging` (it must not be lost, and `main` must
become an ancestor of `staging` again):

- Open a **squash PR** `hotfix/san-<n>-<desc> → staging`.
- In that PR, bump `.release-please-manifest.json` to the hotfix version (`0.6.1`)
  so release-please continues from there and doesn't collide on the next release.
- Merge (squash).

Why this stays ff-only: the hotfix tag is built **on top of** the prod tag, so it's
a descendant of where `main` points → moving `main` to it is a legitimate
fast-forward, never a rewrite. Guardrails: never `gh pr create --base main`; never
tag a hotfix off `staging`; never skip step 4's forward-merge (skipping it makes
`main` stop being an ancestor of `staging` and breaks the next release).

#### Versioning a hotfix — avoid number collisions

The hotfix version is the **next patch above the tag prod runs**, regardless of
where `staging` is. Prod on `v0.6.0` → the hotfix is `v0.6.1` — *even if `staging`
already has an in-flight `v0.6.1`* in release-please's open PR. The manifest bump in
the forward-merge makes that pending staging release **slide up** to `v0.6.2`, so no
number is ever issued twice and both releases carry the fix. Do the forward-merge
**promptly** — if someone merges the stale `v0.6.1` release PR before the manifest
bump lands, *that* collides.

Two edge cases:

- **`main` is already past prod** (a newer release was published but is stuck at the
  prod gate, so prod still runs the old tag): the hotfix tag won't descend from
  `main`, so you can't ff it. Don't try — deploy the patch with `deploy-prod.yml`
  **`workflow_dispatch`** (any tag, doesn't touch `main`) and just forward-port. The
  real fix is to not let `main` get ahead of prod.
- **The would-be hotfix version is already a published tag**: you can't reuse it —
  fall back to `workflow_dispatch` deploy + forward-port, as above.

`main` only ever fast-forwards and **physically refuses** any non-descendant move
(`promote-main`'s `is-ancestor` guard), so it can never be silently clobbered by an
older-line tag.

## Never

- Touch `main` — no PR, no push, no merge, no manual tag. Automation owns it.
- Open a PR with base `main`.
- Merge to `staging` with anything but **squash**.
- Push directly to `main`/`staging`, force-push protected branches, or
  `--no-verify` without a stated reason.

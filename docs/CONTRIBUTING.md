# Contributing

Workflow guide for sanchocmo-openclaw.

---

## Branch model

```
<author>/san-<n>-desc ──PR(squash)──▶ staging ──auto-deploy──▶ staging VPS
                              │
                              │  release-please runs ON staging:
                              │  keeps one "chore: release vX.Y.Z" PR open
                              ▼
                   merge release PR (squash) ──▶ tag vX.Y.Z + GitHub Release
                              │
                              ├──▶ promote-main.yml: main FAST-FORWARDS to the tag
                              ├──▶ docker-image.yml: builds & pushes the image
                              │
                              ┊  (publishing a release does NOT deploy prod)
                              ┊
   Actions ▶ "Deploy to Production" ▶ Run workflow ▶ tag=vX.Y.Z (manual) ──▶ prod VPS
```

`main` **never receives work** — not a PR, not a push, not a merge. It is a
fast-forward-only pointer to the latest release, moved only by `promote-main.yml`.
Because it can only advance to commits that already live on `staging`, it can
**never diverge**.

- **`staging`** auto-deploys on every merge (no gate). It is the trunk; keep it
  always releasable — small PRs, feature-flag incomplete work.
- **`main`** is automation-only. A published release fast-forwards it to the tag.
- **Prod deploy is manual.** `deploy-prod.yml` is **`workflow_dispatch` only** — it
  does **not** trigger on a published release. To ship, run it from the Actions tab
  and enter the tag. The tag is **rejected unless it is a published GitHub Release
  cut by release-please** — a hand-created tag is not deployable (see "Single
  tagging path" below). Deciding to run it is the go/no-go for *when* a release
  reaches prod. Publishing a release only builds the image and fast-forwards `main`;
  prod never auto-deploys.

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Production pointer. Fast-forwarded to each release tag by automation | Locked: **no PRs, no direct pushes** — only `promote-main.yml` (via PAT) moves it; ff-only |
| `staging` | Trunk. Where everything integrates; release-please cuts releases here | Locked: PR + green CI required, linear history (squash) |
| `<author>/san-<n>-<kebab-desc>` | Short-lived work branches (incl. hotfixes); e.g. `nahuel/san-243-fix-release-title` | Open |
| `main-old` | Frozen snapshot of the legacy `main` (pre-2026-05-07) | Read-only reference |

---

## Day-to-day flow

### 1. Start a new feature
```bash
git checkout staging
git pull
git checkout -b martin/san-123-short-description
```

Every code PR must be linked to a Linear issue. Prefer copying the branch name
from Linear (`Cmd/Ctrl Shift .`) so the issue ID is present from the first
commit. PRs without a `SAN-123` reference in the branch, title, or body fail CI.

### 2. Commit using Conventional Commits
The commit message format is **enforced** by `commitlint` via a `commit-msg` git hook. release-please reads these to bump versions automatically.

| Type | Bumps version | Example |
|---|---|---|
| `feat:` | minor (1.2.0 → 1.3.0) | `feat(chat): add thread search` |
| `fix:` | patch (1.2.0 → 1.2.1) | `fix(auth): handle missing session token` |
| `feat!:` or `BREAKING CHANGE:` footer | major (1.2.0 → 2.0.0) | `feat!: drop legacy /v1 routes` |
| `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:` | none | `docs: update README` |

Scope is optional but encouraged: `feat(slack): per-action handlers`.

### 3. Open a PR against `staging`
The default branch of the repo is `staging`, so the PR target is automatic. Fill
the PR template, push, request review.

Keep the Linear section in the PR body:

```md
Refs SAN-123
```

Use `Refs` for normal staging work so the issue stays linked while Linear's
GitHub automations move it through review/QA states. Use `Fixes SAN-123` only
when merging that PR should complete the issue.

### 4. CI runs automatically
Required checks (must pass before merge):
- `Require Linear issue ID`
- `typecheck` (`npm run typecheck`)
- `build` (`npm run build`)

Informational (won't block merge for now):
- `lint` (`npm run lint`) — pending baseline cleanup; will become required afterwards
- `e2e` (Playwright smoke tests) — will become required as coverage grows

### 5. Merge to staging
After approval + green CI, merge. **Use "Squash and merge"** so the staging history stays linear and each PR maps to one Conventional Commit.

Merging to `staging` automatically triggers `deploy-staging.yml`, which SSHes into the staging VPS and runs `docker compose up -d` with the new commit. Verify your change works in the staging preview before proceeding.

### 6. Release to production

Releases are cut **from `staging`** — there is no `staging → main` promotion. The
go-live is **two human decisions**: *merge the release PR* (cut the version) and
*dispatch `deploy-prod.yml`* with the tag (ship it). Everything else is automated.

1. **`release-please.yml` runs on `staging`** and keeps **one** open "release PR"
   (`chore: release vX.Y.Z`, base `staging`) with the version bump + CHANGELOG. It
   doesn't bump on every merge — it **accumulates** every Conventional Commit since
   the last release into that single PR and recomputes the proposed version.
   - Version comes from commit types: `feat:` → minor, `fix:` → patch,
     `feat!:`/`BREAKING CHANGE` → major.
   - It authenticates with the `RELEASE_PLEASE_TOKEN` repo secret (a PAT), because
     the org disallows the default `GITHUB_TOKEN` from creating PRs.

2. **Merge the release PR** when you decide to cut the version. **Squash, like any
   staging PR** (staging keeps a linear history). On merge, release-please creates
   the tag `vX.Y.Z` + GitHub Release **on the staging commit**. This is the "we're
   cutting vX.Y.Z" decision — it does **not** freeze staging; you can keep merging
   work immediately and release-please opens the next release PR.

3. **Publishing the Release fires two jobs in parallel:**
   - **`promote-main.yml`** fast-forwards `main` to the tag — `main` becomes the
     immutable pointer to what's released. (No PR, no merge; pure ff.)
   - **`docker-image.yml`** builds & pushes the versioned image (`:vX.Y.Z` +
     `:latest`) to GHCR.

   **Publishing a Release does NOT deploy prod.** Prod is a separate, deliberate
   step.

4. **Deploy to prod — manual, `workflow_dispatch` only.** When you want the tag
   live, go to **Actions → "Deploy to Production" → Run workflow** and enter the
   tag (e.g. `vX.Y.Z`). The workflow's **guard requires the tag to be a published
   GitHub Release** (i.e. cut by release-please); a typo, a missing tag, or a
   hand-created tag with no Release aborts before anything touches prod. It then
   rolls the tag to the prod VPS (checkout tag → build → `docker compose up -d`
   with the YALC overlay, health check, auto-rollback on failure). Until you run
   it, prod is untouched.

You don't manually create tags or touch `main` — automation owns both. You also
don't have to deploy every tag: dispatch `deploy-prod.yml` with the tag when you
want it live, or with any older *release* tag to roll back.

### Single tagging path — never tag by hand

**release-please is the only thing that creates version tags.** It cuts `vX.Y.Z`
+ a GitHub Release from `staging` when you merge the release PR. That is the *only*
sanctioned way a `vX.Y.Z` tag comes into existence. Two guardrails enforce it:

- **Deploy guard:** `deploy-prod.yml` refuses any tag that isn't a *published
  Release*, so a hand-cut tag can never reach prod (it has no image, no runtime
  tarball, and never promoted `main` — the installer would still serve the last
  real release, not your tag).
- **Tag ruleset:** a repo ruleset blocks creating/updating/deleting `refs/tags/v*`
  for everyone except the release-please automation.

If you need to ship a fix to prod, **merge the release PR to cut a real release**,
then dispatch `deploy-prod.yml` with that tag. Do **not** `git tag vX.Y.Z` locally
and push, and do **not** create a Release by hand. For a true emergency that must
skip staging, follow the `[hotfix-off-staging]` runbook (see `promote-main.yml`).

> **Never create a tag or GitHub Release by hand for a normal release** (CLI or
> web UI). Releases come *only* from release-please merging its `chore: release`
> PR, so every release commit lives on `staging`'s linear history. A hand-made tag
> — or a tag on a commit built off an old base (e.g. a GitHub-UI commit) — points
> `main` at a commit that isn't on `staging`, silently diverging the two; the
> break only surfaces at the *next* release, when `promote-main` refuses the
> now-impossible fast-forward. `promote-main.yml` refuses to promote any tag that
> isn't reachable from `staging` (the emergency hotfix below is the sole opt-in
> exception, via `[hotfix-off-staging]`). If `main` ever diverges, see
> "Reconciling a diverged `main`" below. (This is what bit v0.7.1 → SAN-255.)

> **Merge method:** **everything is squash now.** PRs into `staging` (feature, fix,
> and the release PR) → **squash**. Nothing ever merges into `main` — it only
> fast-forwards.

> **Data ≠ code.** A release ships code only. Client data (brand docs, chats, tasks, Neon DB) is migrated separately via `scripts/resync-staging-to-prod.sh` while staging is the source of truth.

### Reconciling a diverged `main`

If `main` ever stops being an ancestor of `staging` (e.g. an out-of-band tag got
promoted), `promote-main` refuses every future release with `main (…) is not an
ancestor of …`. Because `main` is a **pure pointer** to the latest release and
carries no unique work, the fix is to move it onto the current release commit —
never a merge or PR (both forbidden on `main`). First confirm nothing unique lives
on `main`:

```bash
git fetch origin --tags
# Must print nothing — anything listed is work that exists ONLY on main:
git log --oneline origin/main --not origin/staging
```

If empty, point `main` at the release tag it should reflect. This is a one-time
admin force-update — `main`'s ruleset blocks it, so relax the ruleset (or use a
bypass actor) for the push, then restore it:

```bash
TAG_SHA="$(git rev-parse v0.8.0^{commit})"   # the latest release
git push --force origin "${TAG_SHA}:refs/heads/main"
```

`promote-main` then no-ops on the next release (main already at the tag). If the
`git log` above is **not** empty, forward-merge that commit into `staging` first.

---

## Hotfixes

**There is no separate hotfix procedure.** A hotfix is just a `fix:` change:
branch from `staging` → commit `fix: ...` → squash PR to `staging` (deploys to
staging, verify) → merge the release PR release-please cuts (a patch bump) →
dispatch `deploy-prod.yml` with the new tag. Identical to any other change. This
works because `staging` is kept always-releasable (small PRs + feature flags).

```bash
git checkout staging && git pull
git checkout -b nahuel/san-123-fix-summary
# fix it, commit with `fix: ...`, push, PR to staging — done.
```

### Emergency runbook (the only time you touch git by hand)

The single exception is **prod down *and* `staging` has unreleasable work in
flight** (so you can't ship staging's tip). Not the everyday path. Confirm **both**
conditions hold — if staging is shippable, use the normal flow above.

```bash
# 1. Branch from the tag running in prod (latest published release), NOT staging.
git fetch origin --tags
PROD_TAG="$(git tag --sort=-creatordate | grep '^v' | head -1)"   # e.g. v0.6.0
git switch -c hotfix/san-<n>-<desc> "$PROD_TAG"

# 2. Minimal fix + a fix: Conventional Commit, then push the branch.
git commit -am "fix: <summary> (SAN-<n>)"
git push -u origin hotfix/san-<n>-<desc>

# 3. Patch-bump the prod tag and publish a Release on it. The published release
#    fires promote-main (ff main → tag) and docker-image (build). It does NOT
#    deploy — prod is a separate manual dispatch (step 4).
NEW="v0.6.1"   # patch bump of $PROD_TAG
git tag -a "$NEW" -m "hotfix: <summary> (SAN-<n>)"
git push origin "$NEW"
# [hotfix-off-staging] opts this tag past promote-main's "tag must be on staging"
# guard — the only sanctioned off-staging promote. Forward-merge to staging (below).
gh release create "$NEW" --title "$NEW" --notes "Hotfix: <summary> (SAN-<n>) [hotfix-off-staging]"

# 4. Ship it: Actions → "Deploy to Production" → Run workflow → tag=$NEW.
```

Because the hotfix tag is built **on top of** `$PROD_TAG` (where `main` points), it
is a descendant of `main` → moving `main` to it is a fast-forward, never a rewrite.

Finally, **restore the invariant** — forward-merge the hotfix into `staging` so it
isn't lost and `main` is an ancestor of `staging` again:

- Open a **squash PR** `hotfix/san-<n>-<desc> → staging`.
- In that PR, bump `.release-please-manifest.json` to the hotfix version (`0.6.1`)
  so release-please continues from there and doesn't collide on the next release.
- Merge (squash).

#### Versioning — avoiding number collisions

The hotfix version is the **next patch above the tag prod runs**, no matter where
`staging` is. Prod on `v0.6.0` → the hotfix is `v0.6.1`, *even if `staging` already
has an in-flight `v0.6.1`* in release-please's open PR: the manifest bump above makes
that pending release **slide up** to `v0.6.2`, so no number is issued twice and both
releases carry the fix. Do the forward-merge promptly — merging the stale `v0.6.1`
release PR before the bump lands is the one thing that collides.

Two edge cases fall back to **`deploy-prod.yml` `workflow_dispatch`** (deploys any
tag without moving `main`) plus the usual forward-port:

- `main` is already past prod — a newer release was published (so `main` ff'd) but
  never dispatched to prod, so the hotfix tag won't fast-forward `main`. Deploy via
  `workflow_dispatch`; don't move `main`. (Root cause to avoid: `main` ahead of prod.)
- the would-be hotfix version is already a published tag — you can't reuse it.

`main` only ever fast-forwards and refuses any non-descendant move, so it can never
be silently clobbered by an older-line tag.

---

## Local setup

```bash
nvm use 26                    # match the Dockerfile node version
npm ci
npm run dev                   # http://localhost:3000
```

### Run quality checks before pushing
```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e              # requires `npm run start` running on :3000, or set PLAYWRIGHT_BASE_URL
```

The pre-push lifecycle is enforced in CI; running locally just saves a round trip.

---

## Operating expectations

- **Never touch `main`** — no PRs, no pushes, no merges, no manual tags. Only
  `promote-main.yml` moves it. The base for every PR is `staging`.
- **No direct pushes to `main` or `staging`** (branch protection enforces this).
- **No force-push** to protected branches.
- **No skipping hooks** (`--no-verify`) without an explicit reason — commit-msg lint exists for a reason.
- **Keep PRs small.** Aim for < 400 lines diff. If you must go bigger, flag it in the PR description.
- **Update docs** in the same PR when you change behavior visible to other devs or users.

---

## GitHub Environments (deploy config)

The deploy workflows resolve VPS credentials from two **GitHub Environments** (Settings → Environments):

| Environment | Triggered by | Required reviewers | Used by |
|---|---|---|---|
| `staging` | merge / push to `staging` | none (auto) | `deploy-staging.yml` |
| `production` | **manual `workflow_dispatch` only** (enter the tag) | none — running it *is* the deliberate go-live | `deploy-prod.yml` |

Each environment exposes the same secret/variable names with different values:

- **Secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- **Variables:** `DEPLOY_PATH`, `HEALTH_URL`

> **Setting up a new VPS, rotating keys, or troubleshooting a failed deploy?** The full procedure — including how to generate the two SSH keys, exactly which value goes in each field, and how to verify — lives in [`docs/DEPLOY.md` → "Connect this VPS to the CI/CD pipeline"](DEPLOY.md#connect-this-vps-to-the-cicd-pipeline-github-actions). That section is the single source of truth for the operational setup.

## Questions / problems

- Deploy or VPS issues → `docs/DEPLOY.md`
- Branch model, commits, releases, hotfixes → this document (above)

# Contributing

Workflow guide for sanchocmo-openclaw.

---

## Branch model

```
<author>/san-<n>-desc ──PR(squash)──▶ main ──auto-deploy──▶ staging/QA VPS
                              │
                              │  release-please runs ON main:
                              │  keeps one "chore: release vX.Y.Z" PR open
                              ▼
                   merge release PR (squash) ──▶ tag vX.Y.Z + GitHub Release
                              │
                              ├──▶ docker-image.yml: builds & pushes the image
                              │
                              ┊  (publishing a release does NOT deploy prod)
                              ┊
   Actions ▶ "Deploy to Production" ▶ Run workflow ▶ tag=vX.Y.Z (manual) ──▶ prod VPS
```

**`main` is the single trunk** (SAN-444). There is **no `staging` branch** and no
release-pointer branch — the tags **are** the releases, and prod deploys a tag.
This removes the whole class of main↔staging divergence (and the "merge to main =
promote to prod" footgun) by construction.

> **"main" the branch vs "staging" the environment.** We retired the `staging`
> *branch*; the QA *environment* (the "staging VPS") is unchanged — the trunk
> `main` deploys to it on every push. When a doc says "staging VPS" / "staging
> environment", it means the QA VPS, not a branch.

- **`main`** auto-deploys to the QA VPS on every merge (no gate). Keep it always
  releasable — small PRs, feature-flag incomplete work.
- **Releases are tags** cut from `main` by release-please. No promotion step.
- **Prod deploy is manual.** `deploy-prod.yml` is **`workflow_dispatch` only** — it
  does **not** trigger on a published release. To ship, run it from the Actions tab
  and enter the tag. The tag is **rejected unless it is a published GitHub Release
  cut by release-please** — a hand-created tag is not deployable (see "Single
  tagging path" below). Deciding to run it is the go/no-go for *when* a release
  reaches prod. Publishing a release only builds the image; prod never auto-deploys.

| Branch | Purpose | Protection |
|---|---|---|
| `main` | The single trunk. Everything integrates here; release-please cuts releases (tags) here; auto-deploys to the QA VPS | Locked: PR + green CI required, linear history (squash), no direct push, no force-push |
| `<author>/san-<n>-<kebab-desc>` | Short-lived work branches (incl. hotfixes); e.g. `nahuel/san-243-fix-release-title` | Open |

---

## Day-to-day flow

### 1. Start a new feature
```bash
git checkout main
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

### 3. Open a PR against `main`
The default branch of the repo is `main`, so the PR target is automatic. Fill
the PR template, push, request review.

Keep the Linear section in the PR body:

```md
Refs SAN-123
```

Use `Refs` for normal trunk work so the issue stays linked while Linear's
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

### 5. Merge to main
After approval + green CI, merge. **Use "Squash and merge"** so the trunk history stays linear and each PR maps to one Conventional Commit.

Merging to `main` automatically triggers `deploy-staging.yml`, which SSHes into the staging/QA VPS and runs `docker compose up -d` with the new commit. Verify your change works in the staging preview before proceeding.

### 6. Release to production

Releases are cut **from `main`** — the tags are the releases, there is no
promotion step. The go-live is **two human decisions**: *merge the release PR*
(cut the version) and *dispatch `deploy-prod.yml`* with the tag (ship it).
Everything else is automated.

1. **`release-please.yml` runs on `main`** and keeps **one** open "release PR"
   (`chore: release vX.Y.Z`, base `main`) with the version bump + CHANGELOG. It
   doesn't bump on every merge — it **accumulates** every Conventional Commit since
   the last release into that single PR and recomputes the proposed version.
   - Version comes from commit types: `feat:` → minor, `fix:` → patch,
     `feat!:`/`BREAKING CHANGE` → major.
   - It authenticates with the `RELEASE_PLEASE_TOKEN` repo secret (a PAT), because
     the org disallows the default `GITHUB_TOKEN` from creating PRs.

2. **Merge the release PR** when you decide to cut the version. **Squash, like any
   trunk PR** (`main` keeps a linear history). On merge, release-please creates the
   tag `vX.Y.Z` + GitHub Release **on the `main` commit**. This is the "we're
   cutting vX.Y.Z" decision — it does **not** freeze the trunk; you can keep merging
   work immediately and release-please opens the next release PR.

3. **Publishing the Release fires `docker-image.yml`**, which builds & pushes the
   versioned image (`:vX.Y.Z` + `:latest`) to GHCR.

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

You don't manually create tags — automation owns tagging. You also don't have to
deploy every tag: dispatch `deploy-prod.yml` with the tag when you want it live, or
with any older *release* tag to roll back.

### Single tagging path — never tag by hand

**release-please is the only thing that creates version tags.** It cuts `vX.Y.Z`
+ a GitHub Release from `main` when you merge the release PR. That is the *only*
sanctioned way a `vX.Y.Z` tag comes into existence. Two guardrails enforce it:

- **Deploy guard:** `deploy-prod.yml` refuses any tag that isn't a *published
  Release*, so a hand-cut tag can never reach prod (it has no image and no runtime
  tarball — the installer would still serve the last real release, not your tag).
- **Tag ruleset:** a repo ruleset blocks creating/updating/deleting `refs/tags/v*`
  for everyone except the release-please automation.

If you need to ship a fix to prod, **merge the release PR to cut a real release**,
then dispatch `deploy-prod.yml` with that tag. Do **not** `git tag vX.Y.Z` locally
and push, and do **not** create a Release by hand. For a true emergency, see the
emergency hotfix runbook below.

> **Never create a tag or GitHub Release by hand for a normal release** (CLI or
> web UI). Releases come *only* from release-please merging its `chore: release`
> PR, so every release commit lives on `main`'s linear history and is
> automatically imageable + deployable. A hand-made tag has no image/tarball and is
> rejected by the deploy guard.

> **Merge method:** **everything is squash.** Every PR into `main` (feature, fix,
> and the release PR) → **squash**, so the trunk stays linear.

> **Data ≠ code.** A release ships code only. Client data (brand docs, chats, tasks, Neon DB) is migrated separately via `scripts/resync-staging-to-prod.sh` while the trunk (`main`) is the source of truth.

---

## Hotfixes

**There is no separate hotfix procedure for the common case.** A hotfix is just a
`fix:` change: branch from `main` → commit `fix: ...` → squash PR to `main`
(deploys to the QA VPS, verify) → merge the patch release PR release-please cuts →
dispatch `deploy-prod.yml` with the new tag. Identical to any other change. This
works because `main` is kept always-releasable (small PRs + feature flags).

```bash
git checkout main && git pull
git checkout -b nahuel/san-123-fix-summary
# fix it, commit with `fix: ...`, push, PR to main — done.
```

### Emergency runbook (the only time you cut a tag off a non-trunk commit)

The single exception is **prod down *and* `main` has unreleasable work in flight**
(so you can't ship the trunk's tip). Not the everyday path. Confirm **both**
conditions hold — if the trunk is shippable, use the normal flow above.

```bash
# 1. Branch from the tag running in prod (confirm what prod actually runs).
git fetch origin --tags
PROD_TAG="$(git tag --sort=-creatordate | grep '^v' | head -1)"   # e.g. v1.4.0
git switch -c hotfix/san-<n>-<desc> "$PROD_TAG"

# 2. Minimal fix + a fix: Conventional Commit, then push the branch.
git commit -am "fix: <summary> (SAN-<n>)"
git push -u origin hotfix/san-<n>-<desc>

# 3. Patch-bump the prod tag and publish a Release on it (builds the image). It
#    does NOT deploy — prod is a separate manual dispatch (step 4).
NEW="v1.4.1"   # patch bump of $PROD_TAG
git tag -a "$NEW" -m "hotfix: <summary> (SAN-<n>)"
git push origin "$NEW"
gh release create "$NEW" --title "$NEW" --notes "Hotfix: <summary> (SAN-<n>)"

# 4. Ship it: Actions → "Deploy to Production" → Run workflow → tag=$NEW.
```

Finally, **forward-port** the fix into `main` so it isn't lost:

- Open a **squash PR** `hotfix/san-<n>-<desc> → main`.
- In that PR, bump `.release-please-manifest.json` to the hotfix version (`1.4.1`)
  so release-please continues from there and doesn't reissue a colliding number.
- Merge (squash).

#### Versioning — avoiding number collisions

The hotfix version is the **next patch above the tag prod runs**, no matter where
`main` is. Prod on `v1.4.0` → the hotfix is `v1.4.1`, *even if `main` already has an
in-flight `v1.4.1`* in release-please's open PR: the manifest bump above makes that
pending release **slide up** to `v1.4.2`, so no number is issued twice and both
releases carry the fix. Do the forward-port promptly — merging the stale `v1.4.1`
release PR before the bump lands is the one thing that collides. If the would-be
hotfix version is already a published tag, pick the next free patch.

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

- **The base for every PR is `main`** (the single trunk). No manual tags — merge
  the release PR to cut a release.
- **No direct pushes to `main`** (branch protection enforces this).
- **No force-push** to `main`.
- **No skipping hooks** (`--no-verify`) without an explicit reason — commit-msg lint exists for a reason.
- **Keep PRs small.** Aim for < 400 lines diff. If you must go bigger, flag it in the PR description.
- **Update docs** in the same PR when you change behavior visible to other devs or users.

---

## GitHub Environments (deploy config)

The deploy workflows resolve VPS credentials from two **GitHub Environments** (Settings → Environments):

| Environment | Triggered by | Required reviewers | Used by |
|---|---|---|---|
| `staging` | merge / push to `main` (the trunk) | none (auto) | `deploy-staging.yml` |
| `production` | **manual `workflow_dispatch` only** (enter the tag) | none — running it *is* the deliberate go-live | `deploy-prod.yml` |

Each environment exposes the same secret/variable names with different values:

- **Secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- **Variables:** `DEPLOY_PATH`, `HEALTH_URL`

> **Setting up a new VPS, rotating keys, or troubleshooting a failed deploy?** The full procedure — including how to generate the two SSH keys, exactly which value goes in each field, and how to verify — lives in [`docs/DEPLOY.md` → "Connect this VPS to the CI/CD pipeline"](DEPLOY.md#connect-this-vps-to-the-cicd-pipeline-github-actions). That section is the single source of truth for the operational setup.

## Questions / problems

- Deploy or VPS issues → `docs/DEPLOY.md`
- Branch model, commits, releases, hotfixes → this document (above)

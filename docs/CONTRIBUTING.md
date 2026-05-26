# Contributing

Workflow guide for sanchocmo-openclaw.

---

## Branch model

```
feature/foo ──PR(squash)──▶ staging ──auto-deploy──▶ staging VPS
                              │
                              └──PR(merge commit)──▶ main ──release-please──▶ release PR ──merge──▶ tag vX.Y.Z ──auto-deploy──▶ prod VPS
```

- **`staging`** auto-deploys on every merge (no gate).
- **`main`** only deploys on a published release. The deploy is **automatic** (no approval gate today); merging the release PR is the go/no-go. PRs into `main` must use a **merge commit, not squash** (see §6).

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Production. Every merge → auto-tag + deploy | Locked: PR + 1 approval + green CI required, no force-push |
| `staging` | QA. Where features accumulate before a release | Locked: PR + green CI required |
| `feature/*`, `fix/*`, `chore/*`, `refactor/*` | Short-lived work branches | Open |
| `hotfix/*` | Urgent production fixes (branch from `main`) | Open |
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

When staging is validated and ready to go live, it's a **two-merge** flow and the deploy is automatic:

1. **Open a PR `staging → main`** (`gh pr create --base main --head staging`).
   - ⚠️ **Merge it with a _merge commit_ — NOT squash.** Squashing collapses every Conventional Commit into one, so release-please can't compute the version bump or build the CHANGELOG.

2. **`release-please.yml` runs on `main`** and opens a "release PR" (`chore: release vX.Y.Z`) with the version bump + CHANGELOG.
   - Version comes from commit types: `feat:` → minor, `fix:` → patch, `feat!:`/`BREAKING CHANGE` → major.
   - It authenticates with the `RELEASE_PLEASE_TOKEN` repo secret (a PAT), because the org disallows the default `GITHUB_TOKEN` from creating PRs. It also pins `target-branch: main` (the repo's default branch is `staging`, which release-please would otherwise target).

3. **Merge the release PR** — ⚠️ **again with a _merge commit_, NOT squash.** With squash, release-please can't find its release commit on `main` and never creates the tag. On merge it creates the tag `vX.Y.Z` + GitHub Release.

4. **Publishing the Release triggers `deploy-prod.yml`**, which deploys to the prod VPS **automatically** (checkout tag → build → `docker compose up -d` with the YALC overlay). There is currently **no manual-approval gate** — merging the release PR is your go/no-go. To add a gate, set required reviewers on the `production` GitHub Environment.

You don't manually create tags — release-please owns versioning.

> **Merge-method rule of thumb:** PRs into `staging` → **squash**. PRs into `main` (the `staging → main` promotion *and* the release PR) → **merge commit**.

> **Data ≠ code.** A release ships code only. Client data (brand docs, chats, tasks, Neon DB) is migrated separately via `scripts/resync-staging-to-prod.sh` while staging is the source of truth.

---

## Hotfixes

When prod is broken and you can't wait for the staging cycle:

```bash
git checkout main
git pull
git checkout -b hotfix/<bug-summary>
# fix it, commit with `fix: ...`
git push -u origin hotfix/<bug-summary>
# open PR to main
```

After the hotfix ships:
1. Merge `main` back into `staging` (or cherry-pick the fix) so staging stays in sync.

---

## Local setup

```bash
nvm use 24                    # match the Dockerfile node version
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
| `production` | release published | none (auto-deploy; add required reviewers to gate) | `deploy-prod.yml` |

Each environment exposes the same secret/variable names with different values:

- **Secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- **Variables:** `DEPLOY_PATH`, `HEALTH_URL`

> **Setting up a new VPS, rotating keys, or troubleshooting a failed deploy?** The full procedure — including how to generate the two SSH keys, exactly which value goes in each field, and how to verify — lives in [`docs/DEPLOY.md` → "Connect this VPS to the CI/CD pipeline"](DEPLOY.md#connect-this-vps-to-the-cicd-pipeline-github-actions). That section is the single source of truth for the operational setup.

## Questions / problems

- Deploy or VPS issues → `docs/DEPLOY.md`
- Workflow rationale and decisions → `docs/plans/2026-05-07-git-workflow-main-staging.md`

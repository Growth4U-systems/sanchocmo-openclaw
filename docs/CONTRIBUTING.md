# Contributing

Workflow guide for sanchocmo-openclaw.

---

## Branch model

```
feature/foo ──PR(squash)──▶ staging ──auto-deploy──────────▶ staging VPS
                              │
                              │  release-please runs ON staging:
                              │  keeps one "chore: release vX.Y.Z" PR open
                              ▼
                   merge release PR (squash) ──▶ tag vX.Y.Z + GitHub Release
                              │
                              ├──▶ promote-main.yml: main FAST-FORWARDS to the tag
                              │
                              └──▶ deploy-prod.yml ──(manual approval: `production` gate)──▶ prod VPS
```

`main` **never receives work** — not a PR, not a push, not a merge. It is a
fast-forward-only pointer to the latest release, moved only by `promote-main.yml`.
Because it can only advance to commits that already live on `staging`, it can
**never diverge**.

- **`staging`** auto-deploys on every merge (no gate). It is the trunk; keep it
  always releasable — small PRs, feature-flag incomplete work.
- **`main`** is automation-only. A published release fast-forwards it to the tag.
- **Prod deploy is gated.** `deploy-prod.yml` runs on a published release but
  **pauses for manual approval** on the `production` GitHub Environment. That
  approval is the go/no-go for *when* a release reaches prod.

| Branch | Purpose | Protection |
|---|---|---|
| `main` | Production pointer. Fast-forwarded to each release tag by automation | Locked: **no PRs, no direct pushes** — only `promote-main.yml` (via PAT) moves it; ff-only |
| `staging` | Trunk. Where everything integrates; release-please cuts releases here | Locked: PR + green CI required, linear history (squash) |
| `feature/*`, `fix/*`, `chore/*`, `refactor/*` | Short-lived work branches (incl. hotfixes) | Open |
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
*approve the prod gate* (let it deploy). Everything else is automated.

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
   - **`deploy-prod.yml`** targets the `production` Environment and **pauses for
     manual approval**. Approve it ("Approve and deploy") to roll the tag to the
     prod VPS (checkout tag → build → `docker compose up -d` with the YALC overlay,
     health check, auto-rollback on failure). Until you approve, prod is untouched.

You don't manually create tags or touch `main` — automation owns both. You also
don't have to deploy every tag: approve the gate when you want it live, or use
`deploy-prod.yml`'s `workflow_dispatch(tag)` to (re)deploy or roll back any tag.

> **Merge method:** **everything is squash now.** PRs into `staging` (feature, fix,
> and the release PR) → **squash**. Nothing ever merges into `main` — it only
> fast-forwards.

> **Data ≠ code.** A release ships code only. Client data (brand docs, chats, tasks, Neon DB) is migrated separately via `scripts/resync-staging-to-prod.sh` while staging is the source of truth.

---

## Hotfixes

**There is no separate hotfix procedure.** A hotfix is just a `fix:` change:
branch from `staging` → commit `fix: ...` → squash PR to `staging` (deploys to
staging, verify) → merge the release PR release-please cuts (a patch bump) →
approve the `production` gate. Identical to any other change. This works because
`staging` is kept always-releasable (small PRs + feature flags).

```bash
git checkout staging && git pull
git checkout -b nahuel/san-123-fix-summary
# fix it, commit with `fix: ...`, push, PR to staging — done.
```

### Emergency runbook (the only time you touch git by hand)

The single exception is **prod down *and* `staging` has unreleasable work in
flight** (so you can't ship staging's tip). Not the everyday path — a dev runs it:

1. `git fetch && git switch -c hotfix/<desc> <last-prod-tag>`
2. Minimal fix + a `fix:` Conventional Commit.
3. Tag a patch on the hotfix + fast-forward `main` to it + deploy (or
   `deploy-prod.yml` `workflow_dispatch` with that tag).
4. **Forward-merge the hotfix back to `staging`** (squash PR) so it isn't lost and
   the invariant is restored (`main` is an ancestor of `staging` again).

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
| `production` | release published | **required (manual approval gate)** | `deploy-prod.yml` |

Each environment exposes the same secret/variable names with different values:

- **Secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- **Variables:** `DEPLOY_PATH`, `HEALTH_URL`

> **Setting up a new VPS, rotating keys, or troubleshooting a failed deploy?** The full procedure — including how to generate the two SSH keys, exactly which value goes in each field, and how to verify — lives in [`docs/DEPLOY.md` → "Connect this VPS to the CI/CD pipeline"](DEPLOY.md#connect-this-vps-to-the-cicd-pipeline-github-actions). That section is the single source of truth for the operational setup.

## Questions / problems

- Deploy or VPS issues → `docs/DEPLOY.md`
- Original (pre-redesign) workflow notes → `docs/plans/2026-05-07-git-workflow-main-staging.md`
- Original (pre-redesign) workflow notes → `docs/plans/2026-05-07-git-workflow-main-staging.md`

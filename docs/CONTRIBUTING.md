# Contributing

Workflow guide for sanchocmo-openclaw.

---

## Branch model

```
feature/foo ──PR──▶ staging ──auto-deploy──▶ staging VPS
                       │
                       └──PR──▶ main ──release-please──▶ tag vX.Y.Z ──manual approval──▶ prod VPS
```

- **`staging`** auto-deploys on every merge (no gate).
- **`main`** only deploys on a published release, and requires a manual approval in the Actions UI before the prod VPS is touched.

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
git checkout -b feature/short-description
```

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
The default branch of the repo is `staging`, so the PR target is automatic. Fill the PR template, push, request review.

### 4. CI runs automatically
Required checks (must pass before merge):
- `typecheck` (`npm run typecheck`)
- `build` (`npm run build`)

Informational (won't block merge for now):
- `lint` (`npm run lint`) — pending baseline cleanup; will become required afterwards
- `e2e` (Playwright smoke tests) — will become required as coverage grows

### 5. Merge to staging
After approval + green CI, merge. **Use "Squash and merge"** so the staging history stays linear and each PR maps to one Conventional Commit.

Merging to `staging` automatically triggers `deploy-staging.yml`, which SSHes into the staging VPS and runs `docker compose up -d` with the new commit. Verify your change works in the staging preview before proceeding.

### 6. Release to production
When staging is ready to go live, open a PR `staging → main`. Once merged, `release-please.yml` runs on `main`:
- Reads new commits since the last tag
- Opens a "release PR" with the version bump and CHANGELOG diff
- When you merge that release PR → tag `vX.Y.Z` is created → GitHub Release published.

Publishing the release triggers `deploy-prod.yml`, which **waits for a manual approval** (the `production` GitHub Environment has required reviewers). After approval, the prod VPS pulls the tag and restarts. Approve via the "Review deployments" prompt in the Actions tab.

You don't manually create tags. release-please owns versioning.

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
| `production` | release published | yes (manual approval) | `deploy-prod.yml` |

Each environment defines the same secret/variable names, with values for that VPS:

**Secrets** (sensitive — masked in logs):
- `VPS_HOST` — IP or hostname of the VPS
- `VPS_USER` — SSH user (recommended: a dedicated `deploy` user, not `root`)
- `VPS_SSH_KEY` — Private SSH key (the public counterpart lives in `~/.ssh/authorized_keys` on the VPS)

**Variables** (not sensitive — visible in logs):
- `DEPLOY_PATH` — absolute path of the repo clone on the VPS (default `~/.openclaw`)
- `HEALTH_URL` — public URL the workflow polls after deploy. Recommended: point this at `https://<env-domain>/api/health`, which returns version, commit SHA, env label and uptime.

If `HEALTH_URL` is unset, the health check step warns and continues. Missing required secrets will fail the deploy with a clear error.

## Questions / problems

- Deploy or VPS issues → `docs/DEPLOY.md`
- Workflow rationale and decisions → `docs/plans/2026-05-07-git-workflow-main-staging.md`

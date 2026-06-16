# CLAUDE.md

Orientation for AI agents (and new devs) working in **sanchocmo-openclaw** —
Mission Control. This file is intentionally short: it points at the source of
truth for each topic rather than duplicating it.

## Git workflow — read this before creating branches, committing, or merging

The full workflow lives in **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)**.
Do not invent branch/merge conventions — follow that doc. The essentials:

- **`staging` is the trunk.** Every change — feature, fix, *and* hotfix — branches
  off `staging`, uses Conventional Commits, and PRs back into `staging` with
  **squash**. There is no separate hotfix procedure (see `docs/CONTRIBUTING.md` §Hotfixes).
- **`main` never receives direct work.** It is a **fast-forward-only pointer** to
  the latest production release, moved *only* by automation (`promote-main.yml`).
  Never open a PR into `main`, never push to it, never merge into it.
- **Releases are cut from `staging`.** release-please runs on `staging` and keeps
  one open `chore: release vX.Y.Z` PR (base `staging`, **squash** like any other).
  Merging it creates the tag from staging; `main` then fast-forwards to that tag,
  and `deploy-prod.yml` deploys **after a manual approval** on the `production`
  environment gate.
- **Commits use Conventional Commits** (enforced by commitlint): `feat:` → minor,
  `fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major. release-please reads these.
- **Never push directly to `main` or `staging`**, never force-push protected
  branches, never `--no-verify` without a stated reason. You don't create tags or
  touch `main` by hand — automation owns both.

When creating PRs in this repo, the base is **always `staging`**. A PR into `main`
is never correct.

## Other source-of-truth docs

| Topic | Doc |
|---|---|
| Branch model, commits, release flow, CI | [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| Deploy, VPS setup, SSH keys, environments | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Server operations | [`docs/SERVER-OPS.md`](docs/SERVER-OPS.md) |
| Local setup & install | [`docs/INSTALL.md`](docs/INSTALL.md) |
| Sancho MCP | [`docs/sancho-mcp.md`](docs/sancho-mcp.md), [`docs/sancho-mcp-runbook.md`](docs/sancho-mcp-runbook.md) |

## Local quality checks (run before pushing)

```bash
nvm use 24        # match the Dockerfile node version
npm ci
npm run typecheck # required in CI
npm run build     # required in CI
npm run lint      # informational for now
```

Required CI checks: `Require Linear issue ID`, `typecheck`, `build`. Every code
PR must reference a Linear issue (`SAN-123`) in the branch, title, or body.

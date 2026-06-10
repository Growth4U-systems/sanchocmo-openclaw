# CLAUDE.md

Orientation for AI agents (and new devs) working in **sanchocmo-openclaw** —
Mission Control. This file is intentionally short: it points at the source of
truth for each topic rather than duplicating it.

## Git workflow — read this before creating branches, committing, or merging

The full workflow lives in **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)**.
Do not invent branch/merge conventions — follow that doc. The essentials:

- **Default branch is `staging`.** Feature/fix/chore work branches off `staging`
  and PRs back into it. PRs into `staging` are merged with **squash**.
- **`staging` → production is a two-merge release flow** owned by release-please.
  Promote with a PR `staging → main`, then merge release-please's `chore: release vX.Y.Z` PR.
- **⚠️ Merge-method rule:** PRs into `staging` → **squash**. PRs into `main`
  (both the `staging → main` promotion *and* the release PR) → **merge commit, NOT squash**.
  Squashing a merge into `main` breaks release-please: it can't compute the
  version bump or create the tag. See `docs/CONTRIBUTING.md` §6.
- **Commits use Conventional Commits** (enforced by commitlint): `feat:` → minor,
  `fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major. release-please reads these.
- **Never push directly to `main` or `staging`**, never force-push protected
  branches, never `--no-verify` without a stated reason.
- **Hotfixes** branch from `main`, PR to `main`, then back-merge into `staging`.

When creating PRs in this repo, default the base to **`staging`** (never `main`
unless it's an explicit hotfix).

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

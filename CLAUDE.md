# CLAUDE.md

Orientation for AI agents (and new devs) working in **sanchocmo-openclaw** —
Mission Control. This file is intentionally short: it points at the source of
truth for each topic rather than duplicating it.

## Git workflow — read this before creating branches, committing, or merging

The full workflow lives in **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)** and,
for agents, in the **`git-workflow` skill** (`.claude/skills/git-workflow/`) —
invoke it before any branch/commit/PR/release work; it fires automatically when
you're about to do git in this repo. Do not invent branch/merge conventions. The
essentials:

- **`main` is the single trunk.** Every change — feature, fix, *and* hotfix —
  branches off `main`, uses Conventional Commits, and PRs back into `main` with
  **squash**. There is no separate hotfix procedure (see `docs/CONTRIBUTING.md` §Hotfixes).
- **Branch from fresh `origin/main`; name it `<author>/san-<n>-<kebab-desc>`**
  (e.g. `nahuel/san-230-branching-model`). Every code change needs a Linear
  `SAN-<n>` in the branch/title/body or CI fails — create the issue first if none.
- **There is no `staging` branch.** The trunk `main` continuously deploys to the
  staging/QA **environment** (the VPS is still called "staging") on every push;
  prod is a separate manual step. Don't reintroduce a second long-lived branch.
- **Releases are tags cut from `main`.** release-please runs on `main` and keeps
  one open `chore: release vX.Y.Z` PR (base `main`, **squash** like any other).
  Merging it creates the tag + GitHub Release from `main`. The tags **are** the
  releases — there is no release-pointer branch to promote. Publishing a release
  does **not** deploy prod — `deploy-prod.yml` is **`workflow_dispatch` only**:
  someone runs it and enters the tag to ship (validated against real Releases).
  Prod never auto-deploys. Agents don't ship prod on their own initiative — only
  when the human explicitly authorizes that deploy in the conversation (see the
  `git-workflow` skill).
- **Commits use Conventional Commits** (enforced by commitlint): `feat:` → minor,
  `fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major. release-please reads these.
- **Never push directly to `main`**, never force-push it, never `--no-verify`
  without a stated reason. You don't create tags by hand — merge the release PR to
  cut a release; automation owns tagging.

When creating PRs in this repo, the base is **always `main`**.

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
nvm use 26        # match the Dockerfile node version
npm ci
npm run typecheck # required in CI
npm run build     # required in CI
npm run lint      # informational for now
```

Required CI checks: `Require Linear issue ID`, `typecheck`, `build`. Every code
PR must reference a Linear issue (`SAN-123`) in the branch, title, or body.

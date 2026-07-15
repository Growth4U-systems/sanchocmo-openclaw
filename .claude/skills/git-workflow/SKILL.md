---
name: git-workflow
description: Use BEFORE creating any branch, commit, PR, or release in sanchocmo-openclaw — the repo's mandatory git conventions. Triggers whenever you are about to `git checkout -b`, name a branch, write a commit message, open a PR (`gh pr create`), pick a merge method, or cut/ship a release. Covers branch naming (`<author>/san-<n>-<desc>`), Conventional Commits, squash-to-`main`, the single-trunk model, and the release + hotfix flow.
---

# Git workflow — sanchocmo-openclaw

Authoritative summary for agents. Full detail: `docs/CONTRIBUTING.md`. **These
rules are mandatory — follow them without being asked.**

## The one model

**`main` is the single trunk** (SAN-444). **Everything** — feature, fix, hotfix —
branches off `main` and squash-PRs back into `main`. There is **no `staging`
branch**. The trunk continuously deploys to the staging/QA **environment** (the
VPS is still named "staging") on every push; **prod is a separate manual step**.
Releases are **tags** cut from `main` by release-please — there is no
release-pointer branch to promote.

## Starting work

```bash
git fetch origin
git checkout -b <branch> origin/main   # ALWAYS branch from fresh origin/main
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
| `chore:` `docs:` `style:` `refactor:` `perf:` `test:` `build:` `ci:` | none | `docs: update README` |

Scope optional but encouraged. End the body with the Linear ref: `Refs SAN-<n>`
(use `Fixes SAN-<n>` only if the merge should close the issue).

## Opening the PR

- **Base is ALWAYS `main`.** `gh pr create --base main`.
- Fill the PR template; keep the `Refs SAN-<n>` line.
- **Merge method: squash.** Every PR into `main` squashes to one Conventional
  Commit (the trunk keeps a linear history).
- Merging to `main` auto-deploys to the staging/QA environment.

## Releasing (cut a version)

You don't tag by hand. release-please runs on `main` and keeps one open
`chore: release vX.Y.Z` PR accumulating every Conventional Commit since the last
release.

1. **Merge that release PR (squash)** when told to cut the version → creates the
   tag + GitHub Release on the `main` commit and builds the image
   (`docker-image.yml`).
2. **Prod does NOT auto-deploy.** `deploy-prod.yml` is **`workflow_dispatch`
   only**. **You never deploy prod on your own initiative** — you hand the human
   the command (below). You may run it yourself **only** when they explicitly
   authorize that deploy in the conversation.

## Deploying prod

Prod ships a **version, never a branch**.

**Default: you don't dispatch it — the human does.** Asked to "deploy prod" /
"ship vX.Y.Z", hand them one of these:

```bash
npm run deploy:prod              # picker: lists published Releases, they choose
npm run deploy:prod -- --latest  # ship the newest Release
npm run deploy:prod -- --dry-run # show what it would dispatch, ship nothing
```

Or: Actions → "Deploy to Production" → "Run workflow" → **leave `tag` empty for
the latest published Release**, or type a tag.

**The exception — explicit authorization.** If the human explicitly tells you to
ship a named version in this conversation ("deployá v1.5.0 a prod", "dale,
shipealo"), you may dispatch it yourself. This is a real, bounded exception, not
a loophole:

- **Explicit and in-conversation.** "Ship v1.5.0" authorizes *that* deploy. It
  does not authorize the next one — approval doesn't carry across versions or
  sessions. Silence, a thumbs-up on a plan, or "sounds good" on a proposal is
  not authorization.
- **A version, never a branch.** Everything below still holds: only published
  Releases deploy, the dispatch must come from `main`, and you never hand-cut a
  tag to make a rejection go away.
- **Report what actually happened** — the run URL, and the real outcome. A
  failed prod deploy you describe as fine is worse than not deploying.

Everything else about prod stays a human decision: *whether* to ship, and *when*.
You execute an authorized deploy; you don't decide there should be one.

Three things worth knowing when this comes up:

- **There is no version dropdown and that's not an oversight.** GitHub reads
  `workflow_dispatch` inputs from static YAML and can't populate them from the
  Releases API. Empty `tag` = latest Release; `npm run deploy:prod` is the real
  picker. Don't "fix" this by hardcoding a `type: choice` list (SAN-450).
- **"Use workflow from" is NOT the version.** It picks which copy of
  `deploy-prod.yml` runs. The workflow **refuses any ref but `main`** — if
  someone hits that error, the fix is re-dispatching from `main`, not changing
  the tag.
- **Tags ≠ Releases.** Only published Releases deploy (SAN-430). `v1.0.6`–`v1.0.8`
  exist as tags and are *not* deployable. Never fix a rejection by hand-cutting
  a tag — cut a real release.

Merging the release PR does **not** freeze the trunk — keep working immediately.

## Hotfix

A "hotfix" request is a **decision, not a fixed procedure**. Answer one question
first: **can we ship the trunk's current tip to prod right now?**

### Case A — the trunk is shippable → it's a normal `fix:` (the default)

Almost every hotfix is this. There is no special path: branch from `main`, commit
`fix: ...`, squash-PR to `main`, merge the (patch) release PR to cut the tag, then
dispatch `deploy-prod.yml` with that tag. This works because `main` is kept
always-releasable (small PRs + feature flags).

### Case B — TRUE emergency: prod is broken AND the trunk has unshippable work in flight

The **only** time you cut a tag off a non-trunk-tip commit. You can't ship the
trunk's tip (half-done features / no flags), but prod is down. Confirm both
conditions hold before doing this — if the trunk is shippable, use Case A. Execute:

```bash
# 1. Branch from the EXACT tag running in prod (confirm what prod actually runs).
git fetch origin --tags
PROD_TAG="$(git tag --sort=-creatordate | grep '^v' | head -1)"   # e.g. v1.4.0
git switch -c hotfix/san-<n>-<desc> "$PROD_TAG"

# 2. Minimal fix + a fix: Conventional Commit. Push the branch.
git commit -am "fix: <summary> (SAN-<n>)"
git push -u origin hotfix/san-<n>-<desc>

# 3. Patch-bump the prod tag, push it, publish a Release on it (builds the image).
NEW="v1.4.1"   # patch bump of $PROD_TAG
git tag -a "$NEW" -m "hotfix: <summary> (SAN-<n>)"
git push origin "$NEW"
gh release create "$NEW" --title "$NEW" --notes "Hotfix: <summary> (SAN-<n>)"

# 4. Ship it (the human runs this): npm run deploy:prod -- --tag $NEW
#    Name the tag explicitly — don't use --latest. This is exactly the window
#    where "latest" is a moving target: if the trunk's release PR gets merged
#    while you work, `latest` becomes THAT release — the unshippable trunk you
#    opened this emergency path to avoid.
```

Then **forward-port** the fix into `main` so it isn't lost: open a **squash PR**
`hotfix/san-<n>-<desc> → main`, and in it bump `.release-please-manifest.json` to
the hotfix version (`1.4.1`) so release-please continues from there and doesn't
reissue a colliding number. Merge (squash).

#### Versioning a hotfix — avoid number collisions

The hotfix version is the **next patch above the tag prod runs**. Prod on `v1.4.0`
→ the hotfix is `v1.4.1` — *even if `main`'s release PR already has an in-flight
`v1.4.1`*. The manifest bump in the forward-port makes the pending trunk release
**slide up** to `v1.4.2`, so no number is issued twice and both carry the fix. Do
the forward-port **promptly** — if someone merges the stale release PR before the
manifest bump lands, *that* collides. If the would-be hotfix version is already a
published tag, pick the next free patch.

## Never

- Recreate a second long-lived branch (no `staging`, no release-pointer branch).
- Open a PR with a base other than `main`.
- Merge to `main` with anything but **squash**.
- Push directly to `main`, force-push it, or `--no-verify` without a stated reason.
- Create release tags by hand (except the Case B emergency hotfix) — merge the
  release PR instead.

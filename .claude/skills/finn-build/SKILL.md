---
name: finn-build
description: Claim the next safe agent-ready SanchoCMO issue from Linear, implement it, and open a PR into main. Use when asked to run the loop's builder, work the approved queue, or fix loop review feedback. Designed for /loop; one pass does one unit of work.
---

# Loop builder

One pass = one unit of work: fix review feedback on one existing PR, or build
one issue end to end. Under `/loop`, each iteration runs this skill once.

> **Repo conventions (authoritative: `docs/CONTRIBUTING.md` + `git-workflow` skill).**
> `main` is the single trunk. Branch `<author>/san-<n>-<kebab-desc>` from fresh
> `origin/main`; PR base is **always `main`**; merge method is **squash**;
> Conventional Commits (commitlint-enforced); reference the issue with
> `Refs SAN-<n>` in the PR/commit body. There is **no** `staging` branch.

## 0. Preflight

Before changing Linear, GitHub, branches, or files:

- Confirm this is the `Growth4U-systems/sanchocmo-openclaw` repo and `origin`
  is reachable. The default branch is `main` (verify with
  `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`).
- Work in a clean, isolated worktree. Require a clean working tree
  (`git status --porcelain` empty). If dirty, report the paths and end the
  pass. Never stash, reset, overwrite, or commit unrelated work.

## 1. Review feedback first

List open PRs labeled `loop-changes-requested`, including their labels:

```bash
gh pr list --state open --label loop-changes-requested --json number,title,headRefName,headRefOid,labels,updatedAt,url
```

Skip every PR carrying `needs-human-review`; it has left the automated repair
queue until a human resolves the escalation.

If any PR remains, choose the least recently updated one. Read its linked
Linear issue and latest `Loop review of COMMIT_SHA` verdict. Check out its
branch, fix only the "Must fix before merge" items, run the relevant checks,
push, remove `loop-changes-requested`, and comment with what changed. End this
pass.

If a proposed fix would cross an issue non-goal or requires a product decision,
do not implement it. Comment the exact conflict, add `needs-human-review`,
remove `loop-changes-requested`, and end the pass. This prevents the next loop
iteration from retrying a decision only a human can make.

## 2. Pick

Using the Linear connector, list issues on team **SanchoCMO** that meet every
condition:

- labeled `agent-ready`
- unassigned
- not labeled `blocked`
- no unresolved blocker relation

Sort by priority, then oldest first. If the queue is empty, say so and end the
pass. Do not invent work and do not pick a blocked issue.

## 3. Claim (the cooperative lock)

Assign yourself and move the issue to the team's started workflow state
(prefer `In Progress`; a review state such as `In Review` is used at ship
time). Claim before reading deeply or writing code. Re-fetch the issue
immediately after the update; if it is blocked, assigned to somebody else, or
no longer `agent-ready`, do not work it and return to step 2.

The assignee prevents different people from taking the same issue. It is not
an atomic lock between simultaneous sessions authenticated as the same Linear
user, so **only one builder loop may run per team**.

## 4. Read

Fetch the full issue including comments and relations. Implement only its
acceptance criteria. Non-goals are binding. Compare every `AC-N` against every
`NG-N` before editing. No unrelated changes and no opportunistic refactors.

If an acceptance criterion is ambiguous, conflicts with a non-goal, or depends
on an unresolved blocker, go to step 8. Never guess.

## 5. Build

- `git fetch origin`, then create the branch **from fresh `origin/main`**:
  `git checkout -b <author>/san-<n>-<kebab-desc> origin/main`, using the
  issue's real `SAN-<n>` id. `<author>` is the handle of the human you act for
  (from the Linear assignee / `git config user`); use `claude/...` only if
  there is none. Never assume or reuse another branch's name.
- Implement the acceptance criteria using the repository's existing style,
  architecture, and naming.
- Add or update tests when the change affects logic, data flow, permissions,
  integrations, or user-visible behavior.
- Preserve behavior outside the issue contract.

## 6. Verify

Run the repo's relevant checks; all checks attributable to this change must
pass before opening a PR (`npm ci` first if `node_modules` is absent):

- `npm run typecheck` — **required in CI; must pass.**
- `npm run build` — **required in CI; must pass** for changes that affect the app.
- `npm run lint` — informational, but the pre-push hook blocks on lint errors.
- The narrowest useful tests, e.g. `npm run test:lib`, `test:metrics`,
  `test:partnerships`, `test:runtime`, `test:plugins` — pick by touched area.

The pre-push hook runs `typecheck` + `lint` + `lint:paths --strict`. If a broad
check has a pre-existing unrelated failure, run the relevant targeted check,
preserve the evidence, and disclose both results in the PR. Do not
`--no-verify` without stating the reason in the PR.

Review `git diff` and `git status` before shipping. Stop if the diff contains
unrelated work or generated secrets.

## 7. Ship

Commit with a **Conventional Commit** (`feat:`/`fix:`/`docs:`/`refactor:`/…;
commitlint enforces it), then push and open a PR into `main`:
`gh pr create --base main`. The PR **title** is the Conventional Commit that
the squash-merge will use. The description must include:

- What changed and why
- `Refs SAN-<n>` (the real Linear id). Use `Fixes SAN-<n>` only if merging
  should close the issue.
- A scope ledger: one evidence line per `AC-N`, one preservation line per
  `NG-N`, and `Other behavior changes: None`
- Numbered manual test steps matching what was actually built
- Automated checks run and their results
- Risk: Low / Medium / High

If `Other behavior changes: None` is not true, stop and get the Linear issue
amended before opening the PR.

Comment the PR URL on the Linear issue and move it to `In Review`. **Never
merge and never enable auto-merge** — a human squash-merges into `main`. End
the pass.

## 8. Blocked

Comment one specific question a human can answer asynchronously, apply the
`blocked` label, and unassign yourself. Leave `agent-ready` in place: the pick
query excludes `blocked`, so the issue safely reappears only after a human
answers and removes that label.

Never use "this is unclear" as the question. State the exact decision, the
available options, and which acceptance criterion it affects. End the pass so
the next iteration can pick different work.

---

*Adapted from [finna/Finn-loop](https://github.com/finna/Finn-loop) (MIT) for
sanchocmo-openclaw: branch `<author>/san-<n>`, base `main`, squash,
`Refs SAN-<n>`, repo verify commands.*

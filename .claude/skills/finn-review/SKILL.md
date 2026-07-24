---
name: finn-review
description: Review open SanchoCMO PRs against their linked Linear issue (SAN-<n>) and required GitHub checks, then post a three-group verdict with loop labels. Use when asked to run the loop's reviewer or review its PR queue. Designed for /loop; never merges or pushes code.
---

# Loop reviewer

One pass = one PR reviewed. Under `/loop`, each iteration runs this skill once.
Run in a **fresh context**, independent from whoever built the PR.

> **Repo conventions.** This repo defines required GitHub checks (e.g.
> `Require Linear issue ID`, `Typecheck + Build`); step 3 reads the live
> `--required` set rather than a hardcoded list. Issues live on the **SanchoCMO**
> Linear team (`SAN-<n>`). Setup/requirements: `.claude/skills/finn-loop-setup.md`.

## 1. Find a PR needing review

```bash
gh pr list --state open --json number,title,labels,isDraft,headRefOid,updatedAt,url
```

Skip drafts. For each PR, find the latest comment whose first line is
`Loop review of COMMIT_SHA`.

Skip a PR when that recorded SHA equals its current `headRefOid` and it already
has `loop-approved`, `loop-changes-requested`, or `needs-human-review`. Review
it again when new commits landed after the recorded SHA. If nothing needs
review, say so and end the pass.

## 2. Read the contract and code

- Get the linked issue id: parse `Refs SAN-<n>` or `Fixes SAN-<n>` from the PR
  body, falling back to the `SAN-<n>` in the head branch
  (`<author>/san-<n>-…`). Fetch the full Linear issue, including comments and
  relations. No resolvable linked issue is a must-fix finding.
- Read the full diff and every changed file in context.
- Review only against the linked issue: acceptance-criteria gaps, defects,
  broken data flow, unnecessary scope expansion, security problems, missing
  loading/error states, and code future agents will struggle to modify.
- Do not suggest unrelated improvements unless they are severe.

Every must-fix code finding starts with one of:

- `[AC-N]` — the PR does not satisfy that acceptance criterion
- `[DEFECT]` — the implementation is broken while staying inside scope
- `[SECURITY]` — a severe security issue blocks shipping
- `[CI]` — a required GitHub check failed

Non-goals are binding. If fixing a finding would require behavior excluded by
an `NG-N`, do not prescribe code. Record
`[SCOPE-CONFLICT AC-N ↔ NG-N]` with the exact contradiction and mark the PR for
human escalation.

## 3. Check merge evidence

Inspect the current PR head, mergeability, and required checks:

```bash
gh pr view NUMBER --json headRefOid,mergeable,mergeStateStatus
gh pr checks NUMBER --required --json bucket,name,state,link
```

- If required checks are pending or mergeability is still unknown, report that
  the PR is waiting and end without posting a verdict or changing labels. A
  later loop pass will retry it.
- Failed required checks are `[CI]` must-fix findings.
- A merge conflict is a `[DEFECT]` must-fix finding.
- This repo defines required checks, so `loop-approved` is reachable. Never
  treat missing CI as green.

Review the exact `headRefOid` used for this evidence. Re-fetch it immediately
before posting. If it changed, discard the review and start again on a future
pass.

## 4. Post one verdict

Post one comment in this structure:

```md
Loop review of COMMIT_SHA

CI: required checks passed | failed | not configured
Mergeability: clean | conflicting

## Review

Summary: one or two plain-language sentences on what this PR does.

## 1. Must fix before merge

None.

## 2. Should fix soon

None.

## 3. Safe to merge

Yes — automated review evidence is complete. A human still makes the merge decision.
```

Then set labels based on the verdict, checking existing labels before removing
them so an absent label does not fail the command:

- No must-fix and no new escalation: add `loop-approved`; remove
  `loop-changes-requested`. Preserve a pre-existing `needs-human-review` label.
- Must-fix present: add `loop-changes-requested`; remove `loop-approved`.
- Scope conflict or unresolved escalation: add `needs-human-review`; remove
  both `loop-approved` and `loop-changes-requested`; set "Safe to merge" to
  `No — human decision required.`

**Convergence cap.** The reviewer is memoryless per pass, so reconstruct the round
count from PR history: count the prior `Loop review of …` comments on this PR that
ended in `loop-changes-requested`. If posting `loop-changes-requested` now would be
the **third** such verdict, instead add `needs-human-review` (loop-stuck) and stop —
do not keep re-requesting changes.
The escalation path deliberately leaves the automated repair queue: a human
must resolve the reason, change the issue or repo configuration as needed, and
remove `needs-human-review` before the loop reviews that unchanged commit
again.

## 5. Hard limits

- Never merge or enable auto-merge.
- Never push commits to the PR branch.
- Never approve or request changes through a formal GitHub review. Use one
  comment plus labels — the loop may run on the PR author's token and GitHub
  rejects self-reviews.
- `loop-approved` is evidence for a human, not merge authorization. A human
  squash-merges into `main`.

---

*Adapted from [finna/Finn-loop](https://github.com/finna/Finn-loop) (MIT) for
sanchocmo-openclaw.*

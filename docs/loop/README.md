# Assisted delivery loop

The **factory**: how a unit of work goes from an approved spec to merged code.
This is the *assisted* (human-in-the-loop) version — deliberately minimal. We
prove it on real work before automating any part of it.

> Two tracks are in flight. This loop is **Track A** (the factory). The
> Data Platform / metrics work is **Track B** (the first product built with it).
> The loop's first payloads are the metrics foundation specs (`specs/SDP-P001…`).

## The loop

```
SPEC (human-approved)
   ↓
LINEAR issue (SAN-<n>)  →  branch <author>/san-<n>-<desc> from fresh origin/main
   ↓
BUILD  (isolated worktree — additive, within agreed paths, with tests/evidence)
   ↓
INDEPENDENT REVIEW  (fresh context / separate agent — adversarial vs the spec's AC)
   ↓  ≤ 2 build↔review correction rounds
PR  (base main, squash, "Refs SAN-<n>")
   ↓
HUMAN MERGE  🚀  (a person merges; nothing merges itself)
```

## Roles

| Role | Who | Rule |
|---|---|---|
| Spec owner | human | approves the spec **before** build; owns business decisions |
| Builder | agent (or dev) | isolated worktree; only additive changes in agreed paths |
| Independent reviewer | **separate** agent context (optionally another model) | never the builder; checks each acceptance criterion adversarially |
| Merger | human | the only actor that merges to `main` |

The reviewer being independent from the builder is the point — it is why the loop
catches what a self-review misses. For code diffs, the reviewer also runs the
`/code-review` command (a plugin slash-command) in addition to reading against the
spec.

## Spec format

Specs live in [`specs/`](specs/), one file per packet, and follow this shape
(see [`specs/SDP-P001-data-platform-adr.md`](specs/SDP-P001-data-platform-adr.md)):

- **Problem** — one paragraph.
- **Acceptance Criteria** — checkable `AC-n` items; the reviewer maps 1:1.
- **Non-goals** — explicit `NG-n` boundaries.
- **Relevant files** — where the change lands / what it reads.
- **Test expectations** — what proves it.
- **How to verify** — exact commands + manual checks a reviewer can rerun.

A spec is only ready for build once a human has approved it.

## Repo conventions (do not reinvent)

- Branch/commit/PR/release rules: **[`docs/CONTRIBUTING.md`](../CONTRIBUTING.md)**
  and the `git-workflow` skill. `main` is the single trunk; base is always `main`;
  merge method is **squash**; every change needs a `SAN-<n>`.
- Required CI: `Require Linear issue ID`, `typecheck`, `build`.

## Promotion gate — when we automate more of the loop

Promote beyond assisted/manual mode only after the first packets each satisfy:

- acceptance criteria linked to tests or reviewable evidence;
- no changes outside agreed paths;
- no unresolved P0/P1 finding;
- at most two build↔review correction rounds;
- no skipped verification command;
- no rollback/hotfix attributable to the change within a 7-day window.

Record, per packet: spec / build / review / human-touch time, model cost, CI
attempts, findings. Rework the loop if median overhead exceeds 30% without
reducing human effort, review findings or escaped defects.

## Explicitly deferred (not built now)

These are the *final* factory, not the first one. They come **only** after the
assisted loop completes 3–5 clean PRs against the promotion gate:

- durable orchestration (Temporal) and 24/7 unattended runners;
- Slack notification + 🚀 reaction → merge, and the ✅ / Linear-Done callback;
- automated merge / merge queue;
- cross-repo control plane extraction.

See the full target design in `tasks/prd-autonomous-delivery-control-plane.md`
(planning; not committed to the repo) — this README intentionally implements only
its first, assisted slice.

## Based on

This loop adapts **[Finn-loop](https://github.com/finna/Finn-loop)** (MIT) — a
three-skill Claude Code factory (spec / build / review, **humans merge**). Our
spec shape (`AC-N` / `NG-N` / relevant files / test expectations / how to verify)
matches Finn's, and the "explicitly deferred" list above maps onto Finn's own
staged roadmap: fresh-reviewer convergence → a Slack **🚀** merge-ready lane
(react to authorize; re-verify then squash-merge) → risk-aware merging →
preview/doc gates → watchdog → leased workers. The executable `finn-*` skills,
adapted to this repo's `git-workflow` (branch `<author>/san-<n>`, base `main`,
squash, `Refs/Fixes SAN-<n>`), are adopted in a follow-up packet.

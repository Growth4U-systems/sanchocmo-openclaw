# Loop skills — setup & requirements

The `finn-spec`, `finn-build`, `finn-review` skills implement the assisted
delivery loop, adapted from [finna/Finn-loop](https://github.com/finna/Finn-loop)
(MIT) to this repo's `git-workflow`. This doc is the self-contained setup; the
fuller process narrative lives in `docs/loop/README.md` (added by SAN-490).
One-time setup before running `/loop`.

## Requirements

- **Claude Code ≥ 2.1.71** — `/loop` was added in that release
  (`/loop /finn-build`, `/loop /finn-review`).
- **Linear connector** enabled and able to read the **SanchoCMO** team's labels
  and workflow states.
- **`gh`** authenticated with write access to `Growth4U-systems/sanchocmo-openclaw`.
- Required GitHub checks already exist (e.g. `Require Linear issue ID`,
  `Typecheck + Build`) — so a `loop-approved` verdict is reachable and CI is never
  treated as missing. `finn-review` reads the live `--required` set at runtime
  rather than a hardcoded list.

## Labels (create once, idempotently)

**Linear (SanchoCMO team):**

- `agent-ready` — the human approval gate; only a human applies it.
- `blocked` — a build pass asked a question and left the queue.

**GitHub (`Growth4U-systems/sanchocmo-openclaw`):**

```bash
gh label create loop-approved          -c "#0E8A16" -d "Loop reviewer: no must-fix vs the Linear contract; evidence for a human merge" 2>/dev/null || true
gh label create loop-changes-requested -c "#FBCA04" -d "Loop reviewer: must-fix findings; builder should address only these" 2>/dev/null || true
gh label create needs-human-review     -c "#B60205" -d "Loop escalation: scope conflict / loop-stuck / sensitive path — out of the automated queue" 2>/dev/null || true
```

## Daily rhythm

1. `/finn-spec` on a new idea → read the filed `SAN-<n>` issue → apply
   `agent-ready` in Linear if you approve the exact contract.
2. `/loop /finn-build` (one builder loop per team). Optionally `/loop /finn-review`
   in a second session for continuous review.
3. Merge only PRs that are `loop-approved`, conflict-free, and green on required
   checks. **Squash into `main`.** A `needs-human-review` PR needs you to resolve
   the escalation first.
4. Answer `blocked` issues, then remove the `blocked` label to requeue them.

## Boundaries (do not drift)

- **Humans merge.** Agents never merge or enable auto-merge.
- Linear = what to build & readiness; GitHub = code/CI/merge; the repo = how the
  loop behaves. No side-channel instructions — if it isn't in the issue, it
  doesn't exist.
- `/loop` runs only while its Claude Code session is open. Watch the first passes
  and your usage before leaving it unattended.

Slack (🚀 merge-ready), risk-aware auto-merge, watchdog and persistent workers are
**deferred** — see the staged roadmap in `docs/loop/README.md` (added by SAN-490)
and the planning doc `tasks/prd-autonomous-delivery-control-plane.md` (planning;
not committed). Add them one at a time after the assisted loop has closed several
clean PRs.

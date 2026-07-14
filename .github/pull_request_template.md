## Linear

<!-- Required for Linear/GitHub automation. Prefer "Refs SAN-123"; use "Fixes SAN-123" only when the PR should close the issue on merge. -->
Refs SAN-123

## Summary

<!-- 1-3 bullets: what does this PR do? -->

## Why

<!-- The motivation: bug, feature request, refactor justification, link to issue -->

## Test plan

- [ ] Local `npm run lint` passes
- [ ] Local `npm run typecheck` passes
- [ ] Local `npm run build` passes
- [ ] Manually tested the feature/fix in dev (`npm run dev`)
- [ ] (If UI) screenshots / Loom included below

## Screenshots / Notes

<!-- Optional. Drop screenshots, GIFs, or any context the reviewer should know. -->

---

**Target branch: always `main`.** `main` is the single trunk (SAN-444): feature,
fix, hotfix, and the release-please release PR all target `main` and merge with
**squash**. There is no `staging` *branch* — the trunk auto-deploys to the
staging/QA *environment* (the VPS is still called "staging") on every push, and
prod is a separate manual step (`deploy-prod.yml` is `workflow_dispatch` only).
Releases are tags cut from `main` by release-please; don't tag by hand.
See `docs/CONTRIBUTING.md` / the `git-workflow` skill.

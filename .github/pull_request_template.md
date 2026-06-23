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

**Target branch: always `staging`.** Feature, fix, hotfix, and the
release-please release PR all target `staging` and merge with **squash**. `main`
is automation-only (fast-forwarded to each release tag) — never open a PR into it.
See `docs/CONTRIBUTING.md` / the `git-workflow` skill.

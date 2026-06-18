# Plan: re-enable arm64 multi-arch image builds

> **Status:** deferred — gated on the repo going public or a Team/Enterprise plan.
> **Linear:** SAN-237 · **Reverses part of:** SAN-236 · **Shares billing gate with:** SAN-230 (prod approval reviewers).

## Context

`docker-image.yml` currently builds **amd64-only** (SAN-236). arm64 was dropped
because building it on an amd64 runner means **QEMU emulation** of `npm ci` +
`next build`, which alone pushed every image build past **~40 min**. The proper
fix — **native** arm64 runners — isn't available: `ubuntu-24.04-arm` hosted
runners need a **Team/Enterprise** plan on a **private** repo. The same billing
limit blocks the prod approval gate (SAN-230).

The product isn't distributed yet (private GHCR package, no ARM consumers), so
amd64-only is fine for now. This plan describes bringing arm64 back **fast**
(native, not emulated) once the constraint lifts.

## Preconditions (either unlocks native arm64 runners)

1. **Repo is public** — after the Fase 0 secret purge (packaging plan). Public
   repos get `ubuntu-24.04-arm` hosted runners for free, **or**
2. **GitHub plan upgraded to Team/Enterprise** — native arm64 runners for
   private repos.

Don't re-enable arm64 via QEMU emulation just to have it — that reintroduces the
40-min builds. Wait for native runners.

## Approach: matrix of native runners + manifest merge

The Docker-recommended pattern for fast multi-arch without emulation: build each
arch on its own native runner, push by digest, then assemble the manifest list.

```yaml
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: linux/amd64
            runner: ubuntu-latest
          - platform: linux/arm64
            runner: ubuntu-24.04-arm     # native — no QEMU
    runs-on: ${{ matrix.runner }}
    steps:
      # login to ghcr, set up buildx
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: ${{ matrix.platform }}
          # push by digest only (no tags here); the merge job applies the tags
          outputs: type=image,name=ghcr.io/growth4u-systems/sanchocmo,push-by-digest=true,name-canonical=true,push=true
          cache-from: type=registry,ref=ghcr.io/growth4u-systems/sanchocmo:buildcache
          cache-to: type=registry,ref=ghcr.io/growth4u-systems/sanchocmo:buildcache,mode=max
          build-args: GIT_COMMIT=${{ github.sha }}
      # export the per-arch digest as an artifact
  merge:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # download digests, docker/metadata-action for the real tags, then:
      - run: |
          docker buildx imagetools create \
            $(jq -cr '.tags | map("-t " + .) | join(" ")' <<< "$DOCKER_METADATA_OUTPUT_JSON") \
            $(printf 'ghcr.io/growth4u-systems/sanchocmo@sha256:%s ' *)
```

### Why this is fast

- Each arch builds **natively, in parallel** — no emulation. Target wall-clock
  **<15 min** for the full multi-arch release.
- The **registry buildcache** (SAN-236) is shared across both arch jobs and
  persists between runs (no 10 GB gha cap).

## Changes required

- `.github/workflows/docker-image.yml`: convert the single `Build and push`
  step into the `build` matrix + `merge` job above.
- Re-introduce `linux/arm64` (per matrix entry) — undo the amd64-only pin from
  SAN-236.
- Keep `cache-to/from: type=registry,…:buildcache` (already in place).
- Confirm the tag set (`:vX.Y.Z` + `:latest` on release, `:edge` on staging,
  dispatch tag) still flows through `metadata-action` → `imagetools create`.

## Verification

- `docker manifest inspect ghcr.io/growth4u-systems/sanchocmo:vX.Y.Z` lists both
  `linux/amd64` and `linux/arm64`.
- `docker pull` on an Apple Silicon / ARM host runs natively (no
  `--platform`/emulation warning); Mission Control boots and is healthy.
- Build wall-clock stays low (native parallel arch builds).

## Alternatives considered

- **Conditional QEMU (arm64 only on release):** arm64 still emulated → release
  builds ~25-40 min. Rejected for time.
- **Drop arm64 permanently:** rejected — an open-source product should run
  natively on Apple Silicon and ARM servers.

## Related

- **SAN-236** — the amd64-only change this partially reverses.
- **SAN-230** — prod approval gate, blocked by the same Team-plan billing limit.
- **Packaging plan** (`docs/plans/sanchocmo-packaging-plan.md`) — Fase 5/6
  (public versioned images).

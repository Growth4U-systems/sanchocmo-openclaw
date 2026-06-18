# Native multi-arch image builds (amd64 + arm64)

> **Status:** ✅ implemented in SAN-236 (`docker-image.yml` matrix + merge).
> **Linear:** SAN-237 · **Related:** SAN-236, SAN-230.

## Context

The image build used a single amd64 runner building `linux/amd64,linux/arm64`
together — the arm64 leg ran under **QEMU emulation** of `npm ci` + `next build`,
which pushed every build past **~40 min**. An interim amd64-only switch was
considered, but it turned out **native arm64 runners are available** here:

- The org (`Growth4U-systems`) is on **GitHub Team** (`gh api orgs/... .plan.name
  → "team"`), and **verified empirically** (2026-06-18) — a throwaway job on
  `runs-on: ubuntu-24.04-arm` completed successfully (`uname -m → aarch64`).

So we did **not** defer arm64 or wait for the repo to go public. The fix is to
build each arch on its **own native runner in parallel** and merge the manifest.

(My earlier read that this needed a public repo / plan upgrade was wrong — Team
already includes native arm64 hosted runners. Same as the prod-gate billing
question — worth re-checking that too, since Team should support it.)

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

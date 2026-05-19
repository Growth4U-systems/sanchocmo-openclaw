# System ENVs → GitHub Environments — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop SSH-editing `~/.openclaw/.env` on staging for **all** secrets and config — not just the LLM/API keys originally scoped. Move source-of-truth to GitHub Environment secrets/variables, auto-applied on deploy.

**Architecture:** A generic Python upsert script (`scripts/upsert-env.py`, TDD'd via stdlib `unittest`) reads a base64-encoded JSON dict of `{KEY: VALUE}` from stdin and writes those keys to a target `.env` file, **skipping empty values** (so unset secrets are no-ops). `deploy-staging.yml` builds that JSON from an explicit list of GitHub Environment secrets, `scp`s the script to the VPS, and runs it via `python3 /tmp/upsert-env.py …` before `docker compose up -d`. The container is force-recreated only when the `.env` content sha256 actually changed. `deploy-prod.yml` gets the same wiring **but stays a no-op** until the `production` GitHub Environment is populated (it currently is not — staging is de-facto prod as of 2026-05).

**Tech Stack:** Python 3 (stdlib only — `json`, `base64`, `pathlib`, `argparse`, `sys`), `unittest`. Bash for the operator helper (`scripts/load-secrets-from-env.sh`). GitHub Actions workflow YAML. `gh` CLI for bulk secret upload.

**Predecessor:** PR #84 (`investigate/apis-settings-tab` → `staging`) — **merged** as commit `63fb444a`.

**Scope evolution (why this is v2):** v1 (the version that shipped with PR #85) scoped only the 22 keys backing `SERVICE_ENV_MAP` in `src/pages/api/env/index.ts`. After auditing the real `.env` on the VPS (2026-05-19), it's clear that ~30 other secrets — auth/infra, skills APIs, OAuth pairs — suffer the same SSH-ed-by-hand problem. v2 expands the staging Environment scope to all of them. Prod scope stays minimal (deferred until prod is revived).

---

## Files

- ✅ **Created** (PR #85): `scripts/upsert-env.py` — pure-function `upsert(env_path, updates)` returning per-key action (`added` / `updated` / `unchanged` / `skipped_empty`). CLI reads base64-encoded JSON from stdin.
- ✅ **Created** (PR #85): `scripts/test_upsert_env.py` — 10 `unittest` cases (stdlib only).
- ✅ **Created** (PR #85, this commit): `scripts/load-secrets-from-env.sh` — bulk-upload helper. Reads a `.env` snapshot, calls `gh secret set` per non-empty key, dry-run by default, value passed via stdin (never `--body`) for safety.
- ✅ **Modified** (PR #85): `.github/workflows/ci.yml` — new `verify-scripts` job running the unittest suite.
- ⏳ **Modify** (Task 3 — next PR): `.github/workflows/deploy-staging.yml` — generalize the existing `SANCHO_INTERNAL_API_TOKEN` inline upsert into the script-based pattern across all 52 secrets.
- ⏳ **Modify** (Task 4 — same PR): `.github/workflows/deploy-prod.yml` — add the env upsert step entirely (currently has none); 22-key scope; stays a no-op until `production` Environment is populated.
- ⏳ **Create** (Task 5 — same PR): `docs/runbooks/system-keys-management.md` — how to add/rotate/disable a key.

---

## Secret tiers — `staging` GitHub Environment (52 secrets + 7 variables)

The workflow's `env:` block enumerates every secret it wants; the Python `KEYS` list inside the workflow must match. Tiers are documentation-only — the script treats them identically.

### Tier 1 — Auth & infra (21 secrets, blast radius = highest)

```
NEXTAUTH_SECRET            — NextAuth session signer
NEXTAUTH_URL               — public auth URL
ENCRYPTION_KEY             — encrypts stored OAuth tokens at rest (rotation invalidates them)
DATABASE_URL               — Neon Postgres connection
SUPABASE_SERVICE_ROLE_KEY  — Supabase admin role (different from ANON_KEY)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DISCORD_BOT_TOKEN
DISCORD_BOT_CLIENT_ID
CERVANTES_DISCORD_BOT_TOKEN
CERVANTES_DISCORD_BOT_CLIENT_ID
CERVANTES_GUILD_ID
DISCORD_WEBHOOK_CERVANTES
OD_API_TOKEN               — Open Design daemon bearer
OPENCLAW_GATEWAY_TOKEN     — internal OpenClaw gateway
GTM_OS_API_TOKEN           — YALC / GTM-OS
YALC_API_TOKEN
CLAUDE_CODE_OAUTH_TOKEN    — cron `claude -p` invocations
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_SIGNING_SECRET
```

### Tier 2 — System APIs (22 secrets — the original v1 scope)

```
ANTHROPIC_API_KEY          OPENROUTER_API_KEY    OPENAI_API_KEY        GEMINI_API_KEY
XAI_API_KEY                MINIMAX_API_KEY       BRAVE_API_KEY         APIFY_API_KEY
FIRECRAWL_API_KEY          SERPER_API_KEY        DATAFORSEO_LOGIN      DATAFORSEO_PASSWORD
NOTION_API_KEY             SUPABASE_URL          SUPABASE_ANON_KEY     FAL_API_KEY
WAVESPEED_API_KEY          DUMPLING_API_KEY      SLACK_BOT_TOKEN       INSTANTLY_API_KEY
METRICOOL_API_KEY          SANCHO_INTERNAL_API_TOKEN
```

### Tier 3 — Skill APIs (9 secrets — present on VPS but not in `SERVICE_ENV_MAP` yet)

```
APOLLO_API_KEY             — Apollo.io prospecting
GHL_API_KEY                — GoHighLevel
GHL_LOCATION_ID
META_ACCESS_TOKEN          — Meta Ads
META_AD_ACCOUNT_ID
PAGESPEED_API_KEY          — Google PageSpeed Insights
UNIPILE_API_KEY            — Unipile (LinkedIn messaging)
UNIPILE_DSN
DATAFORSEO_API_KEY         — DataForSEO token (separate from LOGIN/PASSWORD pair)
```

Folding Tier 3 into `SERVICE_ENV_MAP` (so they appear in the APIs admin panel) is **out of scope** for this plan — file as a follow-up.

### Variables (7, non-secret config — `${{ vars.X }}` not `${{ secrets.X }}`)

```
BASE_URL                   NEXT_PUBLIC_ENV_LABEL    OD_WEB_URL
OD_ALLOWED_ORIGINS         OPEN_DESIGN_IMAGE        MC_CHAT_GATEWAY
SLACK_REDIRECT_URI
```

The workflow references variables as `${{ vars.X }}` and merges them into the same upsert payload. **Optional for v2** — if you want to defer them, keep editing them by SSH for now and add as a follow-up.

### Notes from the 2026-05-19 audit

- `BRAVE_API_KEY` and `METRICOOL_API_KEY` are declared in `SERVICE_ENV_MAP` but currently unset on the VPS. Declared in the workflow anyway — the `skip_empty` rule keeps them no-op.
- `ANTHROPIC_API_KEY` intentionally absent from the `production` Environment scope (prod uses OpenAI for agents per the operator).
- `SANCHO_INTERNAL_API_TOKEN`, `NEXTAUTH_*`, `DATABASE_URL`, `ENCRYPTION_KEY` missing from prod is **expected staleness** (prod is not currently being deployed against).

### Prod scope — minimal until revived

When prod gets revived, **mirror the staging tiers**. Until then, the `production` Environment has whatever secrets the previous deploy needed (see prod snapshot) — leave them. The workflow change (Task 4) is safe even with an unpopulated Environment because `skip_empty` no-ops every unset secret.

---

### Task 0: Populate the `staging` GitHub Environment

**Risk gate.** Do not run Task 3 (the staging workflow change) until this is complete. The `skip_empty` rule in `upsert-env.py` protects against missing secrets, but a *wrong* value will overwrite the VPS's real one on next deploy.

- [ ] **Step 1: Verify `gh` is authenticated**

```bash
gh auth status
# expect: Logged in to github.com as <you>
```

- [ ] **Step 2: Snapshot the staging `.env` (if not already done)**

```bash
scp sancho-cmo-staging:~/.openclaw/.env /tmp/staging.env.snapshot
chmod 600 /tmp/staging.env.snapshot
```

- [ ] **Step 3: Dry-run the bulk upload**

```bash
scripts/load-secrets-from-env.sh --env staging --from /tmp/staging.env.snapshot
```

Read the output carefully. Every key from `/tmp/staging.env.snapshot` whose value is non-empty will be queued for upload. Confirm:
- All 21 Tier 1 names are listed (or note the ones that are missing — those still need manual setup on the VPS).
- All 20 Tier 2 names present on staging (per audit) are listed.
- All 9 Tier 3 names are listed.
- Total `Would upload` ≈ 50 (give or take based on what's set).

If anything looks off (unknown keys you don't recognize, or important keys missing), inspect the snapshot before proceeding.

- [ ] **Step 4: Execute the upload**

```bash
scripts/load-secrets-from-env.sh --env staging --from /tmp/staging.env.snapshot --confirm
```

This calls `gh secret set --env staging <KEY>` once per non-empty key. Values are piped via stdin (not `--body`), so they never enter `ps`/history.

- [ ] **Step 5: Verify**

```bash
# Count secrets in the staging Environment
gh api "/repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/environments/staging/secrets" \
  --paginate -q '.secrets | length'
```

Compare against the `Uploaded` count from Step 4 — should match.

Spot-check by name in the UI: GitHub → Settings → Environments → `staging` → Secrets.

- [ ] **Step 6: Shred the snapshot**

```bash
shred -u /tmp/staging.env.snapshot
```

(Keep `/tmp/prod.env.snapshot` until prod is revived; or shred it now if you've already finished using it.)

**Acceptance:** `staging` GitHub Environment contains every secret currently set on the staging VPS. Workflow change in Task 3 will pick them up automatically.

---

### Task 0b (optional): Populate `staging` variables

7 non-secret values (BASE_URL, NEXT_PUBLIC_ENV_LABEL, etc.) — GitHub doesn't let you bulk-set variables from CLI as cleanly as secrets, so this is faster in the UI for 7 items.

- [ ] **Step 1: For each variable, grab the value from the snapshot**

```bash
for v in BASE_URL NEXT_PUBLIC_ENV_LABEL OD_WEB_URL OD_ALLOWED_ORIGINS \
         OPEN_DESIGN_IMAGE MC_CHAT_GATEWAY SLACK_REDIRECT_URI; do
  echo "$v=$(grep "^$v=" /tmp/staging.env.snapshot | cut -d= -f2-)"
done
```

- [ ] **Step 2: GitHub → Settings → Environments → `staging` → Variables → New variable**

One at a time. Name matches env var; value pasted from Step 1.

If you'd rather skip Task 0b for now, the workflow change (Task 3) can be implemented to only handle secrets — variables can stay in the VPS `.env` until later.

---

### Task 1: TDD the upsert script ✅ DONE (PR #85)

See `scripts/upsert-env.py` + `scripts/test_upsert_env.py` already on this branch.

### Task 2: Wire the script into CI ✅ DONE (PR #85)

See `.github/workflows/ci.yml verify-scripts` job already on this branch.

---

### Task 3: Generalize the upsert in `deploy-staging.yml`

**Files:** `.github/workflows/deploy-staging.yml`

Replaces the existing `SANCHO_INTERNAL_API_TOKEN`-only inline upsert with the script-based pattern across all 52 secrets (+ 7 variables if Task 0b is done).

- [ ] **Step 1: Define the `env:` block with all secret names**

In the Deploy step, replace the current `env:` block with one that lists every secret declared in Tiers 1–3 above. Pattern:

```yaml
        env:
          # Existing infra
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          DEPLOY_PATH: ${{ vars.DEPLOY_PATH || '~/.openclaw' }}
          SHA: ${{ github.sha }}
          ENABLE_YALC_SERVICE: ${{ vars.ENABLE_YALC_SERVICE || '1' }}
          YALC_BUILD_CONTEXT: ${{ vars.YALC_BUILD_CONTEXT || '../Yalc-Growth4U' }}
          YALC_REF: ${{ vars.YALC_REF || 'main' }}
          YALC_REPO_TOKEN: ${{ secrets.YALC_REPO_TOKEN }}
          # === Tier 1 — Auth & infra ===
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
          NEXTAUTH_URL: ${{ secrets.NEXTAUTH_URL }}
          ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
          DISCORD_BOT_CLIENT_ID: ${{ secrets.DISCORD_BOT_CLIENT_ID }}
          CERVANTES_DISCORD_BOT_TOKEN: ${{ secrets.CERVANTES_DISCORD_BOT_TOKEN }}
          CERVANTES_DISCORD_BOT_CLIENT_ID: ${{ secrets.CERVANTES_DISCORD_BOT_CLIENT_ID }}
          CERVANTES_GUILD_ID: ${{ secrets.CERVANTES_GUILD_ID }}
          DISCORD_WEBHOOK_CERVANTES: ${{ secrets.DISCORD_WEBHOOK_CERVANTES }}
          OD_API_TOKEN: ${{ secrets.OD_API_TOKEN }}
          OPENCLAW_GATEWAY_TOKEN: ${{ secrets.OPENCLAW_GATEWAY_TOKEN }}
          GTM_OS_API_TOKEN: ${{ secrets.GTM_OS_API_TOKEN }}
          YALC_API_TOKEN: ${{ secrets.YALC_API_TOKEN }}
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          SLACK_CLIENT_ID: ${{ secrets.SLACK_CLIENT_ID }}
          SLACK_CLIENT_SECRET: ${{ secrets.SLACK_CLIENT_SECRET }}
          SLACK_SIGNING_SECRET: ${{ secrets.SLACK_SIGNING_SECRET }}
          # === Tier 2 — System APIs ===
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
          BRAVE_API_KEY: ${{ secrets.BRAVE_API_KEY }}
          APIFY_API_KEY: ${{ secrets.APIFY_API_KEY }}
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
          SERPER_API_KEY: ${{ secrets.SERPER_API_KEY }}
          DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          FAL_API_KEY: ${{ secrets.FAL_API_KEY }}
          WAVESPEED_API_KEY: ${{ secrets.WAVESPEED_API_KEY }}
          DUMPLING_API_KEY: ${{ secrets.DUMPLING_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          INSTANTLY_API_KEY: ${{ secrets.INSTANTLY_API_KEY }}
          METRICOOL_API_KEY: ${{ secrets.METRICOOL_API_KEY }}
          SANCHO_INTERNAL_API_TOKEN: ${{ secrets.SANCHO_INTERNAL_API_TOKEN }}
          # === Tier 3 — Skill APIs ===
          APOLLO_API_KEY: ${{ secrets.APOLLO_API_KEY }}
          GHL_API_KEY: ${{ secrets.GHL_API_KEY }}
          GHL_LOCATION_ID: ${{ secrets.GHL_LOCATION_ID }}
          META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
          META_AD_ACCOUNT_ID: ${{ secrets.META_AD_ACCOUNT_ID }}
          PAGESPEED_API_KEY: ${{ secrets.PAGESPEED_API_KEY }}
          UNIPILE_API_KEY: ${{ secrets.UNIPILE_API_KEY }}
          UNIPILE_DSN: ${{ secrets.UNIPILE_DSN }}
          DATAFORSEO_API_KEY: ${{ secrets.DATAFORSEO_API_KEY }}
          # === Variables (optional — Task 0b) ===
          # Comment these out if you skipped Task 0b
          BASE_URL: ${{ vars.BASE_URL }}
          NEXT_PUBLIC_ENV_LABEL: ${{ vars.NEXT_PUBLIC_ENV_LABEL }}
          OD_WEB_URL: ${{ vars.OD_WEB_URL }}
          OD_ALLOWED_ORIGINS: ${{ vars.OD_ALLOWED_ORIGINS }}
          OPEN_DESIGN_IMAGE: ${{ vars.OPEN_DESIGN_IMAGE }}
          MC_CHAT_GATEWAY: ${{ vars.MC_CHAT_GATEWAY }}
          SLACK_REDIRECT_URI: ${{ vars.SLACK_REDIRECT_URI }}
```

- [ ] **Step 2: Replace the `run:` body with the script-based upsert**

The KEYS list inside the python heredoc must match the env block above.

```yaml
        run: |
          PAYLOAD_B64=$(python3 - <<'PY'
          import os, json, base64
          KEYS = [
              # Tier 1
              "NEXTAUTH_SECRET", "NEXTAUTH_URL", "ENCRYPTION_KEY", "DATABASE_URL",
              "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
              "DISCORD_BOT_TOKEN", "DISCORD_BOT_CLIENT_ID",
              "CERVANTES_DISCORD_BOT_TOKEN", "CERVANTES_DISCORD_BOT_CLIENT_ID",
              "CERVANTES_GUILD_ID", "DISCORD_WEBHOOK_CERVANTES",
              "OD_API_TOKEN", "OPENCLAW_GATEWAY_TOKEN", "GTM_OS_API_TOKEN",
              "YALC_API_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
              "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET",
              # Tier 2
              "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
              "XAI_API_KEY", "MINIMAX_API_KEY", "BRAVE_API_KEY", "APIFY_API_KEY",
              "FIRECRAWL_API_KEY", "SERPER_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD",
              "NOTION_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "FAL_API_KEY",
              "WAVESPEED_API_KEY", "DUMPLING_API_KEY", "SLACK_BOT_TOKEN", "INSTANTLY_API_KEY",
              "METRICOOL_API_KEY", "SANCHO_INTERNAL_API_TOKEN",
              # Tier 3
              "APOLLO_API_KEY", "GHL_API_KEY", "GHL_LOCATION_ID",
              "META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID",
              "PAGESPEED_API_KEY", "UNIPILE_API_KEY", "UNIPILE_DSN", "DATAFORSEO_API_KEY",
              # Variables (optional)
              "BASE_URL", "NEXT_PUBLIC_ENV_LABEL", "OD_WEB_URL", "OD_ALLOWED_ORIGINS",
              "OPEN_DESIGN_IMAGE", "MC_CHAT_GATEWAY", "SLACK_REDIRECT_URI",
          ]
          out = {k: os.environ[k] for k in KEYS if os.environ.get(k)}
          print(base64.b64encode(json.dumps(out).encode()).decode())
          PY
          )

          scp -o StrictHostKeyChecking=no scripts/upsert-env.py "$VPS_USER@$VPS_HOST:/tmp/upsert-env.py"

          ssh "$VPS_USER@$VPS_HOST" "DEPLOY_PATH=$DEPLOY_PATH SHA=$SHA PAYLOAD_B64=$PAYLOAD_B64 ENABLE_YALC_SERVICE=$ENABLE_YALC_SERVICE YALC_BUILD_CONTEXT=$YALC_BUILD_CONTEXT YALC_REF=$YALC_REF YALC_REPO_TOKEN_B64='$(printf '%s' "${YALC_REPO_TOKEN:-}" | base64 | tr -d '\n')' bash -s" <<'EOF'
            set -euo pipefail
            cd "$DEPLOY_PATH"
            echo "▶ Fetching staging…"
            git fetch origin staging --prune
            if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
              echo "▶ Stashing local runtime changes before checkout…"
              git stash push --include-untracked -m "deploy-staging-$(date -u +%Y%m%dT%H%M%SZ)" || true
            fi

            ENV_HASH_BEFORE=$(sha256sum .env 2>/dev/null | cut -d' ' -f1 || echo "missing")
            if [ -n "${PAYLOAD_B64:-}" ]; then
              echo "▶ Upserting env vars from GitHub `staging` Environment…"
              echo "$PAYLOAD_B64" | python3 /tmp/upsert-env.py .env
            fi
            ENV_HASH_AFTER=$(sha256sum .env | cut -d' ' -f1)
            ENV_CHANGED=0
            if [ "$ENV_HASH_BEFORE" != "$ENV_HASH_AFTER" ]; then
              ENV_CHANGED=1
              echo "▶ .env content changed (will force-recreate sanchocmo)"
            fi
            rm -f /tmp/upsert-env.py

            echo "▶ Checking out $SHA…"
            git checkout "$SHA"
            export GIT_COMMIT="$(git rev-parse HEAD)"
            COMPOSE_ARGS="-f docker-compose.yml"
            if [ "${ENABLE_YALC_SERVICE:-1}" != "0" ]; then
              YALC_DIR="${YALC_BUILD_CONTEXT:-../Yalc-Growth4U}"
              if [ ! -d "$YALC_DIR/.git" ]; then
                if [ -z "${YALC_REPO_TOKEN_B64:-}" ]; then
                  echo "YALC_REPO_TOKEN is required on the staging GitHub Environment, or pre-clone YALC at $YALC_DIR."
                  exit 1
                fi
                echo "▶ Cloning YALC source into $YALC_DIR…"
                mkdir -p "$(dirname "$YALC_DIR")"
                YALC_REPO_TOKEN="$(printf '%s' "$YALC_REPO_TOKEN_B64" | base64 -d)"
                git clone "https://x-access-token:${YALC_REPO_TOKEN}@github.com/Growth4U-systems/Yalc-Growth4U.git" "$YALC_DIR"
                unset YALC_REPO_TOKEN
              fi
              echo "▶ Fetching YALC ref ${YALC_REF:-main}…"
              git -C "$YALC_DIR" fetch origin "${YALC_REF:-main}" --prune
              git -C "$YALC_DIR" checkout FETCH_HEAD
              echo "▶ YALC source: $(git -C "$YALC_DIR" rev-parse --short HEAD)"
              export YALC_BUILD_CONTEXT="$YALC_DIR"
              COMPOSE_ARGS="$COMPOSE_ARGS -f docker-compose.yalc.yml"
            fi
            echo "▶ Building and starting containers (GIT_COMMIT=$GIT_COMMIT)…"
            docker compose $COMPOSE_ARGS build --pull
            UP_ARGS=""
            if [ "$ENV_CHANGED" = "1" ]; then
              UP_ARGS="--force-recreate"
            fi
            if ! docker compose $COMPOSE_ARGS up -d $UP_ARGS; then
              echo "▶ docker compose up failed; current service state:"
              docker compose $COMPOSE_ARGS ps || true
              echo "▶ yalc logs:"
              docker compose $COMPOSE_ARGS logs --no-color --tail=200 yalc || true
              echo "▶ sanchocmo logs:"
              docker compose $COMPOSE_ARGS logs --no-color --tail=200 sanchocmo || true
              exit 1
            fi
            docker compose $COMPOSE_ARGS ps
          EOF
```

- [ ] **Step 3: Lint + commit**

```bash
which actionlint && actionlint .github/workflows/deploy-staging.yml || echo "actionlint not installed; visual review only"
git add .github/workflows/deploy-staging.yml
git commit -m "ci(deploy-staging): apply all envs from GitHub \`staging\` Environment

…"
```

- [ ] **Step 4: Manual staging deploy + verify**

```bash
gh workflow run "Deploy to Staging" --ref staging
gh run watch
```

After completion:

```bash
ssh sancho-cmo-staging "grep -c '^[A-Z_]*=' /root/.openclaw/.env"
# expect: roughly equal to total keys uploaded in Task 0
ssh sancho-cmo-staging "docker compose ps --filter name=sanchocmo"
# expect: container running, recent created time if .env changed
```

Open `/dashboard/<slug>/settings?tab=apis` on staging. System rows should show 🟢 Connected (or 🔵 SYSTEM key) for the keys present in GitHub. Hit "🔄 Verificar Todo" to re-validate.

- [ ] **Step 5: Rollback path**

The previous SHA on `staging` still has the old workflow that only upserts `SANCHO_INTERNAL_API_TOKEN`. Re-deploying it via `gh workflow run "Deploy to Staging" --ref <prev-sha>` restores the previous behavior. `.env` content is preserved across deploys, so no data loss.

---

### Task 4: Apply the same to `deploy-prod.yml`

**Files:** `.github/workflows/deploy-prod.yml`

**Why now**: prod is currently stale, but adding the upsert mechanism is safe (empty secrets → no-op) and means prod will be ready the moment someone populates the `production` Environment. Doing both staging + prod in one PR is cleaner than splitting.

**Scope on prod**: same code + same KEYS list as Task 3. The `production` GitHub Environment only has whatever was set by the previous deploys — most of Tier 1 will be empty for now. When prod is revived, a second pass of Task 0 (against prod snapshot, targeting `production` Environment) populates it. **No code change at that point** — the workflow already supports it.

- [ ] **Step 1: Mirror Task 3 Steps 1-2 to `deploy-prod.yml`**

Same env block + same python KEYS list. The only diff is the workflow body structure (no YALC, no stash, tag-based instead of SHA-based). Use the existing skeleton, splice in the upsert + scp + sha-check + conditional --force-recreate.

- [ ] **Step 2: Lint + commit**

```bash
which actionlint && actionlint .github/workflows/deploy-prod.yml || echo "visual review only"
git add .github/workflows/deploy-prod.yml
git commit -m "ci(deploy-prod): apply envs from GitHub \`production\` Environment

…"
```

- [ ] **Step 3: Workflow-dispatch verify (no-op expected today)**

```bash
LATEST_TAG=$(gh release list --limit 1 --json tagName -q '.[0].tagName')
gh workflow run "Deploy to Production" --field tag="$LATEST_TAG"
gh run watch
```

Verify on VPS that `.env` content didn't change unexpectedly (sha matches before/after):

```bash
ssh sancho-cmo-prod "sha256sum /root/.openclaw/.env"
# (compare to value from before the dispatch)
```

If any prod secrets are populated in GitHub from a previous setup, those will be upserted. Eyeball the workflow log's `[upsert-env]` summary line to confirm what was touched.

---

### Task 5: Runbook for operators

**Files:** `docs/runbooks/system-keys-management.md`

- [ ] **Step 1: Write the runbook**

Cover:
- **Where they live**: GitHub Environment secrets (`staging` / `production`), workflow declares which ones are applied.
- **Adding a new key**: add to `SERVICE_ENV_MAP` (if it's a Tier-2 system API), then env block + KEYS list in `deploy-{staging,prod}.yml`, then add the secret to the matching GitHub Environment. Mention that `scripts/load-secrets-from-env.sh` works for bulk adds from a local `.env`.
- **Rotating a key**: update the GitHub Environment secret value → trigger `workflow_dispatch` → upsert detects sha change → force-recreate sanchocmo. 1–2 min, no SSH.
- **Disabling a key**: delete the GitHub Environment secret (prevents future upserts) → SSH once to remove the line from `~/.openclaw/.env` → `docker compose restart sanchocmo`. *The only remaining legitimate SSH path.*
- **Prod status (2026-05)**: stale; staging is de-facto prod. When prod is revived, repeat Task 0 against prod's snapshot.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/system-keys-management.md
git commit -m "docs: runbook for managing system envs via GitHub Environments"
```

---

## Self-review checklist

- **Spec coverage** (full SSH-out): every secret currently SSH-edited on the VPS appears in either Tier 1/2/3 or is intentionally deferred (e.g., bot tokens for VPS-specific tooling). Audit at 2026-05-19 saw 56 keys on staging; v2 covers 52 secrets + 7 variables = 59 of them. The 4 not covered are: `OPENCLAW_GATEWAY_PASSWORD` (prod-only, not in staging audit), and 3 lines that didn't match `^[A-Z_]+=` in the grep (would need a re-snapshot to identify).
- **Placeholders:** none — every step has either concrete commands or full code blocks.
- **Type consistency:** `KEYS = [...]` python list matches the `env:` block line-for-line. The `vars.X` (variables) keys are inside the same KEYS list and the script doesn't distinguish (both end up as `process.env.X`).
- **Drift mitigation:** the workflow's env: block and the KEYS list are adjacent in the same file → visual diff catches drift. CI's `verify` (typecheck + build) doesn't directly check this, but a future improvement could be a workflow lint step that asserts both lists are identical sets.

---

## Out of scope (next plans, separate branches)

- **`/api/env` admin UI**: cabling the existing endpoint (`src/pages/api/env/index.ts`, already protected with `withAuth`) to a tab in `/dashboard/admin/settings` for hot rotation without a deploy. Tradeoff: drifts from GitHub source-of-truth until next deploy re-asserts. Document that drift in the UI when implemented.
- **Fold Tier 3 into `SERVICE_ENV_MAP`**: so Apollo/GHL/Meta/Unipile/PageSpeed/DataForSEO-API show up in the APIs admin panel alongside the others.
- **Drift detection job**: nightly cron that compares VPS `.env` against the GitHub Environment secret set and reports differences. Useful once both staging + prod have been on this flow for a few weeks.
- **Prod revival workflow**: when prod is brought back as the real prod, that's a separate ops PR — populate the `production` Environment via `scripts/load-secrets-from-env.sh --env production --from /tmp/prod.env.snapshot --confirm`, then trigger a deploy.

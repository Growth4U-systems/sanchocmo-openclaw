# System Keys Management

How to add, rotate, and disable environment variables and API keys without SSH-editing `~/.openclaw/.env` on the VPS.

## Source of truth

| Type | Where it lives | How it gets to the VPS |
|---|---|---|
| Secrets (Anthropic key, NEXTAUTH_SECRET, DB URL, …) | GitHub repo → Settings → Environments → `staging` / `production` → **Secrets** | Deploy workflow upserts into `~/.openclaw/.env` before `docker compose up -d` |
| Variables (BASE_URL, NEXTAUTH_URL, OD_WEB_URL, …) | Same place → **Variables** | Same upsert step |
| Deploy infra (`VPS_HOST`, `VPS_SSH_KEY`, `VPS_USER`, `YALC_REPO_TOKEN`) | Secrets (workflow-only — not written to `.env`) | Workflow reads directly, never touches the VPS `.env` |
| Workflow config (`DEPLOY_PATH`, `HEALTH_URL`, `ENABLE_YALC_SERVICE`, `YALC_BUILD_CONTEXT`, `YALC_REF`) | Variables (workflow-only) | Same |

The mechanism: `scripts/upsert-env.py` (TDD'd) is `scp`'d to the VPS, then invoked with a base64-encoded JSON dict of `{KEY: VALUE}` built from the workflow's `env:` block. **Empty values are skipped** — an unset GitHub secret is a safe no-op.

## Adding a new key

1. **Pick the type**: secret (sensitive — API tokens, DB URLs with creds, OAuth secrets) or variable (URLs, labels, public IDs).
2. **Declare in the workflow**:
   - Add `<NAME>: ${{ secrets.<NAME> }}` (or `vars.`) to the `env:` block in **both** `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-prod.yml`.
   - Add `"<NAME>"` to the `KEYS = [...]` Python list in the same step (both files).
3. **Add to GitHub**:
   - For a single value: GitHub repo → Settings → Environments → `staging` → New secret (or variable).
   - For bulk from a local `.env`: `scripts/load-secrets-from-env.sh --env staging --from <path> --include <NAME> --confirm`.
4. **Push to `staging`** → deploy runs → key applied. For prod, do the same on the `production` Environment + create a release tag.

If the key is also a system API key (LLM/tools/social, with a health check), also add it to `SERVICE_ENV_MAP` in `src/pages/api/env/index.ts` so it surfaces in the APIs admin panel.

## Rotating a key

1. GitHub Environment → edit the secret/variable → save the new value.
2. Trigger the deploy:
   ```bash
   gh workflow run "Deploy to Staging" --ref staging
   ```
   (or `--ref <prev-sha>` to rotate without rolling code forward.)
3. The upsert detects the `.env` content sha256 changed and force-recreates the `sanchocmo` container so it picks up the new value.

Rotation takes 1–2 min, no SSH.

## Disabling a key

1. Delete the secret/variable from the GitHub Environment (prevents future deploys from re-applying it).
2. SSH **once** to remove the line from `~/.openclaw/.env`:
   ```bash
   ssh sancho-cmo-staging "sed -i '/^<NAME>=/d' /root/.openclaw/.env && docker compose -f /root/.openclaw/docker-compose.yml restart sanchocmo"
   ```

The upsert script never deletes lines — it only adds/updates. Step 1 stops new deploys from re-introducing the value, step 2 cleans the current state.

This is the only remaining legitimate SSH operation. Everything else (rotation, addition) goes through GitHub.

## Auditing what's there

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Secrets:   $(gh api "repos/$REPO/environments/staging/secrets" --paginate -q '.secrets | length')"
echo "Variables: $(gh api "repos/$REPO/environments/staging/variables" --paginate -q '.variables | length')"

# Names only — no values are ever returned by the API
gh api "repos/$REPO/environments/staging/secrets" --paginate -q '.secrets[].name' | sort
gh api "repos/$REPO/environments/staging/variables" --paginate -q '.variables[].name' | sort
```

## Bulk-importing from a VPS `.env` (initial migration / disaster recovery)

```bash
# 1. Snapshot the VPS .env
scp sancho-cmo-staging:~/.openclaw/.env ~/Software/G4U/staging.env.snapshot
chmod 600 ~/Software/G4U/staging.env.snapshot

# 2. Dry-run to preview
scripts/load-secrets-from-env.sh --env staging --from ~/Software/G4U/staging.env.snapshot

# 3. Upload (use --exclude to skip vars that should be variables, deploy-infra, deprecated keys, …)
scripts/load-secrets-from-env.sh --env staging --from ~/Software/G4U/staging.env.snapshot --confirm \
  --exclude DISCORD_BOT_TOKEN,DISCORD_BOT_CLIENT_ID,CERVANTES_DISCORD_BOT_TOKEN,CERVANTES_DISCORD_BOT_CLIENT_ID,CERVANTES_GUILD_ID,DISCORD_WEBHOOK_CERVANTES,BASE_URL,NEXT_PUBLIC_ENV_LABEL,NEXTAUTH_URL,SUPABASE_URL,OD_WEB_URL,OD_ALLOWED_ORIGINS,OPEN_DESIGN_IMAGE,MC_CHAT_GATEWAY,SLACK_REDIRECT_URI

# 4. For the variables, use gh api (gh v2.4.0 doesn't support `gh variable set`):
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
for v in BASE_URL NEXT_PUBLIC_ENV_LABEL NEXTAUTH_URL SUPABASE_URL OD_WEB_URL OD_ALLOWED_ORIGINS OPEN_DESIGN_IMAGE MC_CHAT_GATEWAY SLACK_REDIRECT_URI; do
  value=$(grep "^${v}=" ~/Software/G4U/staging.env.snapshot | cut -d= -f2-)
  [ -z "$value" ] && { echo "  · $v (skip, empty)"; continue; }
  if gh api "repos/$REPO/environments/staging/variables/$v" >/dev/null 2>&1; then
    gh api --method PATCH "repos/$REPO/environments/staging/variables/$v" -f name="$v" -f value="$value" >/dev/null && echo "  ✓ updated $v"
  else
    gh api --method POST "repos/$REPO/environments/staging/variables" -f name="$v" -f value="$value" >/dev/null && echo "  ✓ created $v"
  fi
done

# 5. Cleanup
shred -u ~/Software/G4U/staging.env.snapshot
```

## Prod status (as of 2026-05-19)

`production` Environment is **mostly empty** — prod is currently stale and staging is the de-facto prod. The deploy-prod workflow is wired up with the same mechanism, but the `skip_empty` rule makes every unset key a no-op, so prod deploys touch nothing they shouldn't.

When prod is revived:

1. SSH once to snapshot prod's current `.env`: `scp sancho-cmo-prod:~/.openclaw/.env ~/Software/G4U/prod.env.snapshot`.
2. Repeat the bulk-import steps above against the `production` Environment.
3. Trigger `gh workflow run "Deploy to Production" --field tag=<latest>` to apply.

## When things go wrong

- **Workflow reports `upsert-env: skipped_empty=N`** — N secrets in GitHub are empty, the VPS keeps existing values. Check if those secrets should be set.
- **Container starts but feature X is broken after rotation** — likely the container didn't pick up the new `.env`. The hash-check should have forced recreation; if not, force it manually: `ssh sancho-cmo-staging "docker compose -f /root/.openclaw/docker-compose.yml up -d --force-recreate sanchocmo"`.
- **Workflow fails on `scp scripts/upsert-env.py`** — the runner couldn't reach the VPS. Check `VPS_HOST`, `VPS_SSH_KEY` secrets; the public key must be in the VPS's `~/.ssh/authorized_keys`.
- **A key value contains a newline** — the upsert script rejects multi-line values by design. Use a single-line representation (e.g., base64-encode a PEM cert into one line, decode at runtime).

## Related

- `scripts/upsert-env.py` — the upsert engine (10 unittests in `scripts/test_upsert_env.py`)
- `scripts/load-secrets-from-env.sh` — operator helper for bulk upload from a `.env` file
- `docs/plans/2026-05-19-github-env-system-keys.md` — design doc for this migration

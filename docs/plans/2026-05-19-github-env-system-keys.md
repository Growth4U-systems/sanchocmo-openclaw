# System API Keys → GitHub Environments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop SSH-editing `~/.openclaw/.env` on staging/prod for system API keys. Move source-of-truth to GitHub Environment secrets, auto-applied on deploy.

**Architecture:** A generic Python upsert script (`scripts/upsert-env.py`, TDD'd via stdlib `unittest`) reads a base64-encoded JSON dict of `{KEY: VALUE}` from stdin and writes those keys to a target `.env` file, **skipping empty values** (so unset secrets are no-ops). Both `deploy-staging.yml` and `deploy-prod.yml` build that JSON from an explicit list of GitHub Environment secrets, `scp` the script to the VPS, and run it via `python3 /tmp/upsert-env.py …` before `docker compose up -d`. The container is force-recreated only when the `.env` content sha256 actually changed.

**Tech Stack:** Python 3 (stdlib only — `json`, `base64`, `pathlib`, `argparse`, `sys`), `unittest` for tests. GitHub Actions workflow YAML. Bash + SSH for VPS execution.

**Scope:** Only the 22 keys backing `SERVICE_ENV_MAP` in `src/pages/api/env/index.ts` (the LLM/tools/social/data providers). `SANCHO_INTERNAL_API_TOKEN` already migrates via the existing inline upsert and is folded into this generalized mechanism. Out of scope: `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_*`, `OD_API_TOKEN`, `R2_*`, `DATABASE_URL`. Those can be added later by extending the keys list — no code change needed beyond declaring the new GitHub secrets.

**Predecessor:** PR #84 (`investigate/apis-settings-tab` → `staging`) must be merged first to avoid touching the same workflow during rebases.

---

## Files

- **Create:** `scripts/upsert-env.py` — pure-function `upsert(env_path, updates: dict[str,str], strict=True) -> dict[str,str]` returning per-key action (`added` / `updated` / `unchanged` / `skipped_empty`). CLI: `python3 scripts/upsert-env.py <env_path>` reads base64-encoded JSON from stdin, writes back, prints a summary line.
- **Create:** `scripts/test_upsert_env.py` — `unittest.TestCase` suite covering: new file, existing key replace, append missing key, skip empty, reject multi-line value, preserve comments + blank lines + unrelated keys, idempotent re-run.
- **Modify:** `.github/workflows/deploy-staging.yml` — generalize the existing `SANCHO_INTERNAL_API_TOKEN` inline upsert into the script-based pattern. Touched range: lines 31-73 (env block + Deploy step).
- **Modify:** `.github/workflows/deploy-prod.yml` — add the env upsert step entirely (prod has none today). Touched: lines 41-60 (Deploy step).
- **Modify:** `.github/workflows/ci.yml` — add a `verify-scripts` job that runs `python3 -m unittest discover -s scripts -p 'test_*.py'`. Touched: append job at lines 60-ish.
- **Create:** `docs/runbooks/system-keys-management.md` — how to add/rotate a key.

---

## Key list (single source of truth referenced by both workflows)

Define this in both workflow files identically as the workflow `env:` block on the Deploy step. Lifted from `src/pages/api/env/index.ts:9-35`:

```
ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
XAI_API_KEY, MINIMAX_API_KEY, BRAVE_API_KEY, APIFY_API_KEY,
FIRECRAWL_API_KEY, SERPER_API_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
NOTION_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, FAL_API_KEY,
WAVESPEED_API_KEY, DUMPLING_API_KEY, SLACK_BOT_TOKEN, INSTANTLY_API_KEY,
METRICOOL_API_KEY, SANCHO_INTERNAL_API_TOKEN
```

22 total. Same list in both workflows; values come from per-environment GitHub Secrets (`staging` / `production`).

---

### Task 0: Inventory + populate GitHub Environment secrets (MANUAL — risk gate)

**This is the migration risk. Do not start Task 3/4 until this is complete.** No code in this task — it's a human operations step. The python script (Task 1) deliberately skips empty values so a half-populated GitHub Environment is safe, but a *wrong* value in GitHub will overwrite the VPS's real one on the next deploy.

- [ ] **Step 1: Snapshot staging `.env`**

```bash
ssh sancho-cmo-staging "cat /root/.openclaw/.env" > /tmp/staging.env.snapshot
# DO NOT commit this file. It contains secrets.
chmod 600 /tmp/staging.env.snapshot
```

- [ ] **Step 2: Snapshot prod `.env`**

```bash
ssh sancho-cmo-prod "cat /root/.openclaw/.env" > /tmp/prod.env.snapshot
chmod 600 /tmp/prod.env.snapshot
```

- [ ] **Step 3: For each of the 22 keys, if set on staging, add to GitHub `staging` Environment secrets**

GitHub repo → Settings → Environments → `staging` → Add secret. Secret name MUST match env var name (e.g., `ANTHROPIC_API_KEY` → secret `ANTHROPIC_API_KEY`). For each key:

```bash
grep "^ANTHROPIC_API_KEY=" /tmp/staging.env.snapshot
# copy value to clipboard, paste into GitHub UI
```

Repeat for all 22 keys. Skip any that are absent or empty on the VPS — they'll stay empty in GitHub (no-op on deploy).

- [ ] **Step 4: Same for prod → `production` GitHub Environment**

```bash
grep "^OPENAI_API_KEY=" /tmp/prod.env.snapshot
# etc.
```

- [ ] **Step 5: Verify**

GitHub → Settings → Environments → list `staging`. Count of secrets ≥ count of keys grepped from staging snapshot. Same for `production`. Diff the two lists — they should mostly overlap but may legitimately differ (e.g., METRICOOL_API_KEY only on prod).

- [ ] **Step 6: Delete snapshots**

```bash
shred -u /tmp/staging.env.snapshot /tmp/prod.env.snapshot
```

**Acceptance:** Every key currently set on a VPS has a matching GitHub Environment secret. Snapshots wiped. No commit yet.

---

### Task 1: TDD the upsert script

**Files:**
- Create: `scripts/upsert-env.py`
- Create: `scripts/test_upsert_env.py`

- [ ] **Step 1: Write the failing test suite**

`scripts/test_upsert_env.py`:

```python
"""Tests for scripts/upsert-env.py.

Run with:  python3 -m unittest scripts/test_upsert_env.py
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
# Module name has a hyphen → import via importlib so tests don't depend on a rename.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "upsert_env", Path(__file__).parent / "upsert-env.py"
)
upsert_env = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(upsert_env)


class UpsertEnvTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".env", delete=False)
        self.tmp.close()
        self.path = Path(self.tmp.name)

    def tearDown(self):
        if self.path.exists():
            self.path.unlink()

    def test_creates_file_if_missing(self):
        self.path.unlink()
        report = upsert_env.upsert(self.path, {"FOO": "bar"})
        self.assertEqual(report["FOO"], "added")
        self.assertEqual(self.path.read_text(), "FOO=bar\n")

    def test_adds_missing_key_to_existing_file(self):
        self.path.write_text("EXISTING=keep\n")
        report = upsert_env.upsert(self.path, {"NEW": "val"})
        self.assertEqual(report["NEW"], "added")
        content = self.path.read_text()
        self.assertIn("EXISTING=keep", content)
        self.assertIn("NEW=val", content)

    def test_updates_existing_key(self):
        self.path.write_text("FOO=old\nBAR=keep\n")
        report = upsert_env.upsert(self.path, {"FOO": "new"})
        self.assertEqual(report["FOO"], "updated")
        content = self.path.read_text()
        self.assertIn("FOO=new", content)
        self.assertNotIn("FOO=old", content)
        self.assertIn("BAR=keep", content)

    def test_unchanged_when_value_matches(self):
        self.path.write_text("FOO=same\n")
        report = upsert_env.upsert(self.path, {"FOO": "same"})
        self.assertEqual(report["FOO"], "unchanged")

    def test_skips_empty_value(self):
        self.path.write_text("EXISTING=keep\n")
        report = upsert_env.upsert(self.path, {"EMPTY": ""})
        self.assertEqual(report["EMPTY"], "skipped_empty")
        self.assertNotIn("EMPTY=", self.path.read_text())

    def test_preserves_comments_and_blanks(self):
        original = "# Header comment\n\nFOO=old\n\n# trailing comment\n"
        self.path.write_text(original)
        upsert_env.upsert(self.path, {"FOO": "new"})
        content = self.path.read_text()
        self.assertIn("# Header comment", content)
        self.assertIn("# trailing comment", content)
        self.assertIn("FOO=new", content)

    def test_rejects_multiline_value(self):
        with self.assertRaises(ValueError):
            upsert_env.upsert(self.path, {"FOO": "line1\nline2"})

    def test_idempotent(self):
        self.path.write_text("FOO=v1\n")
        first = upsert_env.upsert(self.path, {"FOO": "v2"})
        second = upsert_env.upsert(self.path, {"FOO": "v2"})
        self.assertEqual(first["FOO"], "updated")
        self.assertEqual(second["FOO"], "unchanged")

    def test_handles_special_chars_in_value(self):
        # Tokens may contain $, =, /, +, ., -, _. No quoting needed for .env consumers
        # that read line-by-line (dotenv, docker-compose env_file).
        report = upsert_env.upsert(self.path, {"TOKEN": "sk-ant_v1+abc/123=foo"})
        self.assertEqual(report["TOKEN"], "added")
        self.assertEqual(self.path.read_text(), "TOKEN=sk-ant_v1+abc/123=foo\n")

    def test_cli_reads_base64_json_from_stdin(self):
        import base64, json, subprocess
        payload = base64.b64encode(json.dumps({"CLI_KEY": "cli-val"}).encode()).decode()
        result = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "upsert-env.py"), str(self.path)],
            input=payload,
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertIn("added=1", result.stdout)
        self.assertEqual(self.path.read_text().strip(), "CLI_KEY=cli-val")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m unittest scripts/test_upsert_env.py -v
```

Expected: all 10 tests fail with `FileNotFoundError` or `ModuleNotFoundError` (script doesn't exist yet).

- [ ] **Step 3: Implement the script**

`scripts/upsert-env.py`:

```python
#!/usr/bin/env python3
"""Upsert env vars into a .env file.

Used by .github/workflows/deploy-{staging,prod}.yml to apply
GitHub Environment secrets to the VPS's ~/.openclaw/.env on every deploy.

The CLI reads a base64-encoded JSON dict from stdin and writes its keys
to the target .env, preserving comments, blanks, and unrelated keys.
Empty values are skipped (safe default — lets unset GitHub secrets be no-ops).
Multi-line values are rejected (current consumers expect one-line-per-key).

Usage:
    echo "$(echo '{"FOO":"bar"}' | base64)" | python3 scripts/upsert-env.py /path/to/.env

Exit codes:
    0: success
    1: invalid input (bad JSON, multi-line value, etc.)
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def upsert(env_path: Path, updates: dict[str, str]) -> dict[str, str]:
    """Apply `updates` to `env_path`. Returns per-key action report."""
    report: dict[str, str] = {}
    lines = env_path.read_text().splitlines() if env_path.exists() else []

    for key, value in updates.items():
        if value == "":
            report[key] = "skipped_empty"
            continue
        if "\n" in value or "\r" in value:
            raise ValueError(
                f"Multi-line value for {key} is not supported "
                f"(found newline). Use a single-line token."
            )

        new_line = f"{key}={value}"
        found = False
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                if line == new_line:
                    report[key] = "unchanged"
                else:
                    lines[i] = new_line
                    report[key] = "updated"
                found = True
                break
        if not found:
            lines.append(new_line)
            report[key] = "added"

    env_path.write_text("\n".join(lines) + ("\n" if lines else ""))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Upsert env vars into a .env file.")
    parser.add_argument("env_path", type=Path, help="Path to .env file")
    args = parser.parse_args()

    payload_b64 = sys.stdin.read().strip()
    if not payload_b64:
        print("error: stdin is empty (expected base64-encoded JSON)", file=sys.stderr)
        return 1

    try:
        updates = json.loads(base64.b64decode(payload_b64).decode())
    except (ValueError, UnicodeDecodeError) as exc:
        print(f"error: invalid stdin payload: {exc}", file=sys.stderr)
        return 1

    if not isinstance(updates, dict):
        print("error: payload must decode to a JSON object", file=sys.stderr)
        return 1

    try:
        report = upsert(args.env_path, {str(k): str(v) for k, v in updates.items()})
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    # Summary line (no values revealed)
    counts = {"added": 0, "updated": 0, "unchanged": 0, "skipped_empty": 0}
    for action in report.values():
        counts[action] = counts.get(action, 0) + 1
    summary = " ".join(f"{k}={v}" for k, v in counts.items())
    keys_changed = [k for k, a in report.items() if a in ("added", "updated")]
    print(f"[upsert-env] {summary} | changed: {','.join(keys_changed) or '(none)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 -m unittest scripts/test_upsert_env.py -v
```

Expected: `Ran 10 tests in 0.0XXs … OK`.

- [ ] **Step 5: Verify the CLI end-to-end manually**

```bash
TMPF=$(mktemp --suffix=.env)
echo "EXISTING=keep" > "$TMPF"
echo '{"ANTHROPIC_API_KEY":"sk-test","EMPTY":""}' | base64 | python3 scripts/upsert-env.py "$TMPF"
cat "$TMPF"
rm "$TMPF"
```

Expected stdout: `[upsert-env] added=1 updated=0 unchanged=0 skipped_empty=1 | changed: ANTHROPIC_API_KEY`
Expected `$TMPF` contents:
```
EXISTING=keep
ANTHROPIC_API_KEY=sk-test
```

- [ ] **Step 6: Make the script executable**

```bash
chmod +x scripts/upsert-env.py
```

- [ ] **Step 7: Commit**

```bash
git add scripts/upsert-env.py scripts/test_upsert_env.py
git commit -m "feat(scripts): add upsert-env.py for deploy-time .env management

Pure-function upsert + CLI reading base64-encoded JSON from stdin.
Skips empty values (so unset GitHub Environment secrets are safe no-ops)
and rejects multi-line values (current consumers read one line per key).
Tests cover create/update/add/skip/idempotent/special-chars/CLI roundtrip.

Used by deploy-{staging,prod}.yml in the next commit to replace the
inline python upsert that today only handles SANCHO_INTERNAL_API_TOKEN."
```

---

### Task 2: Wire the script into CI

**Files:**
- Modify: `.github/workflows/ci.yml` (append a new job after the existing `lint` job, before `e2e`)

- [ ] **Step 1: Add the `verify-scripts` job**

Insert after line 59 in `ci.yml`:

```yaml
  verify-scripts:
    name: Scripts unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Run unit tests
        run: python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

- [ ] **Step 2: Verify the job syntax with `actionlint` if available, else inspect manually**

```bash
which actionlint && actionlint .github/workflows/ci.yml || echo "actionlint not installed; visual review only"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run scripts/ unit tests on PR + push

Runs python3 -m unittest against scripts/test_*.py so the upsert-env.py
logic stays correct as it grows. Required (not informational) — a broken
upsert script would silently corrupt deploys."
```

---

### Task 3: Generalize the upsert in `deploy-staging.yml`

**Files:**
- Modify: `.github/workflows/deploy-staging.yml` — touched range lines 31-73 (env block + Deploy via SSH step)

- [ ] **Step 1: Replace the env block with the full key list**

In `deploy-staging.yml`, replace the existing `env:` block on the Deploy step (currently lines 31-40) with:

```yaml
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          DEPLOY_PATH: ${{ vars.DEPLOY_PATH || '~/.openclaw' }}
          SHA: ${{ github.sha }}
          ENABLE_YALC_SERVICE: ${{ vars.ENABLE_YALC_SERVICE || '1' }}
          YALC_BUILD_CONTEXT: ${{ vars.YALC_BUILD_CONTEXT || '../Yalc-Growth4U' }}
          YALC_REF: ${{ vars.YALC_REF || 'main' }}
          YALC_REPO_TOKEN: ${{ secrets.YALC_REPO_TOKEN }}
          # === System API keys (managed by GitHub Environments) ===
          # Adding a new key here + adding the matching secret to the
          # `staging` Environment is enough to roll it out. The upsert
          # script skips empty values so unset secrets stay no-op.
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
```

(Removes the now-unused `SANCHO_INTERNAL_API_TOKEN_B64` variable from the env block — it's superseded.)

- [ ] **Step 2: Replace the `run:` body with the generalized flow**

In the same step, replace the entire `run: |` body (currently lines 41-73 of the file, the bash block that does `SANCHO_INTERNAL_API_TOKEN_B64=…` + ssh + python heredoc upsert + checkout + build) with:

```yaml
        run: |
          # Build a single base64-encoded JSON dict of all system env vars
          # that have a non-empty value, then ship it + the upsert script
          # to the VPS for application BEFORE git checkout.
          PAYLOAD_B64=$(python3 - <<'PY'
          import os, json, base64
          KEYS = [
              "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
              "XAI_API_KEY", "MINIMAX_API_KEY", "BRAVE_API_KEY", "APIFY_API_KEY",
              "FIRECRAWL_API_KEY", "SERPER_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD",
              "NOTION_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "FAL_API_KEY",
              "WAVESPEED_API_KEY", "DUMPLING_API_KEY", "SLACK_BOT_TOKEN", "INSTANTLY_API_KEY",
              "METRICOOL_API_KEY", "SANCHO_INTERNAL_API_TOKEN",
          ]
          out = {k: os.environ[k] for k in KEYS if os.environ.get(k)}
          print(base64.b64encode(json.dumps(out).encode()).decode())
          PY
          )

          # Ship the upsert script (single source of truth, tested in CI)
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

            # Apply GitHub Environment secrets to ~/.openclaw/.env
            ENV_HASH_BEFORE=$(sha256sum .env 2>/dev/null | cut -d' ' -f1 || echo "missing")
            if [ -n "${PAYLOAD_B64:-}" ]; then
              echo "▶ Upserting system env vars from GitHub Environment…"
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

Key changes vs. the existing flow:
1. **Generic upsert** replaces the SANCHO-specific python heredoc.
2. **`scp scripts/upsert-env.py`** ships the tested script to the VPS — single source of truth, no inline duplication.
3. **`ENV_CHANGED` flag** drives a conditional `--force-recreate` so env-only re-runs (workflow_dispatch with no commit change) actually propagate new values into the container.

- [ ] **Step 3: Lint the workflow file**

```bash
which actionlint && actionlint .github/workflows/deploy-staging.yml || echo "actionlint not installed; visual review"
yamllint .github/workflows/deploy-staging.yml 2>/dev/null || echo "yamllint not installed; skip"
```

Expected: no errors. Visual review: confirm all 22 keys are in the env block AND in the python KEYS list — they must match.

- [ ] **Step 4: Commit (do NOT merge yet)**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci(deploy-staging): apply system API keys from GitHub Environment

Replaces the SANCHO-only inline python upsert with a generalized flow:
- 22 system API keys declared in the workflow env block, sourced from
  the \`staging\` Environment secrets.
- Tested upsert script (scripts/upsert-env.py) shipped to the VPS via
  scp before git checkout — same script will be used by deploy-prod.
- Conditional --force-recreate when .env content changed so env-only
  re-runs (workflow_dispatch) propagate without a code commit.

DEPENDS ON: Task 0 (GitHub \`staging\` Environment populated with the
22 secrets). If a secret is unset/empty, the upsert skips that key —
the VPS keeps its current value. Safe by default."
```

- [ ] **Step 5: Trigger a manual staging deploy + verify**

```bash
gh workflow run "Deploy to Staging" --ref staging
gh run watch  # tail the run until completion
```

Then on the VPS:

```bash
ssh sancho-cmo-staging "grep -c '^[A-Z_]*=' /root/.openclaw/.env"
# expect: same count as before, plus any newly-added keys
ssh sancho-cmo-staging "docker compose -f /root/.openclaw/docker-compose.yml logs sanchocmo --tail=20 | grep -E 'started|listening'"
# expect: container running on new SHA
```

Open `/dashboard/<slug>/settings?tab=apis` on staging: every system API row that has a key set in GitHub `staging` should now show 🟢 Connected (or whatever the existing health check returns — at minimum, the badge transitions from ⚫ Sin configurar).

- [ ] **Step 6: If verify fails, rollback**

The previous SHA still has the old workflow that doesn't upsert. Re-deploy that SHA via `git revert HEAD && git push origin staging` (or `gh workflow run "Deploy to Staging" --ref <prev-sha>`). No data loss — `.env` content is preserved across deploys.

---

### Task 4: Apply the same to `deploy-prod.yml`

**Files:**
- Modify: `.github/workflows/deploy-prod.yml` — add the env block + upsert step. Prod currently has none of this.

- [ ] **Step 1: Add the env block to the Deploy step**

In `deploy-prod.yml`, replace the existing env block on the Deploy step (currently lines 42-46) with the same 22-key list as Task 3 Step 1, but pointing at the `production` Environment (GitHub resolves `${{ secrets.X }}` against `environment.name`, so the YAML is identical — secret name + workflow Environment do the dispatch).

```yaml
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          DEPLOY_PATH: ${{ vars.DEPLOY_PATH || '~/.openclaw' }}
          TAG: ${{ steps.tag.outputs.tag }}
          # === System API keys (managed by GitHub `production` Environment) ===
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
```

- [ ] **Step 2: Replace the `run:` body with the env-aware flow**

Replace the existing `run: |` body (currently lines 47-60) with:

```yaml
        run: |
          PAYLOAD_B64=$(python3 - <<'PY'
          import os, json, base64
          KEYS = [
              "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
              "XAI_API_KEY", "MINIMAX_API_KEY", "BRAVE_API_KEY", "APIFY_API_KEY",
              "FIRECRAWL_API_KEY", "SERPER_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD",
              "NOTION_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "FAL_API_KEY",
              "WAVESPEED_API_KEY", "DUMPLING_API_KEY", "SLACK_BOT_TOKEN", "INSTANTLY_API_KEY",
              "METRICOOL_API_KEY", "SANCHO_INTERNAL_API_TOKEN",
          ]
          out = {k: os.environ[k] for k in KEYS if os.environ.get(k)}
          print(base64.b64encode(json.dumps(out).encode()).decode())
          PY
          )

          scp -o StrictHostKeyChecking=no scripts/upsert-env.py "$VPS_USER@$VPS_HOST:/tmp/upsert-env.py"

          ssh "$VPS_USER@$VPS_HOST" "DEPLOY_PATH=$DEPLOY_PATH TAG=$TAG PAYLOAD_B64=$PAYLOAD_B64 bash -s" <<'EOF'
            set -euo pipefail
            cd "$DEPLOY_PATH"
            echo "▶ Fetching tags…"
            git fetch --tags --prune

            ENV_HASH_BEFORE=$(sha256sum .env 2>/dev/null | cut -d' ' -f1 || echo "missing")
            if [ -n "${PAYLOAD_B64:-}" ]; then
              echo "▶ Upserting system env vars from GitHub `production` Environment…"
              echo "$PAYLOAD_B64" | python3 /tmp/upsert-env.py .env
            fi
            ENV_HASH_AFTER=$(sha256sum .env | cut -d' ' -f1)
            ENV_CHANGED=0
            if [ "$ENV_HASH_BEFORE" != "$ENV_HASH_AFTER" ]; then
              ENV_CHANGED=1
              echo "▶ .env content changed (will force-recreate sanchocmo)"
            fi
            rm -f /tmp/upsert-env.py

            echo "▶ Checking out $TAG…"
            git checkout "$TAG"
            export GIT_COMMIT="$(git rev-parse HEAD)"
            echo "▶ Building and starting containers (GIT_COMMIT=$GIT_COMMIT)…"
            docker compose build --pull
            UP_ARGS=""
            if [ "$ENV_CHANGED" = "1" ]; then
              UP_ARGS="--force-recreate"
            fi
            docker compose up -d $UP_ARGS
            docker compose ps
          EOF
```

The rollback step (lines 81-101 of deploy-prod.yml) doesn't need changes — env upsert is idempotent and the previous SHA's `.env` content is already on disk.

- [ ] **Step 3: Lint + commit**

```bash
which actionlint && actionlint .github/workflows/deploy-prod.yml || echo "visual review only"
git add .github/workflows/deploy-prod.yml
git commit -m "ci(deploy-prod): apply system API keys from GitHub Environment

Mirrors deploy-staging.yml: 22 system API keys sourced from the
\`production\` Environment, applied via scripts/upsert-env.py before
\`git checkout \$TAG\`. Conditional --force-recreate on .env change.

Prod previously had no env upsert at all — every key was SSH-edited
by hand. This closes that gap. Existing rollback step is unchanged
(env content is preserved across SHA rollbacks).

DEPENDS ON: Task 0 (GitHub \`production\` Environment populated)."
```

- [ ] **Step 4: Cut a `workflow_dispatch` test deploy**

Don't piggyback this on a release. Use the manual trigger with the current prod tag (so no code change):

```bash
LATEST_TAG=$(gh release list --limit 1 --json tagName -q '.[0].tagName')
gh workflow run "Deploy to Production" --field tag="$LATEST_TAG"
gh run watch
```

This proves the upsert path is correct on prod without rolling forward the deploy SHA. Verify on the VPS:

```bash
ssh sancho-cmo-prod "grep -c '^[A-Z_]*=' /root/.openclaw/.env"
ssh sancho-cmo-prod "docker compose -f /root/.openclaw/docker-compose.yml ps"
```

- [ ] **Step 5: Smoke-test the production APIs panel**

`https://<prod-host>/dashboard/<slug>/settings?tab=apis` should show system rows with their badges. Hit "🔄 Verificar Todo" — health-check writes to `_system/api-health.json` (post-PR #84 path) using the keys from `process.env`.

---

### Task 5: Runbook for operators

**Files:**
- Create: `docs/runbooks/system-keys-management.md`

- [ ] **Step 1: Write the runbook**

```markdown
# System API Keys Management

## Where they live

System API keys (LLM providers, social APIs, data sources) are managed in
**GitHub Environment secrets**, not SSH-edited on the VPS.

- Staging keys → repo Settings → Environments → `staging` → Secrets
- Production keys → repo Settings → Environments → `production` → Secrets

The deploy workflows (`deploy-staging.yml`, `deploy-prod.yml`) apply them
to `~/.openclaw/.env` on the VPS via `scripts/upsert-env.py` before
`docker compose up -d`. If a secret is empty or unset on GitHub, the
upsert skips it — the VPS keeps whatever value is already there.

## Adding a new system API key

1. Add the env var name to `SERVICE_ENV_MAP` in `src/pages/api/env/index.ts`.
2. Add it to the `env:` block on the Deploy step in **both** `deploy-staging.yml`
   and `deploy-prod.yml`, sourced from `${{ secrets.NEW_KEY }}`.
3. Add the same name to the `KEYS = [...]` python list in the same step.
4. Add the secret to the matching GitHub Environment (`staging` and/or `production`).
5. Push to staging → deploy runs → key applied. Same on prod via the next release.

## Rotating a key

1. Update the secret value in the GitHub Environment.
2. Re-run the deploy workflow with `workflow_dispatch` (no code commit needed).
3. The upsert detects the `.env` change via sha256 and force-recreates the
   `sanchocmo` container so it picks up the new value.

Rotation takes 1–2 min; no SSH.

## Disabling a key (revoke without rotating)

Delete the GitHub Environment secret. The next deploy will **not** clear the
VPS's `.env` (the script skips empty values — by design — to avoid accidental
nukes). To actually remove the key from runtime:

1. Delete the GitHub Environment secret (prevents future upserts).
2. SSH to the VPS and remove the line from `~/.openclaw/.env`.
3. `docker compose restart sanchocmo`.

This is the only legitimate remaining SSH operation.

## Why we don't manage everything via GitHub

`NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `OD_API_TOKEN`, `R2_*`, `DATABASE_URL`,
`GOOGLE_CLIENT_*` etc. are out of scope for this rollout — see plan
`docs/plans/2026-05-19-github-env-system-keys.md` for the scope reasoning.
They can be folded in later by extending the keys list; no new code needed.

The other migration target is operator-driven hot rotation via the
`/api/env` endpoint (already implemented, not wired to a UI yet — see
plan `docs/plans/2026-05-19-admin-env-ui.md` once it exists).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/system-keys-management.md
git commit -m "docs: runbook for system API keys management

Where they live (GitHub Environments), how to add/rotate/disable,
and what's still out of scope (infra secrets, hot rotation UI)."
```

---

## Self-review checklist

- **Spec coverage:** user asked to move system keys out of manual SSH editing. Plan covers:
  - All 22 `SERVICE_ENV_MAP` keys → Task 3 + 4 env blocks + KEYS list.
  - Both staging + prod → Task 3 (staging-only) + Task 4 (prod, full step added).
  - Avoiding partial overwrites → Task 0 inventory + script's empty-skip behavior.
  - Operator self-service afterwards → Task 5 runbook.
- **Placeholders:** no "TBD", no "implement later". Every step has exact commands or full code blocks.
- **Type consistency:**
  - `upsert(env_path, updates)` signature is identical in tests + implementation + CLI body.
  - Action strings (`added`/`updated`/`unchanged`/`skipped_empty`) used identically in tests, impl, and the CLI summary.
  - KEYS list is character-identical in deploy-staging.yml and deploy-prod.yml (paste from same source).

---

## Out of scope (next plan, separate branch)

- **`/api/env` admin UI**: cabling the existing endpoint (`src/pages/api/env/index.ts`, already protected with `withAuth`) to a tab in `/dashboard/admin/settings` for hot rotation without a deploy. Tradeoff: drifts from GitHub source-of-truth until next deploy re-asserts. Document the drift behavior in the UI when implemented.
- **Drift detection job**: nightly cron that compares VPS `.env` against the GitHub Environment secret set and reports differences. Useful once both staging + prod have been on this flow for a few weeks.
- **Other categories of secrets**: `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `OD_API_TOKEN`, `R2_*`, `GOOGLE_CLIENT_*`, `DATABASE_URL`. Same mechanism, extend the KEYS list when ready.

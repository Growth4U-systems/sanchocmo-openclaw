"""Route coverage for scripts/wizard.sh.

Exercises the wizard across the user paths that matter for a real install —
provider/auth matrix, quick vs advanced, local/external DB, openclaw/hermes/
external-http runtimes, first-install vs reconfigure (--force), and the
robustness guards added in SAN-443 (JSON-escaping, .env/instance.json
preservation, required external DB URL, slug sanitisation, BYO-runtime
credential handling). These run non-interactively (WIZARD_ASSUME_YES=1) so they
are deterministic in CI; the interactive typo/re-prompt paths are covered by the
pty harness run locally (SAN-437 regression).

Run with:  python3 -m unittest scripts/test_wizard.py -v
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WIZARD = REPO_ROOT / "scripts" / "wizard.sh"
ENV_EXAMPLE = REPO_ROOT / ".env.example"


def parse_env(text):
    """Parse .env into a dict, first '=' splits key/value; comments/blank ignored."""
    out = {}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val
    return out


class WizardRun:
    """Result of one wizard invocation in an isolated workdir."""

    def __init__(self, workdir, proc):
        self.workdir = Path(workdir)
        self.returncode = proc.returncode
        self.stdout = proc.stdout
        self.stderr = proc.stderr

    @property
    def env(self):
        p = self.workdir / ".env"
        return parse_env(p.read_text()) if p.exists() else {}

    def _json(self, rel):
        p = self.workdir / rel
        return json.loads(p.read_text()) if p.exists() else None

    @property
    def clients(self):
        return self._json("config/clients.json")

    @property
    def instance(self):
        return self._json("config/instance.json")

    def env_raw(self):
        p = self.workdir / ".env"
        return p.read_text() if p.exists() else ""


class WizardTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="wizard-test-"))
        (self.dir / "scripts").mkdir()
        (self.dir / "config").mkdir()
        shutil.copy(WIZARD, self.dir / "scripts" / "wizard.sh")
        shutil.copy(ENV_EXAMPLE, self.dir / ".env.example")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_wizard(self, env=None, args=("--quick",)):
        base = {
            "WIZARD_ASSUME_YES": "1",
            # Keep the host env from leaking a real provider key into the wizard.
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.dir),
        }
        if env:
            base.update({k: str(v) for k, v in env.items()})
        proc = subprocess.run(
            ["bash", str(self.dir / "scripts" / "wizard.sh"), *args],
            cwd=str(self.dir),
            env=base,
            capture_output=True,
            text=True,
        )
        return WizardRun(self.dir, proc)

    # --- provider / auth matrix (quick) -------------------------------------

    def test_quick_fireworks(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-KEY",
                             "FIRST_BRAND_NAME": "Brand"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("FIREWORKS_API_KEY"), "fw-KEY")
        self.assertEqual(r.env.get("COMPOSE_PROFILES"), "local-db")
        self.assertIsNotNone(r.clients)

    def test_quick_anthropic_api_key(self):
        r = self.run_wizard({"PROVIDER": "anthropic", "ANTHROPIC_AUTH_MODE": "api_key",
                             "ANTHROPIC_API_KEY": "sk-ant-KEY"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("ANTHROPIC_API_KEY"), "sk-ant-KEY")
        self.assertEqual(r.env.get("ANTHROPIC_AUTH_MODE"), "api_key")
        self.assertEqual(r.env.get("ANTHROPIC_OAUTH_TOKEN"), "")

    def test_quick_anthropic_subscription(self):
        r = self.run_wizard({"PROVIDER": "anthropic", "ANTHROPIC_AUTH_MODE": "subscription",
                             "ANTHROPIC_OAUTH_TOKEN": "sk-ant-oat-TOKEN"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("ANTHROPIC_OAUTH_TOKEN"), "sk-ant-oat-TOKEN")
        self.assertEqual(r.env.get("ANTHROPIC_API_KEY"), "")

    def test_quick_openai_api_key(self):
        r = self.run_wizard({"PROVIDER": "openai", "OPENAI_AUTH_MODE": "api_key",
                             "OPENAI_API_KEY": "sk-openai-KEY"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("OPENAI_API_KEY"), "sk-openai-KEY")

    def test_quick_all_providers(self):
        r = self.run_wizard({"PROVIDER": "all",
                             "ANTHROPIC_AUTH_MODE": "api_key", "ANTHROPIC_API_KEY": "sk-ant",
                             "OPENAI_AUTH_MODE": "api_key", "OPENAI_API_KEY": "sk-oai",
                             "FIREWORKS_API_KEY": "fw-K"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("ANTHROPIC_API_KEY"), "sk-ant")
        self.assertEqual(r.env.get("OPENAI_API_KEY"), "sk-oai")
        self.assertEqual(r.env.get("FIREWORKS_API_KEY"), "fw-K")

    # --- negative: no usable credential aborts (SAN-437 guard) ---------------

    def test_openai_subscription_only_aborts(self):
        r = self.run_wizard({"PROVIDER": "openai", "OPENAI_AUTH_MODE": "subscription"})
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((self.dir / ".env").exists(), "must not write a credential-less .env")

    def test_provider_without_key_aborts(self):
        r = self.run_wizard({"PROVIDER": "fireworks"})  # no FIREWORKS_API_KEY
        self.assertNotEqual(r.returncode, 0)

    # --- Finding 1: JSON injection via brand name ---------------------------

    def test_brand_name_with_quotes_produces_valid_json(self):
        name = 'Acme "Rockets" Inc'
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "FIRST_BRAND_NAME": name})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(r.clients, "clients.json must be valid JSON")
        self.assertEqual(r.clients["clients"][0]["name"], name)

    def test_brand_name_with_backslash_produces_valid_json(self):
        name = r"Back\slash \ Co"
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "FIRST_BRAND_NAME": name})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(r.clients)
        self.assertEqual(r.clients["clients"][0]["name"], name)

    def test_access_url_with_quote_produces_valid_instance_json(self):
        r = self.run_wizard(
            {"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
             "DB_MODE": "local", "BASE_URL": 'http://x"y'},
            args=("--advanced",),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(r.instance, "instance.json must be valid JSON")

    # --- Finding 2: reconfigure preserves custom .env keys ------------------

    def test_reconfigure_preserves_custom_env_keys(self):
        env = {"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K", "FIRST_BRAND_NAME": "B"}
        self.run_wizard(env)
        # user adds keys by hand post-install
        with (self.dir / ".env").open("a") as f:
            f.write("\nDISCORD_BOT_TOKEN=discord-abc\nNOTION_API_KEY=ntn-xyz\n")
        r = self.run_wizard(env, args=("--quick", "--force"))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("DISCORD_BOT_TOKEN"), "discord-abc")
        self.assertEqual(r.env.get("NOTION_API_KEY"), "ntn-xyz")
        # and the managed key is still correct
        self.assertEqual(r.env.get("FIREWORKS_API_KEY"), "fw-K")

    def test_reconfigure_preserves_clients_json(self):
        env = {"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K", "FIRST_BRAND_NAME": "First"}
        self.run_wizard(env)
        first = (self.dir / "config" / "clients.json").read_text()
        r = self.run_wizard({**env, "FIRST_BRAND_NAME": "Different"}, args=("--quick", "--force"))
        self.assertEqual(r.returncode, 0, r.stderr)
        # clients.json preserved verbatim (brand registry is stateful)
        self.assertEqual((self.dir / "config" / "clients.json").read_text(), first)

    # --- Finding 4: reconfigure preserves instance.json accounts ------------

    def test_reconfigure_preserves_instance_accounts(self):
        env = {"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K"}
        self.run_wizard(env)
        # simulate accounts populated after install
        inst = self.dir / "config" / "instance.json"
        data = json.loads(inst.read_text())
        data["accounts"] = {"discord": {"guild": "123"}}
        inst.write_text(json.dumps(data))
        r = self.run_wizard(env, args=("--quick", "--force"))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.instance["accounts"], {"discord": {"guild": "123"}})

    # --- Finding 3: external DB requires a URL ------------------------------

    def test_external_db_without_url_aborts(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "DB_MODE": "external"})
        self.assertNotEqual(r.returncode, 0, "external DB with no URL must abort")

    def test_external_db_with_url(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "DB_MODE": "external",
                             "DATABASE_URL": "postgres://u:p@host:5432/db"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("DATABASE_URL"), "postgres://u:p@host:5432/db")
        self.assertEqual(r.env.get("COMPOSE_PROFILES"), "")

    def test_local_db_generates_url_and_profile(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "DB_MODE": "local"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(r.env.get("DATABASE_URL", "").startswith("postgres://sancho:"))
        self.assertEqual(r.env.get("COMPOSE_PROFILES"), "local-db")

    # --- Finding 5: slug always sanitised -----------------------------------

    def test_slug_from_env_is_slugified(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "FIRST_BRAND_NAME": "N", "FIRST_BRAND_SLUG": "My Brand SLUG!"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.clients["clients"][0]["slug"], "my-brand-slug")

    def test_slug_derived_from_name(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K",
                             "FIRST_BRAND_NAME": "Acme Rockets"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.clients["clients"][0]["slug"], "acme-rockets")

    # --- Finding 6: BYO runtime credential handling -------------------------

    def test_external_http_runtime_needs_no_model_credential(self):
        r = self.run_wizard(
            {"SANCHO_RUNTIME": "external-http",
             "SANCHO_EXTERNAL_GATEWAY_URL": "http://127.0.0.1:18792"},
            args=("--advanced",),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("SANCHO_RUNTIME"), "external-http")
        # no provider credential was required
        self.assertEqual(r.env.get("ANTHROPIC_API_KEY"), "")
        self.assertEqual(r.env.get("FIREWORKS_API_KEY"), "")

    def test_hermes_runtime_still_requires_model_credential(self):
        # hermes runs an agent locally (bridge/CLI) → a credential IS required.
        r = self.run_wizard(
            {"SANCHO_RUNTIME": "hermes", "HERMES_GATEWAY_URL": "https://hermes.example.com",
             "PROVIDER": "openai", "OPENAI_AUTH_MODE": "subscription"},  # keyless
            args=("--advanced",),
        )
        self.assertNotEqual(r.returncode, 0, "hermes without a usable credential must abort")

    def test_hermes_runtime_with_credential(self):
        r = self.run_wizard(
            {"SANCHO_RUNTIME": "hermes", "HERMES_GATEWAY_URL": "https://hermes.example.com",
             "PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K"},
            args=("--advanced",),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.env.get("SANCHO_RUNTIME"), "hermes")
        self.assertEqual(r.env.get("FIREWORKS_API_KEY"), "fw-K")

    # --- clobber guard ------------------------------------------------------

    def test_noninteractive_refuses_overwrite_without_force(self):
        env = {"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K"}
        self.run_wizard(env)
        r = self.run_wizard(env)  # second run, no --force
        self.assertNotEqual(r.returncode, 0, "must refuse to clobber without --force")

    # --- no placeholder leaks -----------------------------------------------

    def test_no_placeholder_leaks_into_env(self):
        r = self.run_wizard({"PROVIDER": "fireworks", "FIREWORKS_API_KEY": "fw-K"})
        self.assertEqual(r.returncode, 0, r.stderr)
        raw = r.env_raw()
        # the .env.example ships commented placeholders; the live .env must not
        # carry an uncommented example value for the model keys.
        self.assertNotIn("FIREWORKS_API_KEY=fw-...", raw)
        self.assertNotIn("ANTHROPIC_API_KEY=sk-ant-...", raw)


if __name__ == "__main__":
    unittest.main()

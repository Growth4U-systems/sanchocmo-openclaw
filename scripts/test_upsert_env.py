"""Tests for scripts/upsert-env.py.

Run with:  python3 -m unittest scripts/test_upsert_env.py -v
"""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Module name has a hyphen → import via importlib so tests don't depend on a rename.
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
        import base64
        import json
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

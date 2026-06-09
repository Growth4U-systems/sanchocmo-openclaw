import subprocess, sys, tempfile, unittest
from pathlib import Path

SCRIPT = Path(__file__).parent / "regenerate-company-brief.py"


def run(workspace: Path, slug: str):
    return subprocess.run(
        [sys.executable, str(SCRIPT), slug],
        env={"SANCHO_WORKSPACE": str(workspace)},
        capture_output=True, text=True,
    )


def make_brand(workspace: Path, slug: str) -> Path:
    b = workspace / "brand" / slug
    (b / "company-context").mkdir(parents=True)
    (b / "business-model").mkdir(parents=True)
    (b / "budget").mkdir(parents=True)
    return b


class TestRegen(unittest.TestCase):
    def test_no_full_standalone_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            ws = Path(d)
            make_brand(ws, "acme")
            r = run(ws, "acme")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse((ws / "brand/acme/company-brief").exists(),
                             "must NOT create company-brief when no full standalone")

    def test_one_full_writes_canonical_current(self):
        with tempfile.TemporaryDirectory() as d:
            ws = Path(d)
            b = make_brand(ws, "acme")
            (b / "company-context" / "company-context.current.md").write_text(
                "# Company Identity\n\nAcme makes widgets.\n", encoding="utf-8")
            r = run(ws, "acme")
            self.assertEqual(r.returncode, 0, r.stderr)
            out = b / "company-brief" / "company-brief.current.md"
            self.assertTrue(out.exists(), "must write company-brief.current.md")
            self.assertFalse((b / "company-brief" / "lite.md").exists(),
                             "must NOT write a lite merge view")
            self.assertIn("Acme makes widgets", out.read_text(encoding="utf-8"))

    def test_ignores_legacy_lite(self):
        with tempfile.TemporaryDirectory() as d:
            ws = Path(d)
            b = make_brand(ws, "acme")
            (b / "company-context" / "lite.md").write_text("# x\nlegacy seed\n", encoding="utf-8")
            r = run(ws, "acme")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse((b / "company-brief").exists(),
                             "legacy lite.md must be ignored (no fallback)")


if __name__ == "__main__":
    unittest.main()

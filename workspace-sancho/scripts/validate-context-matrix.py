#!/usr/bin/env python3
"""
validate-context-matrix.py — Verifica que todas las skills tengan
bloques context_required y context_writes en su frontmatter YAML.

Uso: python3 scripts/validate-context-matrix.py [--fix]
  --fix: No implementado, solo reporta.

Exit codes:
  0 = todas las skills tienen context matrix
  1 = hay skills sin context matrix
"""

import os
import sys
import re
from pathlib import Path

SKILLS_DIR = Path(__file__).parent.parent / "skills"
REQUIRED_FIELDS = ["context_required", "context_writes"]


def extract_frontmatter(filepath: Path):
    """Extract YAML frontmatter from a SKILL.md file."""
    content = filepath.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    return match.group(1) if match else None


def check_skill(skill_dir: Path) -> dict:
    """Check a single skill for context matrix fields."""
    skill_md = skill_dir / "SKILL.md"
    result = {
        "name": skill_dir.name,
        "has_frontmatter": False,
        "has_context_required": False,
        "has_context_writes": False,
        "context_required": [],
        "context_writes": [],
    }

    if not skill_md.exists():
        return result

    frontmatter = extract_frontmatter(skill_md)
    if frontmatter is None:
        return result

    result["has_frontmatter"] = True
    result["has_context_required"] = "context_required" in frontmatter
    result["has_context_writes"] = "context_writes" in frontmatter

    # Extract values
    for field in REQUIRED_FIELDS:
        pattern = rf"{field}:\s*\n((?:\s*-\s*.+\n)*)"
        match = re.search(pattern, frontmatter)
        if match:
            items = re.findall(r"-\s*(.+)", match.group(1))
            result[field] = [i.strip() for i in items]
        elif f"{field}: []" in frontmatter:
            result[field] = []

    return result


def main():
    if not SKILLS_DIR.exists():
        print(f"❌ Skills directory not found: {SKILLS_DIR}")
        sys.exit(1)

    skill_dirs = sorted(
        [d for d in SKILLS_DIR.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    )

    print(f"🔍 Scanning {len(skill_dirs)} skills...\n")

    missing = []
    partial = []
    complete = []

    for skill_dir in skill_dirs:
        result = check_skill(skill_dir)

        if not result["has_frontmatter"]:
            missing.append(result)
        elif not result["has_context_required"] or not result["has_context_writes"]:
            partial.append(result)
        else:
            complete.append(result)

    # Report
    print(f"✅ Complete: {len(complete)}/{len(skill_dirs)}")
    if partial:
        print(f"⚠️  Partial:  {len(partial)}/{len(skill_dirs)}")
        for r in partial:
            fields = []
            if not r["has_context_required"]:
                fields.append("context_required")
            if not r["has_context_writes"]:
                fields.append("context_writes")
            print(f"   - {r['name']}: missing {', '.join(fields)}")

    if missing:
        print(f"❌ Missing:  {len(missing)}/{len(skill_dirs)}")
        for r in missing:
            print(f"   - {r['name']}: no YAML frontmatter")

    # Summary stats
    print(f"\n📊 Context Matrix Summary:")
    reads_total = sum(len(r["context_required"]) for r in complete)
    writes_total = sum(len(r["context_writes"]) for r in complete)
    empty_reads = sum(1 for r in complete if len(r["context_required"]) == 0)
    empty_writes = sum(1 for r in complete if len(r["context_writes"]) == 0)
    print(f"   Total read paths:  {reads_total} across {len(complete) - empty_reads} skills")
    print(f"   Total write paths: {writes_total} across {len(complete) - empty_writes} skills")
    print(f"   Utility skills (no reads/writes): {min(empty_reads, empty_writes)}")

    if missing or partial:
        sys.exit(1)
    else:
        print(f"\n✅ All {len(skill_dirs)} skills have complete context matrix.")
        sys.exit(0)


if __name__ == "__main__":
    main()

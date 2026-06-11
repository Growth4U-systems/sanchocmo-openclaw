#!/usr/bin/env python3
"""
Regenerate the company-brief merge view for a brand.

Reads each standalone (company-context, business-model, budget). For each:
  - Prefers `<section>/current.md` (full skill output)
  - Falls back to `<section>/lite.md` (fast-foundation seed)
  - Falls back to a "_pendiente_" placeholder if neither exists

Writes `company-brief/current.md` if AT LEAST ONE source is full; otherwise
writes `company-brief/lite.md`. This way the canonical `current.md` only
exists once at least one full skill has produced its standalone.

Usage:
  python3 scripts/regenerate-company-brief.py <brand-slug>
  python3 scripts/regenerate-company-brief.py --all          # all brands
"""

from __future__ import annotations
import os, sys, re
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(
    os.environ.get(
        "SANCHO_WORKSPACE",
        os.environ.get("MC_WORKSPACE", Path.home() / ".openclaw" / "workspace-sancho"),
    )
)

# Section title → (folder name, standalone filename hint)
SECTIONS = [
    ("Company Identity", "company-context", "company-context"),
    ("Business Model",   "business-model",  "business-model-audit"),
    ("Budget & Resources","budget",         "budget-constraints"),
]


def strip_frontmatter(text: str) -> str:
    """Remove leading YAML frontmatter and HTML comments from a markdown doc."""
    s = text.lstrip()
    if s.startswith("---"):
        end = s.find("\n---", 3)
        if end != -1:
            s = s[end + 4:].lstrip()
    # Strip leading HTML comments (e.g. <!-- source: ... -->)
    while s.startswith("<!--"):
        close = s.find("-->")
        if close == -1:
            break
        s = s[close + 3:].lstrip()
    # Strip a leading H1 if present (we re-emit our own title)
    if s.startswith("# "):
        nl = s.find("\n")
        s = s[nl + 1:].lstrip() if nl != -1 else ""
    return s


def read_section(brand_dir: Path, folder: str) -> tuple[str, str]:
    """Return (source, content). source ∈ {"full", "lite", "missing"}."""
    full = brand_dir / folder / "current.md"
    lite = brand_dir / folder / "lite.md"
    if full.exists() and full.is_file():
        return ("full", strip_frontmatter(full.read_text(encoding="utf-8")))
    if lite.exists() and lite.is_file():
        return ("lite", strip_frontmatter(lite.read_text(encoding="utf-8")))
    return ("missing", "")


def regenerate_brand(brand_dir: Path) -> str | None:
    """Regenerate company-brief for one brand. Returns the path written, or None if skipped."""
    if not brand_dir.is_dir():
        return None
    brand_slug = brand_dir.name

    parts: list[tuple[str, str, str]] = []  # (title, source, content)
    any_full = False
    any_present = False
    for title, folder, skill_name in SECTIONS:
        source, content = read_section(brand_dir, folder)
        if source == "full":
            any_full = True
            any_present = True
        elif source == "lite":
            any_present = True
        parts.append((title, source, content if content else f"_pendiente — correr {skill_name}_"))

    if not any_present:
        return None  # nothing to merge

    # If at least one section is full, write to current.md (mixed if not all full).
    # Otherwise write to lite.md (pure lite merge — what fast-foundation produces).
    target_name = "current.md" if any_full else "lite.md"
    target = brand_dir / "company-brief" / target_name
    target.parent.mkdir(parents=True, exist_ok=True)

    if any_full:
        modes = ", ".join(f"{title.lower().split()[0]}={src}" for title, src, _ in parts)
        mode_tag = "full" if all(src == "full" for _, src, _ in parts) else "mixed"
        header_source = f"regenerate-company-brief | sections: {modes}"
    else:
        mode_tag = "lite"
        header_source = "fast-foundation (merge view from lites)"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        f"# Company Brief — {brand_slug}",
        f"<!-- mode: {mode_tag} | source: {header_source} | regenerated: {now} -->",
        "<!-- auto-generated — edits to this file will be overwritten on next regen -->",
        "",
    ]
    for title, source, content in parts:
        badge = "" if source == "full" else f" _(source: {source})_"
        lines.append(f"## {title}{badge}")
        lines.append("")
        lines.append(content.rstrip() if content else "")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Trim trailing separator
    while lines and lines[-1] in ("", "---"):
        lines.pop()
    lines.append("")

    target.write_text("\n".join(lines), encoding="utf-8")
    return str(target)


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    brand_root = WORKSPACE / "brand"
    if not brand_root.is_dir():
        print(f"ERROR: brand root not found: {brand_root}", file=sys.stderr)
        sys.exit(1)

    if args[0] == "--all":
        slugs = sorted(p.name for p in brand_root.iterdir() if p.is_dir() and not p.name.startswith("_"))
    else:
        slugs = args

    written = 0
    skipped = 0
    for slug in slugs:
        brand_dir = brand_root / slug
        if not brand_dir.is_dir():
            print(f"  SKIP   {slug} (not a brand dir)")
            skipped += 1
            continue
        result = regenerate_brand(brand_dir)
        if result is None:
            print(f"  SKIP   {slug} (no standalones present)")
            skipped += 1
        else:
            # Strip workspace prefix for log readability
            rel = Path(result).relative_to(WORKSPACE) if str(result).startswith(str(WORKSPACE)) else Path(result)
            print(f"  WRITE  {slug} -> {rel}")
            written += 1

    print(f"\nDone: {written} written, {skipped} skipped")


if __name__ == "__main__":
    main()

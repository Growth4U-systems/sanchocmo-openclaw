#!/usr/bin/env python3
"""
verify-file-index.py — Reconcilia file_index en foundation-state.json con archivos reales en disco.

Uso:
  python3 scripts/verify-file-index.py                    # Verificar todos los clientes
  python3 scripts/verify-file-index.py --slug growth4u    # Solo un cliente
  python3 scripts/verify-file-index.py --fix              # Corregir discrepancias automáticamente
  python3 scripts/verify-file-index.py --fix --slug criptan
"""

import json
import os
import sys
import argparse
from pathlib import Path

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND_DIR = os.path.join(WORKSPACE, "brand")

# Known directories to scan for unindexed files
SCAN_DIRS = {
    "competitors": "market-and-us/competitors",
    "presentations": "presentations",
    "brand_assets_book": "brand-book/visual-identity",
    "brand_assets_identity": "brand-identity/visual-identity",
    "metrics": "metrics",
}

# File patterns to detect as indexable (non-pillar files at brand root)
ROOT_INDEXABLE = {
    "integrations.json": ("integrations", None),
    "metrics-plan.json": ("metrics", "plan_json"),
    "costs.json": ("operational", "costs"),
    "current-state.md": ("operational", "current_state"),
    "lead-tracking-config.json": ("operational", "lead_tracking_config"),
    "discord-channels.json": ("discord", "channels"),
    "memory.md": ("memory", None),
    "llms.txt": ("public", "llms_txt"),
    "client-config.json": ("discord", "client_config"),
}


def flatten_file_index(file_index, prefix=""):
    """Recursively flatten file_index into a list of (key_path, file_path) tuples."""
    entries = []
    for key, value in file_index.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, str):
            entries.append((full_key, value))
        elif isinstance(value, dict):
            entries.extend(flatten_file_index(value, full_key))
        # Skip None values
    return entries


def scan_competitor_dirs(brand_path):
    """Find competitor battle card directories not in file_index."""
    comp_dir = os.path.join(brand_path, "market-and-us", "competitors")
    if not os.path.isdir(comp_dir):
        return []
    found = []
    for entry in os.listdir(comp_dir):
        entry_path = os.path.join(comp_dir, entry)
        if os.path.isdir(entry_path):
            current_md = os.path.join(entry_path, "current.md")
            if os.path.exists(current_md):
                rel = f"market-and-us/competitors/{entry}/current.md"
                found.append((entry, rel))
    return found


def scan_presentations(brand_path):
    """Find presentation HTML files not in file_index."""
    pres_dir = os.path.join(brand_path, "presentations")
    if not os.path.isdir(pres_dir):
        return []
    found = []
    for f in os.listdir(pres_dir):
        if f.endswith(".html"):
            name = f.replace(".html", "")
            found.append((name, f"presentations/{f}"))
    return found


def scan_root_files(brand_path):
    """Find indexable files at brand root."""
    found = []
    for filename, (domain, key) in ROOT_INDEXABLE.items():
        filepath = os.path.join(brand_path, filename)
        if os.path.exists(filepath):
            found.append((filename, domain, key))
    return found


def verify_client(slug, fix=False):
    """Verify file_index for a single client. Returns (issues, fixes)."""
    brand_path = os.path.join(BRAND_DIR, slug)
    state_file = os.path.join(brand_path, "foundation-state.json")

    if not os.path.exists(state_file):
        print(f"  ⚠️  No foundation-state.json found")
        return [], []

    with open(state_file, "r") as f:
        state = json.load(f)

    file_index = state.get("file_index")
    if file_index is None:
        print(f"  ⚠️  No file_index in foundation-state.json")
        if fix:
            state["file_index"] = {}
            file_index = state["file_index"]
        else:
            return [("NO_FILE_INDEX", "file_index missing entirely")], []

    issues = []
    fixes = []

    # --- Check 1: Indexed files exist on disk ---
    entries = flatten_file_index(file_index)
    for key_path, rel_path in entries:
        abs_path = os.path.join(brand_path, rel_path)
        if rel_path.endswith("/"):
            if not os.path.isdir(abs_path):
                issues.append(("MISSING_ON_DISK", f"{key_path} → {rel_path}"))
                if fix:
                    # Don't auto-remove dir entries — might just be empty
                    pass
        else:
            if not os.path.exists(abs_path):
                issues.append(("MISSING_ON_DISK", f"{key_path} → {rel_path}"))
                if fix:
                    # Remove entry from file_index
                    _remove_from_index(file_index, key_path)
                    fixes.append(f"Removed {key_path} (file not found)")

    # --- Check 2: Competitor battle cards on disk but not indexed ---
    indexed_competitors = set()
    battle_cards = file_index.get("competitors", {}).get("battle_cards", {})
    if isinstance(battle_cards, dict):
        indexed_competitors = set(battle_cards.keys())

    disk_competitors = scan_competitor_dirs(brand_path)
    for comp_slug, rel_path in disk_competitors:
        if comp_slug not in indexed_competitors:
            issues.append(("MISSING_IN_INDEX", f"competitors.battle_cards.{comp_slug} → {rel_path}"))
            if fix:
                if "competitors" not in file_index:
                    file_index["competitors"] = {}
                if "battle_cards" not in file_index["competitors"]:
                    file_index["competitors"]["battle_cards"] = {}
                file_index["competitors"]["battle_cards"][comp_slug] = rel_path
                fixes.append(f"Added competitors.battle_cards.{comp_slug}")

    # --- Check 3: Competitor sources.json ---
    sources_path = os.path.join(brand_path, "market-and-us", "competitors", "sources.json")
    if os.path.exists(sources_path):
        comp = file_index.get("competitors", {})
        if not comp.get("sources"):
            issues.append(("MISSING_IN_INDEX", "competitors.sources → market-and-us/competitors/sources.json"))
            if fix:
                if "competitors" not in file_index:
                    file_index["competitors"] = {}
                file_index["competitors"]["sources"] = "market-and-us/competitors/sources.json"
                fixes.append("Added competitors.sources")

    # --- Check 4: Presentations on disk but not indexed ---
    indexed_presentations = set()
    pres = file_index.get("presentations", {})
    if isinstance(pres, dict):
        indexed_presentations = set(pres.values())

    disk_presentations = scan_presentations(brand_path)
    for name, rel_path in disk_presentations:
        if rel_path not in indexed_presentations:
            issues.append(("MISSING_IN_INDEX", f"presentations.{name} → {rel_path}"))
            if fix:
                if "presentations" not in file_index:
                    file_index["presentations"] = {}
                file_index["presentations"][name] = rel_path
                fixes.append(f"Added presentations.{name}")

    # --- Check 5: Root indexable files ---
    for filename, domain, key in scan_root_files(brand_path):
        domain_data = file_index.get(domain)
        if domain_data is None:
            issues.append(("MISSING_IN_INDEX", f"{domain}.{key or domain} → {filename}"))
            if fix:
                if key:
                    if domain not in file_index:
                        file_index[domain] = {}
                    file_index[domain][key] = filename
                else:
                    file_index[domain] = filename
                fixes.append(f"Added {domain}.{key or domain}")
        elif isinstance(domain_data, dict) and key:
            if key not in domain_data:
                issues.append(("MISSING_IN_INDEX", f"{domain}.{key} → {filename}"))
                if fix:
                    file_index[domain][key] = filename
                    fixes.append(f"Added {domain}.{key}")

    # --- Check 6: brand_summary exists ---
    brand_summary = state.get("brand_summary")
    if not brand_summary or not brand_summary.get("company_name"):
        issues.append(("MISSING_BRAND_SUMMARY", "brand_summary missing or empty"))

    # --- Write fixes ---
    if fix and fixes:
        state["file_index"] = file_index
        json_str = json.dumps(state, indent=2, ensure_ascii=False)
        # Validate before writing
        json.loads(json_str)
        with open(state_file, "w") as f:
            f.write(json_str)

    return issues, fixes


def _remove_from_index(index, key_path):
    """Remove a nested key from file_index by dot-path."""
    parts = key_path.split(".")
    obj = index
    for part in parts[:-1]:
        if isinstance(obj, dict) and part in obj:
            obj = obj[part]
        else:
            return
    if isinstance(obj, dict) and parts[-1] in obj:
        del obj[parts[-1]]


def main():
    parser = argparse.ArgumentParser(description="Verify file_index in foundation-state.json")
    parser.add_argument("--slug", help="Only verify specific client")
    parser.add_argument("--fix", action="store_true", help="Auto-fix discrepancies")
    args = parser.parse_args()

    if not os.path.isdir(BRAND_DIR):
        print(f"Brand directory not found: {BRAND_DIR}")
        sys.exit(1)

    slugs = [args.slug] if args.slug else sorted([
        d for d in os.listdir(BRAND_DIR)
        if os.path.isdir(os.path.join(BRAND_DIR, d)) and not d.startswith(".")
    ])

    total_issues = 0
    total_fixes = 0

    for slug in slugs:
        print(f"\n=== {slug} ===")
        issues, fixes = verify_client(slug, fix=args.fix)

        if not issues:
            # Count valid entries
            state_file = os.path.join(BRAND_DIR, slug, "foundation-state.json")
            if os.path.exists(state_file):
                with open(state_file) as f:
                    fi = json.load(f).get("file_index", {})
                count = len(flatten_file_index(fi))
                print(f"  ✅ file_index OK ({count} entries)")
        else:
            for kind, desc in issues:
                icon = "🔴" if kind == "MISSING_ON_DISK" else "🟡" if kind == "MISSING_IN_INDEX" else "⚠️"
                print(f"  {icon} {kind}: {desc}")
            total_issues += len(issues)

        if fixes:
            for fix_desc in fixes:
                print(f"  🔧 FIXED: {fix_desc}")
            total_fixes += len(fixes)

    print(f"\n{'─' * 40}")
    print(f"Total: {total_issues} issues found", end="")
    if args.fix:
        print(f", {total_fixes} fixed")
    else:
        print(" (run with --fix to auto-correct)" if total_issues > 0 else "")


if __name__ == "__main__":
    main()

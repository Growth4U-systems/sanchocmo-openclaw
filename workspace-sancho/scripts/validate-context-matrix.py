#!/usr/bin/env python3
"""T-031: Validate context_required and context_writes in all SKILL.md files."""

import os
import sys
import yaml

SKILLS_DIR = os.path.expanduser("~/.openclaw/workspace-sancho/skills")

# Valid brand/ files that skills can reference
VALID_BRAND_FILES = {
    "brand/company-context.md", "brand/voice-profile.md", "brand/positioning.md",
    "brand/icp.md", "brand/ecps.md", "brand/competitors.md", "brand/market.md",
    "brand/product-analysis.md", "brand/swot.md", "brand/pricing.md",
    "brand/business-model.md", "brand/team.md", "brand/budget.md",
    "brand/customer-data.md", "brand/keyword-plan.md", "brand/channel-plan.md",
    "brand/content-calendar.md", "brand/assets.md", "brand/learnings.md",
    "brand/stack.md",
}

# Valid directories for writes
VALID_WRITE_DIRS = {
    "campaigns/", "brand/transitory/daily-pulse/", "content-ideas/",
    "intelligence/", "patterns/",
}

# Skills that are allowed to write to brand/ profile files (owners per brand-memory.md)
BRAND_OWNERS = {
    "brand/company-context.md": ["company-context"],
    "brand/team.md": ["company-context"],
    "brand/voice-profile.md": ["brand-voice"],
    "brand/positioning.md": ["positioning-messaging"],
    "brand/icp.md": ["niche-discovery-100x"],
    "brand/ecps.md": ["niche-discovery-100x", "ecp-validation"],
    "brand/competitors.md": ["competitor-intelligence"],
    "brand/market.md": ["market-intelligence"],
    "brand/product-analysis.md": ["self-intelligence"],
    "brand/swot.md": ["swot-analysis"],
    "brand/business-model.md": ["business-model-audit"],
    "brand/budget.md": ["budget-constraints"],
    "brand/customer-data.md": ["existing-customer-data"],
    "brand/keyword-plan.md": ["keyword-research"],
    "brand/channel-plan.md": ["channel-prioritization"],
    "brand/content-calendar.md": ["content-calendar-planner"],
    "brand/pricing.md": ["pricing-strategy"],
    "brand/stack.md": ["sancho-start"],
    # Append-only files: ALL skills can write
    "brand/assets.md": None,  # None = any skill
    "brand/learnings.md": None,
}


def parse_frontmatter(content):
    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None
    try:
        return yaml.safe_load(content[3:end].strip())
    except yaml.YAMLError:
        return None


def main():
    errors = []
    warnings = []
    total = 0
    has_required = 0
    has_writes = 0

    for skill_name in sorted(os.listdir(SKILLS_DIR)):
        skill_path = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
        if not os.path.isfile(skill_path):
            continue

        total += 1
        with open(skill_path, "r") as f:
            fm = parse_frontmatter(f.read())

        if fm is None:
            errors.append(f"❌ {skill_name}: No valid frontmatter")
            continue

        # Check context_required exists
        cr = fm.get("context_required")
        if cr is None:
            errors.append(f"❌ {skill_name}: Missing context_required")
        else:
            has_required += 1
            if isinstance(cr, list):
                for f_path in cr:
                    if f_path not in VALID_BRAND_FILES and not f_path.endswith("/"):
                        if f_path not in VALID_WRITE_DIRS:
                            warnings.append(f"⚠️  {skill_name}: context_required references unknown file: {f_path}")

        # Check context_writes exists
        cw = fm.get("context_writes")
        if cw is None:
            errors.append(f"❌ {skill_name}: Missing context_writes")
        else:
            has_writes += 1
            if isinstance(cw, list):
                for f_path in cw:
                    # Check directory writes
                    if f_path.endswith("/"):
                        if f_path not in VALID_WRITE_DIRS:
                            warnings.append(f"⚠️  {skill_name}: writes to unknown directory: {f_path}")
                        continue
                    # Check brand file ownership
                    if f_path in BRAND_OWNERS:
                        allowed = BRAND_OWNERS[f_path]
                        if allowed is not None and skill_name not in allowed:
                            errors.append(f"❌ {skill_name}: writes to {f_path} but is not the owner (owners: {allowed})")

    # Summary
    print("=" * 50)
    print("T-031 Context Matrix Validation")
    print("=" * 50)
    print(f"\nSkills scanned:        {total}")
    print(f"Have context_required: {has_required}/{total}")
    print(f"Have context_writes:   {has_writes}/{total}")

    if errors:
        print(f"\n❌ ERRORS ({len(errors)}):")
        for e in errors:
            print(f"  {e}")

    if warnings:
        print(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"  {w}")

    if not errors:
        print("\n✅ ALL CHECKS PASSED")
        return 0
    else:
        print(f"\n❌ {len(errors)} errors found")
        return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""T-031: Add context_required and context_writes to all SKILL.md frontmatter."""

import os
import re
import yaml

SKILLS_DIR = os.path.expanduser("~/.openclaw/workspace-sancho/skills")

# Context matrix based on brand-memory.md + skill body analysis
CONTEXT_MATRIX = {
    "brand-voice": {
        "context_required": [
            "brand/company-context.md",
            "brand/positioning.md"
        ],
        "context_writes": [
            "brand/voice-profile.md",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "budget-constraints": {
        "context_required": [
            "brand/company-context.md"
        ],
        "context_writes": [
            "brand/budget.md",
            "brand/learnings.md"
        ]
    },
    "business-model-audit": {
        "context_required": [
            "brand/company-context.md",
            "brand/competitors.md"
        ],
        "context_writes": [
            "brand/business-model.md",
            "brand/learnings.md"
        ]
    },
    "channel-prioritization": {
        "context_required": [
            "brand/budget.md",
            "brand/company-context.md",
            "brand/ecps.md",
            "brand/positioning.md",
            "brand/competitors.md",
            "brand/product-analysis.md",
            "brand/stack.md"
        ],
        "context_writes": [
            "brand/channel-plan.md",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "comic-ui-system": {
        "context_required": [],
        "context_writes": []
    },
    "company-context": {
        "context_required": [],
        "context_writes": [
            "brand/company-context.md",
            "brand/team.md",
            "brand/learnings.md"
        ]
    },
    "company-finder": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md",
            "brand/competitors.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/assets.md"
        ]
    },
    "competitor-intelligence": {
        "context_required": [
            "brand/company-context.md",
            "brand/positioning.md"
        ],
        "context_writes": [
            "brand/competitors.md",
            "brand/learnings.md"
        ]
    },
    "contact-enrichment": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/assets.md"
        ]
    },
    "content-atomizer": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/learnings.md",
            "brand/stack.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "content-calendar-planner": {
        "context_required": [
            "brand/channel-plan.md",
            "brand/positioning.md",
            "brand/keyword-plan.md",
            "brand/voice-profile.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "brand/content-calendar.md",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "content-miner": {
        "context_required": [
            "brand/company-context.md",
            "brand/positioning.md",
            "brand/voice-profile.md"
        ],
        "context_writes": [
            "content-ideas/",
            "brand/learnings.md"
        ]
    },
    "daily-pulse": {
        "context_required": [
            "brand/company-context.md",
            "brand/voice-profile.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "brand/transitory/daily-pulse/",
            "brand/learnings.md"
        ]
    },
    "decision-maker-finder": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/assets.md"
        ]
    },
    "deep-research": {
        "context_required": [
            "brand/company-context.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md"
        ]
    },
    "direct-response-copy": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "ecp-validation": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md",
            "brand/positioning.md"
        ],
        "context_writes": [
            "brand/ecps.md",
            "brand/learnings.md"
        ]
    },
    "email-sequences": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "existing-customer-data": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "brand/customer-data.md",
            "brand/learnings.md"
        ]
    },
    "foundation-orchestrator": {
        "context_required": [
            "brand/company-context.md",
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md",
            "brand/ecps.md",
            "brand/competitors.md",
            "brand/market.md",
            "brand/product-analysis.md",
            "brand/swot.md",
            "brand/business-model.md",
            "brand/budget.md",
            "brand/team.md",
            "brand/stack.md"
        ],
        "context_writes": [
            "brand/learnings.md"
        ]
    },
    "insight-to-content-mapper": {
        "context_required": [
            "brand/company-context.md",
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md",
            "brand/ecps.md",
            "brand/keyword-plan.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "keyword-research": {
        "context_required": [
            "brand/positioning.md",
            "brand/icp.md",
            "brand/competitors.md"
        ],
        "context_writes": [
            "brand/keyword-plan.md",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "last30days": {
        "context_required": [],
        "context_writes": []
    },
    "lead-magnet": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "market-intelligence": {
        "context_required": [
            "brand/company-context.md",
            "brand/competitors.md"
        ],
        "context_writes": [
            "brand/market.md",
            "brand/learnings.md"
        ]
    },
    "meeting-intelligence": {
        "context_required": [
            "brand/company-context.md"
        ],
        "context_writes": [
            "intelligence/",
            "brand/learnings.md"
        ]
    },
    "newsletter": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/icp.md",
            "brand/learnings.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "niche-discovery-100x": {
        "context_required": [
            "brand/company-context.md",
            "brand/product-analysis.md",
            "brand/competitors.md",
            "brand/swot.md",
            "brand/customer-data.md"
        ],
        "context_writes": [
            "brand/icp.md",
            "brand/ecps.md",
            "brand/learnings.md"
        ]
    },
    "outreach-sequence-builder": {
        "context_required": [
            "brand/channel-plan.md",
            "brand/positioning.md",
            "brand/ecps.md",
            "brand/voice-profile.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "pattern-detector": {
        "context_required": [
            "intelligence/"
        ],
        "context_writes": [
            "patterns/",
            "brand/learnings.md"
        ]
    },
    "phase-0-diagnostic": {
        "context_required": [
            "brand/company-context.md",
            "brand/stack.md"
        ],
        "context_writes": [
            "brand/learnings.md"
        ]
    },
    "positioning-messaging": {
        "context_required": [
            "brand/company-context.md",
            "brand/competitors.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "brand/positioning.md",
            "brand/learnings.md"
        ]
    },
    "pricing-strategy": {
        "context_required": [
            "brand/company-context.md",
            "brand/competitors.md",
            "brand/icp.md"
        ],
        "context_writes": [
            "brand/pricing.md",
            "brand/learnings.md"
        ]
    },
    "brand-check": {
        "context_required": [
            "brand/foundation-state.json",
            "brand/brand-book/brand-voice/brand-voice.current.md",
            "brand/go-to-market/positioning/shared/messaging-summary.md"
        ],
        "context_writes": [
            "brand/compliance/brand-check-{date}-{asset}.md"
        ]
    },
    "sancho-start": {
        "context_required": [
            "brand/company-context.md",
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md",
            "brand/ecps.md",
            "brand/competitors.md",
            "brand/market.md",
            "brand/product-analysis.md",
            "brand/swot.md",
            "brand/business-model.md",
            "brand/budget.md",
            "brand/stack.md",
            "brand/learnings.md",
            "brand/assets.md"
        ],
        "context_writes": [
            "brand/stack.md",
            "brand/learnings.md"
        ]
    },
    "sancho-visual": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/company-context.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/assets.md"
        ]
    },
    "self-intelligence": {
        "context_required": [
            "brand/company-context.md"
        ],
        "context_writes": [
            "brand/product-analysis.md",
            "brand/learnings.md"
        ]
    },
    "seo-content": {
        "context_required": [
            "brand/voice-profile.md",
            "brand/keyword-plan.md",
            "brand/icp.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "signal-definition": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md"
        ]
    },
    "signal-monitor": {
        "context_required": [
            "brand/company-context.md",
            "brand/icp.md",
            "brand/ecps.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md"
        ]
    },
    "swot-analysis": {
        "context_required": [
            "brand/product-analysis.md",
            "brand/competitors.md",
            "brand/market.md"
        ],
        "context_writes": [
            "brand/swot.md",
            "brand/learnings.md"
        ]
    },
    "thief-marketers": {
        "context_required": [
            "brand/competitors.md",
            "brand/voice-profile.md",
            "brand/positioning.md",
            "brand/icp.md"
        ],
        "context_writes": [
            "campaigns/",
            "brand/learnings.md",
            "brand/assets.md"
        ]
    },
    "visual-identity": {
        "context_required": [
            "brand/company-context.md",
            "brand/voice-profile.md",
            "brand/positioning.md"
        ],
        "context_writes": [
            "brand/assets.md",
            "brand/learnings.md"
        ]
    },
    "youtube-transcript": {
        "context_required": [],
        "context_writes": []
    }
}


def parse_frontmatter(content):
    """Parse YAML frontmatter from SKILL.md content."""
    if not content.startswith("---"):
        return None, content
    end = content.find("---", 3)
    if end == -1:
        return None, content
    fm_str = content[3:end].strip()
    body = content[end + 3:]
    try:
        fm = yaml.safe_load(fm_str)
    except yaml.YAMLError:
        fm = {}
    return fm, body


def serialize_frontmatter(fm, body):
    """Serialize frontmatter + body back to SKILL.md content."""
    fm_str = yaml.dump(fm, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return f"---\n{fm_str}---{body}"


def main():
    updated = 0
    skipped = 0
    errors = []

    for skill_name in sorted(os.listdir(SKILLS_DIR)):
        skill_path = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
        if not os.path.isfile(skill_path):
            continue

        if skill_name not in CONTEXT_MATRIX:
            errors.append(f"WARN: {skill_name} not in CONTEXT_MATRIX")
            continue

        with open(skill_path, "r") as f:
            content = f.read()

        fm, body = parse_frontmatter(content)
        if fm is None:
            errors.append(f"ERROR: {skill_name} has no frontmatter")
            continue

        matrix = CONTEXT_MATRIX[skill_name]
        fm["context_required"] = matrix["context_required"]
        fm["context_writes"] = matrix["context_writes"]

        new_content = serialize_frontmatter(fm, body)
        with open(skill_path, "w") as f:
            f.write(new_content)

        updated += 1
        print(f"✅ {skill_name}")

    print(f"\n{'='*40}")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    if errors:
        print(f"Issues:")
        for e in errors:
            print(f"  {e}")


if __name__ == "__main__":
    main()

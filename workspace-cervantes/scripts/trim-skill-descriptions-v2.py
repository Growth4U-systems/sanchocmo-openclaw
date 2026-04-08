#!/usr/bin/env python3
"""Trim workspace skill descriptions to ~80 chars max. One clean line."""

import os, re

SKILLS_DIR = os.path.expanduser("~/.openclaw/workspace-sancho/skills")

# Ultra-short descriptions (~80 chars max)
NEW_DESCRIPTIONS = {
    "brand-voice": "Define brand voice: tone, vocabulary, Do/Don't examples.",
    "budget-constraints": "Capture marketing budget, timeline, team capacity, tools.",
    "business-model-audit": "Classify business model, revenue type, and acquisition funnel.",
    "channel-prioritization": "Score and prioritize marketing channels for activation.",
    "comic-ui-system": "Comic book UI design system: halftone, panels, speech bubbles.",
    "company-context": "Capture what the company does, wants, and believes.",
    "company-finder": "Find companies matching ICP via Apollo, Clay, or LinkedIn.",
    "competitor-intelligence": "Research competitors: battle cards and landscape map.",
    "contact-enrichment": "Enrich contacts with verified emails, phones, socials.",
    "content-atomizer": "Repurpose one content piece into multi-platform assets.",
    "content-calendar-planner": "Plan editorial calendar: pillars, topics, cadence.",
    "content-miner": "Extract content ideas from meeting intelligence.",
    "daily-pulse": "Extract daily insights from Slack, Notion, transcripts.",
    "decision-maker-finder": "Find decision makers within target companies.",
    "deep-research": "Deep multi-source research with structured reports.",
    "direct-response-copy": "Write converting copy: landing pages, emails, ads.",
    "ecp-validation": "Validate Early Customer Profiles with experiments.",
    "email-sequences": "Build email sequences: welcome, nurture, conversion.",
    "existing-customer-data": "Analyze CRM data: segmentation, churn, best customers.",
    "foundation-orchestrator": "Manage Foundation pillars: status, dependencies, next steps.",
    "insight-to-content-mapper": "Convert insights into SEO-optimized content briefs.",
    "keyword-research": "Strategic keyword research and content pillar mapping.",
    "last30days": "Research topics and trends from the last 30 days.",
    "lead-magnet": "Create lead magnet concepts and build the full content.",
    "market-intelligence": "Analyze total market: TAM, segments, trends, regulations.",
    "meeting-intelligence": "Extract decisions, actions, and insights from meetings.",
    "newsletter": "Create and manage email newsletter strategy and content.",
    "niche-discovery-100x": "Discover and score niche segments using 100x methodology.",
    "outreach-sequence-builder": "Build cold outreach sequences: email, LinkedIn, phone.",
    "pattern-detector": "Detect cross-channel patterns from accumulated data.",
    "phase-0-diagnostic": "Score client readiness and route to the right phase.",
    "positioning-messaging": "Define positioning, differentiator, value prop, taglines.",
    "pricing-strategy": "Analyze and recommend pricing models and tiers.",
    "qa-bot": "Quality check content for brand voice and SEO compliance.",
    "sancho-start": "Entry point: diagnose client state, run Foundation, route to Phase.",
    "sancho-visual": "Generate visual assets and creative concepts for marketing.",
    "self-intelligence": "Analyze own brand perception across 3 lenses.",
    "seo-content": "Write SEO-optimized long-form content from briefs.",
    "signal-definition": "Define marketing signals and automation triggers.",
    "signal-monitor": "Monitor signals across channels and alert on triggers.",
    "swot-analysis": "SWOT analysis from internal data and competitor intel.",
    "thief-marketers": "Reverse-engineer competitor marketing: ads, funnels, spend.",
    "visual-identity": "Define visual identity: colors, typography, imagery style.",
    "youtube-transcript": "Extract and analyze YouTube video transcripts.",
}

def update_skill(skill_dir, new_desc):
    skill_file = os.path.join(skill_dir, "SKILL.md")
    if not os.path.exists(skill_file):
        return False
    
    with open(skill_file, 'r') as f:
        content = f.read()
    
    pattern = r'(description:\s*>?\s*\n?)(.+?)(\n[a-zA-Z_-]+:|\n---)'
    
    def replacer(m):
        return f'description: "{new_desc}"\n' + m.group(3).lstrip('\n')
    
    new_content = re.sub(pattern, replacer, content, count=1, flags=re.DOTALL)
    
    if new_content != content:
        with open(skill_file, 'w') as f:
            f.write(new_content)
        return True
    return False

updated = 0
for name, desc in sorted(NEW_DESCRIPTIONS.items()):
    skill_dir = os.path.join(SKILLS_DIR, name)
    if os.path.isdir(skill_dir):
        if update_skill(skill_dir, desc):
            updated += 1
            print(f"  ✓ {name} ({len(desc)}c): {desc}")

print(f"\nUpdated: {updated}/44")

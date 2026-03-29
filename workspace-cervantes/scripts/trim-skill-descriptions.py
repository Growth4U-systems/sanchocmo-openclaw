#!/usr/bin/env python3
"""Trim workspace skill descriptions to fit OpenClaw's skill token budget.
Keeps: what it does, key triggers, what NOT to confuse it with.
Target: ~120-200 chars per description."""

import os, re

OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))
SKILLS_DIR = os.path.join(OPENCLAW_HOME, "workspace-sancho", "skills")

# New concise descriptions (max ~200 chars each)
NEW_DESCRIPTIONS = {
    "brand-voice": "Define or extract brand voice: tone, vocabulary, Do/Don't examples, AI Brand Kit. Quick (30min) or Full mode. Use for 'brand voice', 'tone of voice', 'how should we sound'. Not for visual identity or ad copy.",
    "budget-constraints": "Capture client marketing budget, timeline, team capacity, and tool stack. Foundation Layer 0 pillar. Use for 'budget', 'resources', 'team capacity'. Not for pricing strategy or channel budget splits.",
    "business-model-audit": "Classify business model (B2B/B2C, revenue, growth motion) and map acquisition funnel. Foundation Layer 1 pillar, depends on company-context. Use for 'business model', 'revenue model', 'growth model'.",
    "channel-prioritization": "Score and prioritize marketing channels using Hormozi Core Four + Maja Voje GTM. Outputs 2-4 channel mix with budget allocation. Use after Foundation. Not for content calendar or outreach sequences.",
    "comic-ui-system": "Design system for comic book interfaces: halftone, speech bubbles, panel layouts, vintage print + modern interactions. 7 React/Tailwind components + design tokens. Use for marketing pages and landing pages.",
    "company-context": "Capture foundational company context: what they do, want, and believe. Foundation Layer 0 pillar. Use for 'company profile', 'tell me about the company'. Not for competitors or market research.",
    "company-finder": "Find companies matching ICP via Apollo/Clay/LinkedIn. Filters by industry, size, geography, tech stack. Scores ICP fit 1-10. Use for 'find companies', 'prospect list'. Not for finding people (use decision-maker-finder).",
    "competitor-intelligence": "Research competitors using 3-lens methodology. Produces Battle Cards + Competitive Landscape Map. Foundation Layer 2. Use for 'competitor analysis', 'battle card'. Not for own brand (use self-intelligence).",
    "contact-enrichment": "Enrich contacts with verified emails, phones, social profiles via waterfall (Apollo→Hunter→SignalHire→Snov). Final step before outreach. Use after decision-maker-finder. Not for finding companies or people.",
    "content-atomizer": "Transform one content piece into platform-optimized assets (LinkedIn, X, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit). Use for 'repurpose', 'atomize', 'social posts from this'. Reads brand voice.",
    "content-calendar-planner": "Plan editorial calendar: pillars, topics, formats, cadence. Maps content to funnel stages. Use after channel selection. Not for writing content (use seo-content) or channel selection.",
    "content-miner": "Classify meeting intelligence into content ideas. Detects 7 signal types, generates micro-briefs. Use after meeting-intelligence. Not for outreach ideas or pattern detection.",
    "daily-pulse": "Extract insights from daily comms (Slack, Notion, transcripts). Classifies pain points, feature requests, success stories, trends. Use for 'daily pulse', 'content ideas from slack'. Extracts ideas, doesn't execute.",
    "decision-maker-finder": "Find decision makers within target companies. Validates LinkedIn profiles, scores by decision power. Use after company-finder. Not for finding companies or getting emails (use contact-enrichment).",
    "deep-research": "Multi-source deep research with structured analysis and QA verification. Produces sourced reports with executive summaries. Use for 'deep research', 'market analysis', 'benchmark'. Not for quick lookups.",
    "direct-response-copy": "Write converting copy: landing pages, emails, sales, headlines, CTAs. Multiple variants, 7-dimension scoring, A/B suggestions. Use for 'write copy', 'landing page', 'make this convert'. Reads brand voice.",
    "ecp-validation": "OPTIONAL. Validate Early Customer Profiles via Maja Voje's Assumption Mapping + MVI + 7-Day Framework. Design experiments to test ECPs. Skip if timeline is short. Use for 'validate ECPs', 'test assumptions'.",
    "email-sequences": "Build email sequences: welcome, nurture, conversion, launch, re-engagement. Subject line A/B variants, timing, full copy. Use for 'email sequence', 'welcome series', 'drip campaign'. Reads brand voice.",
    "existing-customer-data": "OPTIONAL. Analyze CRM data for segmentation, churn, best customer profile. RFM analysis, behavioral clustering, LTV. Use when client has >50 customers. Use for 'analyze customers', 'CRM segmentation'.",
    "foundation-orchestrator": "Manage 16 Foundation pillars: track status, resolve dependencies, suggest next pillar. Use for 'foundation status', 'what pillar next'. Not for executing individual pillars.",
    "insight-to-content-mapper": "Convert insights into SEO-optimized content briefs. Keyword research, SERP analysis, differentiated angle. Use after daily-pulse. Not for writing content (use seo-content).",
    "keyword-research": "Strategic keyword research using 6 Circles Method. Validates with live SERP, clusters into pillars, maps to content plan. Use for 'keyword research', 'content strategy', 'what should I write about'.",
    "last30days": "Research topics, manage watchlists, get briefings, query history. Also triggered by 'last30'. Sources: Reddit, X, YouTube, web.",
    "lead-magnet": "Generate lead magnet concepts AND build full content (checklists, templates, guides). Researches competitor magnets. Use for 'lead magnet', 'grow email list', 'what freebie'. Chains to direct-response-copy + email-sequences.",
    "market-intelligence": "Analyze total market via Gemini Deep Research: TAM, segments, maturity, regulatory landscape, competitive overview. Foundation Layer 2. Use for 'market analysis', 'TAM', 'market trends'. Not for SAM/SOM (use niche-discovery).",
    "meeting-intelligence": "Extract structured intelligence from meetings: decisions, action items, insights, quotes, risks. Saves to Context Lake. Use for 'analyze meetings', 'what was decided'. Not for content ideas (use content-miner).",
    "newsletter": "Create and manage email newsletters. Strategy, content, templates, growth tactics. Use for 'newsletter', 'email newsletter', 'newsletter strategy'. Reads brand voice and positioning.",
    "niche-discovery-100x": "Discover and score niche segments using 100x Niche methodology. Calculates SAM/SOM per ECP. Foundation Layer 2. Use for 'niche discovery', 'find our niche', 'segment scoring'. Depends on market-intelligence.",
    "outreach-sequence-builder": "Build multi-channel outreach sequences (email + LinkedIn + phone). Personalization, timing, follow-ups. Use after contact-enrichment. Not for content (use content-atomizer) or finding contacts.",
    "pattern-detector": "Detect cross-channel patterns from accumulated intelligence. Identifies recurring themes, anomalies, correlations. Use for 'find patterns', 'what trends'. Not for single-meeting analysis (use meeting-intelligence).",
    "phase-0-diagnostic": "Phase 0 entry diagnostic: score client readiness across dimensions, determine Foundation Lite vs Deep, route to Phase 1. Use at start of engagement or when user says 'diagnostic', 'readiness check'.",
    "positioning-messaging": "Define market positioning and core messaging: category, differentiator, value prop, taglines, elevator pitch. Foundation Layer 2. Use for 'positioning', 'messaging', 'how do we differentiate'.",
    "pricing-strategy": "Analyze and recommend pricing strategy: models, tiers, anchoring, psychological pricing. Use for 'pricing', 'how much should we charge', 'pricing model'. Foundation optional pillar.",
    "prospecting": "Prospect research and outreach planning. Use for 'prospect', 'find leads', 'outreach plan'. Coordinates company-finder → decision-maker-finder → contact-enrichment pipeline.",
    "qa-bot": "Quality assurance bot for content review. Checks brand voice compliance, messaging consistency, SEO optimization. Use for 'review this', 'check quality', 'QA this content'.",
    "sancho-start": "Universal entry point — CBO maestro. Diagnoses client state, runs Foundation Blitz (30min), Viability Checkpoint, routes to correct Phase (0-3). Use for 'empezar', 'nuevo cliente', 'status', 'dónde estamos', or session start.",
    "sancho-visual": "Generate visual assets and creative concepts for marketing. Use for 'create visual', 'design this', 'make an image for'. Coordinates with brand voice and visual identity.",
    "self-intelligence": "Analyze own brand using 3-lens methodology (Autopercepción, Terceros, Consumidor). Foundation Layer 1. Use for 'brand analysis', 'how do others see us'. Not for competitors (use competitor-intelligence).",
    "seo-content": "Write SEO-optimized long-form content from briefs. Research, outline, write, optimize. Use for 'write article', 'blog post', 'SEO content'. Reads keyword plan and brand voice.",
    "signal-definition": "Define marketing signals and triggers for automation. Maps customer actions to marketing responses. Use for 'define signals', 'trigger mapping', 'marketing automation rules'.",
    "signal-monitor": "Monitor defined signals across channels. Alerts on trigger conditions, tracks signal frequency and patterns. Use for 'monitor signals', 'check triggers', 'signal status'.",
    "swot-analysis": "SWOT analysis combining internal assessment with competitive intelligence. Foundation Layer 2. Use for 'SWOT', 'strengths weaknesses', 'strategic analysis'. Reads company-context + competitors.",
    "thief-marketers": "Reverse-engineer competitor marketing strategies: ads, funnels, content, channels, spend estimates. Use for 'spy on competitors marketing', 'what ads are they running', 'reverse engineer funnel'.",
    "visual-identity": "Define or audit visual identity: colors, typography, imagery style, logo usage, design principles. Use for 'visual identity', 'brand colors', 'design system'. Not for brand voice (use brand-voice).",
    "youtube-transcript": "Extract and analyze YouTube video transcripts. Use for 'transcript', 'analyze video', 'what did they say in this video'.",
}

def update_skill(skill_dir, new_desc):
    skill_file = os.path.join(skill_dir, "SKILL.md")
    if not os.path.exists(skill_file):
        return False
    
    with open(skill_file, 'r') as f:
        content = f.read()
    
    # Match description field in frontmatter (handles both inline and multiline >)
    # Pattern: description: followed by content until next frontmatter key or ---
    pattern = r'(description:\s*>?\s*\n?)(.+?)(\n[a-zA-Z_-]+:|\n---)'
    
    def replacer(m):
        return f'description: >\n  {new_desc}\n' + m.group(3).lstrip('\n')
    
    new_content = re.sub(pattern, replacer, content, count=1, flags=re.DOTALL)
    
    if new_content != content:
        with open(skill_file, 'w') as f:
            f.write(new_content)
        return True
    return False

updated = 0
skipped = []
for name, desc in NEW_DESCRIPTIONS.items():
    skill_dir = os.path.join(SKILLS_DIR, name)
    if os.path.isdir(skill_dir):
        if update_skill(skill_dir, desc):
            updated += 1
            print(f"  ✓ {name} ({len(desc)} chars)")
        else:
            skipped.append(f"{name} (regex failed)")
    else:
        skipped.append(f"{name} (not found)")

print(f"\nUpdated: {updated}")
if skipped:
    print(f"Skipped: {', '.join(skipped)}")

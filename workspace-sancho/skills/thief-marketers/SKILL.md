---
name: thief-marketers
description: "Reverse-engineer competitor marketing strategies and steal what works. Monitors competitor channels (web, social, ads, newsletters, content) to identify winning tactics, content themes, and campaign patterns. Generates actionable content ideas adapted to client's brand. Weekly cron recommended."
context_required:
- brand/{slug}/market-and-us/competitor-*.md
- brand/{slug}/company-brief/current.md
- brand/{slug}/brand-identity/voice-profile.md
- brand/{slug}/go-to-market/ecps.md
context_writes:
- brand/{slug}/operational/content-ideas.json
- brand/{slug}/operational/learnings.md
---

# Thief Marketers — Competitor Marketing Intelligence

> Don't reinvent. Reverse-engineer what's already working, adapt it, and make it better.

Read ./brand/ per `_system/brand-memory.md`

---

## Core Job

For each competitor in `market-and-us/competitor-*.md`:
1. Scrape their latest marketing activity
2. Identify what's working (engagement signals)
3. Generate content ideas adapted to OUR brand voice and positioning

---

## Workflow (6 Steps)

### Step 1: Load Competitor List
Read all `competitor-*.md` files. Extract: name, website, social profiles, known campaigns.

### Step 2: Scrape Recent Activity (per competitor)
- **Website**: web_fetch homepage + blog (detect new content, copy changes, pricing changes)
- **LinkedIn**: web_search for recent posts + engagement
- **Instagram/YouTube**: web_search for latest content
- **Google Ads Library**: check active ads
- **Newsletter**: if subscribed, review recent emails
- See `references/apify-actors-guide.md` for Apify actor recipes

### Step 3: Analyze Each Channel
For each piece of content found:
- Engagement level (likes, comments, shares)
- Content type and format
- Hook/headline pattern
- CTA strategy
- What made it work?

### Step 4: Cross-Platform Synthesis
Compare patterns across competitors. See `references/workflow.md` for synthesis framework.

### Step 5: Generate Content Ideas
For each winning pattern → adapted idea for OUR brand:
- Same format, different angle (our positioning)
- Our voice profile applied
- Our ECP targeting
- Improvement opportunity (what they missed)

### Step 6: Present & Store
- Present top 5-10 ideas to user with source attribution
- Save to `brand/{slug}/operational/content-ideas.json`
- Update `brand/{slug}/operational/learnings.md` with patterns

---

## Ethical Boundaries

- ✅ Analyze public content and strategy patterns
- ✅ Adapt formats and angles to our brand
- ❌ Copy text verbatim
- ❌ Impersonate competitors
- ❌ Access private/gated content without permission

---

## References

| File | Content |
|------|---------|
| `references/apify-actors-guide.md` | Apify actors for each platform |
| `references/workflow.md` | Detailed steps 4-6, synthesis framework, output format |
| `references/integration.md` | Prerequisites, tools, SanchoCMO integration, frequency |

---

## Frequency

- **Recommended**: Weekly cron (Wednesday AM)
- **Compare**: with last run to detect changes
- **Alert**: if competitor launches new campaign or changes pricing

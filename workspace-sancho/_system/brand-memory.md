# Brand Memory Protocol — SanchoCMO

> Shared infrastructure for SanchoCMO Skills.
> Every skill references this file to understand how to read and write persistent brand context.

**Version:** 2.0 (Feb 20, 2026)
**Adapted from:** vibe Marketer v2 brand-memory.md
**For:** SanchoCMO (Marketing Director for empresas tech)

---

## Overview

Brand memory is the system that lets every SanchoCMO skill remember:
- Who the client is (company, product, team)
- What their brand sounds like (voice, positioning)
- Who they sell to (ICP, ECPs)
- What competitors do
- What has worked before (learnings)

It lives in a `./brand/` directory at the project root and **accumulates over time** as skills run.

Skills reference this file with:
```markdown
Read ./brand/ per _system/brand-memory.md
```

That single line means: "Before I start, load relevant brand context using the protocol defined here."

---

## The ./brand/ Directory

### Constitution Files (rarely change, foundational)

```
./brand/
  company-context.md      <- /company-context owns
  voice-profile.md        <- /brand-voice owns
  positioning.md          <- /positioning-messaging owns
  icp.md                  <- /niche-discovery-100x owns
  ecps.md                 <- /niche-discovery-100x owns
```

### Strategic Files (quarterly/monthly updates)

```
  competitors.md          <- /competitor-intelligence owns
  market.md               <- /market-intelligence owns
  product-analysis.md     <- /self-intelligence owns
  swot.md                 <- /swot-analysis owns
  pricing.md              <- /pricing-strategy owns (future)
  business-model.md       <- /business-model-audit owns
  team.md                 <- /company-context owns
  budget.md               <- /budget-constraints owns
  customer-data.md        <- /customer-data owns (future)
  keyword-plan.md         <- /keyword-research owns (vibe v2)
  channel-plan.md         <- /channel-prioritization owns (Sprint 1)
  content-calendar.md     <- /content-calendar-planner owns (Sprint 1)
```

### Operational Files (continuous updates)

```
  assets.md               <- All skills append (NEVER truncate)
  learnings.md            <- All skills append (NEVER truncate)
  stack.md                <- /sancho-start writes (tools, APIs, MCP servers)
```

### Transitory (subdirectory)

```
  transitory/
    meeting-notes/        <- Daily Pulse reads
    daily-pulse/          <- Auto-updated
```

---

## File Ownership

Each profile file has a **primary owner** — the skill that creates and maintains it. Other skills may read ANY file but should NEVER overwrite a file they don't own.

### Ownership Table

| File | Owner | Others Can |
|------|-------|-----------|
| company-context.md | company-context | Read only |
| voice-profile.md | brand-voice | Read only |
| positioning.md | positioning-messaging | Read only |
| icp.md, ecps.md | niche-discovery-100x | Read only |
| competitors.md | competitor-intelligence | Read only |
| market.md | market-intelligence | Read only |
| product-analysis.md | self-intelligence | Read only |
| swot.md | swot-analysis | Read only |
| business-model.md | business-model-audit | Read only |
| team.md | company-context | Read only |
| budget.md | budget-constraints | Read only |
| assets.md | ALL skills | Append (never truncate) |
| learnings.md | ALL skills | Append (never truncate) |
| stack.md | sancho-start | Update on tool detection |
| channel-plan.md | channel-prioritization | Read only |
| content-calendar.md | content-calendar-planner | Read only |

---

## File Categories

**Profile files** (create-or-overwrite): Constitution + Strategic files
- Represent current state of a brand dimension
- When owner skill runs, produces new version
- Other skills: read-only

**Append-only files** (NEVER overwrite): `assets.md`, `learnings.md`
- Accumulate entries over time
- Every skill may append
- No skill should truncate or replace contents

**Transitory files**: meeting-notes/, daily-pulse/
- Ephemeral data
- Daily Pulse reads these
- Can be promoted to Strategic files when patterns emerge

---

## Promotion Rules (Tier System)

Brand data flows UP through tiers as it's validated:

```
Transitory (meeting notes, daily pulse)
     ↓ (3+ occurrences of same insight)
Strategic (competitors, market, swot)
     ↓ (confirmed as foundational truth)
Constitution (company-context, positioning, voice, ICP/ECPs)
```

**Rule:**
- Transitory insight appears 3+ times → Update Strategic file
- Strategic insight validated by data → Update Constitution file

**Example:**
```
Meeting Note (Transitory):
"In 3 calls this week, explaining product as 'The Trust Engine for Fintech' resonated"

↓ After 3 occurrences

Update Strategic (positioning.md):
Add "Trust Engine" as tested angle

↓ After market validation (6 months, data confirms)

Update Constitution (company-context.md):
"Trust Engine" becomes core positioning
```

---

## How Skills READ Brand Memory

### 1. Check for Directory

On every skill invocation, check whether `./brand/` exists.

- **If exists**: proceed to step 2
- **If not exists**: skip brand loading entirely. Do NOT error. Proceed as first-time user with note: "I don't see brand memory yet. Run /sancho-start first, or I'll work without it."

### 2. Load Only What You Need (Context Matrix)

Each skill declares dependencies. Do NOT read every file on every invocation.

**Context Matrix:**

| Skill | Reads from ./brand/ | WHY |
|-------|---------------------|-----|
| company-context | (none) | First skill |
| self-intelligence | company-context.md | Needs basics for product analysis |
| competitor-intelligence | company-context.md, positioning.md (if exists) | Needs industry + differentiation |
| market-intelligence | company-context.md, competitors.md | Needs basics + competitive landscape |
| swot-analysis | product-analysis.md, competitors.md, market.md | Synthesis of 3 inputs |
| niche-discovery-100x | swot.md, customer-data.md (if exists) | Needs strategic fit + real customer insights |
| positioning-messaging | company-context.md, competitors.md, icp.md/ecps.md | Needs who we are, who we compete with, who we serve |
| brand-voice | company-context.md, positioning.md | Needs identity + angle for tone |
| budget-constraints | company-context.md | Needs business context |
| business-model-audit | company-context.md, competitors.md | Needs basics + competitive revenue models |
| keyword-research | positioning.md, icp.md, competitors.md | Needs angle + audience + competitive keywords |
| seo-content | voice-profile.md, keyword-plan.md, icp.md | Needs tone + topics + who we write for |
| email-sequences | voice-profile.md, positioning.md, lead-magnet (campaign) | Needs tone + angle + what we deliver |
| content-atomizer | voice-profile.md, creative-kit.md (if exists) | Needs tone + visual direction |
| lead-magnet | voice-profile.md, positioning.md, icp.md | Needs tone + angle + audience pain |
| direct-response-copy | voice-profile.md, positioning.md, icp.md, creative-kit.md | Needs tone + angle + audience + visuals |
| newsletter | voice-profile.md, icp.md, learnings.md | Needs tone + audience + what's worked |
| channel-prioritization | budget.md, company-context.md, ecps.md, positioning.md, competitors.md, product-analysis.md, stack.md | Needs full context to score channels |
| content-calendar-planner | channel-plan.md, positioning.md, keyword-plan.md, voice-profile.md, ecps.md | Needs channels + topics + voice |
| outreach-sequence-builder | channel-plan.md, positioning.md, ecps.md, voice-profile.md, contacts-enriched.json, signals-to-track.json | Needs channels + audience + signals |

**Orchestrators read everything:**
| sancho-start | ALL brand files, stack.md, campaigns/ | Needs full picture for routing |
| foundation-orchestrator | ALL Constitution + Strategic (for coverage map) | Manages 16-pillar DAG |

### 3. Handle Missing Files Gracefully

If a file your skill wants doesn't exist, do NOT error.

**Instead:**
- Note internally what's missing
- Consolidate: "Brand profile partial (loaded voice-profile.md; positioning not yet created)"
- Ask questions that file would have answered, OR proceed with defaults
- At end, suggest: "Running /positioning-messaging would sharpen this output (~2 hours)"

### 4. Use Loaded Context Visibly

Show the user you're using brand context. Do NOT silently absorb.

**Examples:**
- "I see your brand voice is conversational-but-sharp. Using that."
- "Your positioning is 'Trust Engine' — I'll build this around that angle."
- "I found 3 competitor profiles. I'll differentiate against them."
- "Learnings show fintech audiences respond to trust signals over features. Noted."

**Why:** Builds trust. Lets user correct stale data.

### 5. Detect Stale or Conflicting Data

If file content seems outdated or conflicts with session context:

- Flag it: "Your voice profile says avoid humor, but the brief you gave is playful. Want me to update voice profile?"
- Do NOT silently override brand memory with session context
- Always confirm

**Freshness TTLs:**
```
< 7 days   → Pass as-is (fresh data)
7-30 days  → Flag age: "This data is from {date}. Still current?"
30-90 days → Summary only + flag: "{n} days old. Verify if used in output."
> 90 days  → DON'T load → "Your {file} is {n} days old (stale). Refresh first."
```

---

## How Skills WRITE to Brand Memory

### Profile Files (create-or-overwrite)

Represent latest state of a brand dimension.

**Creating new file:**
1. Generate content through skill workflow
2. Write to `./brand/{filename}.md`
3. Confirm: "Created {filename}.md at ./brand/"

**Overwriting existing file:**
1. Read existing file FIRST
2. Show diff: "Current positioning: 'speed.' New: 'simplicity.' Key changes: [list]"
3. Ask confirmation: "Replace existing file? (y/n)"
4. Only overwrite after explicit confirmation
5. Confirm: "Updated {filename}.md. Changes: {summary}"

### Append-Only Files (assets.md, learnings.md)

**NEVER overwrite. ALWAYS append.**

1. Read existing file (understand current entries)
2. Append new entries at bottom of appropriate section
3. Confirm: "Added {n} entries to {filename}.md"

If file doesn't exist, create with standard template, then add entries.

### Writing Conventions

- Always include `## Last Updated` line at top of profile files (date + skill name)
- Use consistent markdown formatting
- Keep files human-readable (marketer can open and understand without running skill)
- Reference schemas in `_system/schemas/` for structured data

---

## 3 Lenses Methodology Protocol

SanchoCMO uses 3 Lenses for analyzing any entity (competitor, self, market):

| Lens | What It Captures | Source |
|------|-----------------|--------|
| **Lens 1** | What they say about themselves | Homepage, product pages, social, ads |
| **Lens 2** | What others say about them | Influencers, reviewers, journalists, articles |
| **Lens 3** | What customers say (reviews) | Trustpilot, App Store, G2, Capterra |

**Conflict Resolution Hierarchy:**
Lens 3 (highest) > Lens 2 > Lens 1 (lowest)

**Principle:** Behavior beats opinions beats marketing copy.

**In brand files:**
Skills writing competitor analysis, self-intelligence, or market research MUST structure output by Lens:

```markdown
## Lens 1: What They Say (Marketing Copy)
...

## Lens 2: What Others Say (Press/Influencers)
...

## Lens 3: What Customers Say (Reviews)
...

## Synthesis (Hierarchy: Lens 3 > 2 > 1)
...
```

---

## GTM Canvas Integration

SanchoCMO is built on Maja Voje's GTM Canvas. Brand files map to Canvas elements:

| Canvas Element | Brand File | Owner Skill |
|---------------|------------|-------------|
| Market | market.md | market-intelligence |
| Customer | icp.md, ecps.md | niche-discovery-100x |
| Product | company-context.md, product-analysis.md | company-context, self-intelligence |
| Pricing | pricing.md | pricing-strategy |
| Positioning | positioning.md | positioning-messaging |
| Growth (motions) | (campaigns/) | Phase 2/3 skills |

**When creating/updating brand files:**
- Reference GTM Canvas element
- Ensure consistency across Canvas
- Flag gaps: "Product element complete, but Pricing missing"

---

## Trust Engine Protocol (Casos de Éxito)

SanchoCMO's unique methodology: casos de éxito as systematic social proof.

**When creating caso de éxito:**

1. Output goes to: `./campaigns/{client-caso}/caso-de-exito.md`
2. Append to assets.md:
   ```
   | caso-{client} | caso-de-exito | {date} | trust-engine | live | Oier Method Framework 5 |
   ```
3. Reference in positioning.md (social proof section)
4. Available to all execution skills (email-sequences, landing-pages, etc.)

**Caso structure (Oier Method):**
- Problem (before state)
- Solution (what we did)
- Results (metrics, timeframe)
- Proof (screenshots, data)

---

## Campaign Directory Structure

Campaigns are **distinct** from brand memory.
- Brand memory = persistent context about the brand
- Campaigns = time-bound projects that reference brand memory

```
./campaigns/
  {campaign-name}/
    brief.md              <- Goal, angle, audience, timeline, channels, status
    emails/               <- Email files (if applicable)
      01-delivery.md
      02-quick-win.md
      ...
    social/               <- Platform-specific content
      linkedin/
      twitter/
      instagram/
    ads/                  <- Ad creative briefs
    landing-page.md       <- LP copy (if applicable)
    caso-de-exito.md      <- Trust Engine (if applicable)
    results.md            <- Performance data
```

### Campaign Naming

lowercase-kebab-case: `monzo-launch-2026`, `criptan-activation-q1`, `trust-engine-monzo`

### Campaign Brief Format

Every campaign has `brief.md`. See `_system/schemas/campaign.schema.json`.

```markdown
# Campaign: {Name}

## Goal
{Measurable outcome, with number if possible}

## Angle
{Positioning angle used — reference ./brand/positioning.md}

## Audience Segment
{ICP or ECP targeted — reference ./brand/icp.md or ecps.md}

## Timeline
{Start date - End date}

## Channels
{Core Four: Contenido Orgánico | Outreach Directo | Partners | Paid Ads}

## Status
{planning | active | complete}

## Voice Notes
{Campaign-specific voice adjustments from ./brand/voice-profile.md}

## GTM Canvas Alignment
{Which Canvas elements this activates: Market/Customer/Product/Pricing/Positioning/Growth}
```

### Cross-Referencing

Skills creating campaign assets:
1. Create asset in campaign directory
2. Append entry to `./brand/assets.md` with path
3. Reference campaign brief for context

---

## Assets Registry Format

File: `./brand/assets.md`

```markdown
# Asset Registry

> Auto-maintained by SanchoCMO Skills. Do not manually reorder.
> New entries appended at bottom of Active Assets table.

## Active Assets

| Asset | Type | Created | Campaign | Status | Notes |
|-------|------|---------|----------|--------|-------|
| monzo-welcome-sequence | Email (6-part) | 2026-02-15 | monzo-launch | live | Trust Engine angle |
| caso-bit2me | caso-de-exito | 2026-02-19 | trust-engine | live | Oier Method F5, 53 screenshots |
| monzo-lp-trust | landing-page | 2026-02-18 | monzo-launch | draft | Needs review |

## Retired Assets

| Asset | Type | Retired | Reason |
|-------|------|---------|--------|
```

### Appending Rules

- New rows at bottom of **Active Assets** table
- Status: `draft` on creation. User updates to `live` or `retired`.
- When retired, move row to Retired table with reason

---

## Learnings Journal Format

File: `./brand/learnings.md`

```markdown
# Learnings Journal

> Auto-maintained by SanchoCMO Skills. Newest entries at bottom of each section.
> Skills append after deliverable feedback. NEVER delete entries.

## What Works

- [2026-02-15] [/email-sequences] Subject lines with numbers outperform questions (fintech audience)
- [2026-02-18] [/positioning-messaging] "Trust Engine" angle resonates (3 client calls confirmed)
- [2026-02-19] [/caso-de-exito] Oier Method Framework 5 with screenshots >> text-only

## What Doesn't Work

- [2026-02-16] [/content-atomizer] LinkedIn posts < 100 words get low engagement (need 150-200)
- [2026-02-17] [/direct-response-copy] Feature-heavy copy underperforms benefit-focused

## Audience Insights (ECPs)

- [2026-02-18] [/niche-discovery-100x] ECP "Fintech B2C" responds to trust signals over innovation claims
- [2026-02-19] [/customer-data] Churn happens at 90 days if no activation → focus onboarding

## Competitor Intelligence

- [2026-02-17] [/competitor-intelligence] Revolut shifted messaging from "fast" to "secure" (Q4 2025)
- [2026-02-18] [/competitor-intelligence] N26 launched Trust Hub page (copy their structure)
```

### Appending Rules

- Always include date: `[YYYY-MM-DD]`
- Always include skill: `[/skill-name]`
- Specific, actionable observations (NOT "emails worked well" but "subject lines under 40 chars had 15% higher opens")
- Append to correct section. If unsure → **Audience Insights**

---

## Self-Reported Feedback Collection

After major deliverable, collect feedback. **This is how the system learns.**

### Feedback Prompt

Present after final output:

```
How did this perform?

a) Great — shipped as-is
b) Good — made minor edits
c) Rewrote significantly
d) Haven't used yet

(You can answer later — run this skill again and tell me.)
```

### Processing Feedback

**If (a) "Great":**
- Log to learnings.md under "What Works" with specifics
- Example: `- [2026-02-20] [/email-sequences] 6-part welcome sequence shipped as-is. Angle: Trust Engine. Tone: direct, proof-heavy.`

**If (b) "Good — minor edits":**
- Ask: "What did you change? Even small details help me improve."
- Log to learnings.md
- If reveals voice/tone issue, suggest updating voice-profile.md
- Example: `- [2026-02-20] [/email-sequences] User softened CTA in emails 4-6. Note: default CTAs may be too aggressive for fintech B2C.`

**If (c) "Rewrote significantly":**
- Ask: "Can you share what you changed or paste final version? I'll learn from diff."
- If shared, analyze differences and log specific findings
- If pattern emerges (voice consistently wrong), suggest re-running /brand-voice
- Example: `- [2026-02-20] [/email-sequences] User rewrote — shifted educational to story-driven. Voice profile may need update.`

**If (d) "Haven't used yet":**
- Note it. Do NOT log to learnings.md yet.
- Next time skill runs: "Last time I created welcome sequence. Did you ship it? I'd love to know how it went."

---

## Stack File Format

File: `./brand/stack.md`

```markdown
# Marketing Stack

> Written by /sancho-start. Updated when new tools connected.

## Connected Tools

| Tool | Type | Status | Config |
|------|------|--------|--------|
| Nanobanana | Image gen (OpenRouter) | connected | OPENROUTER_API_KEY in .env |
| Metricool | Social scheduling | connected | Account linked |
| Instantly.ai | Cold email outreach | connected | API key in .env |
| Google Analytics 4 | Analytics | connected | Measurement ID in .env |

## MCP Servers

| Server | Tools Available | Status |
|--------|----------------|--------|
| stealth-browser | Browser automation, anti-bot | running |
| google-workspace | Gmail, Drive, Docs, Sheets | running |
| notion | Workspace integration | running |

## Not Connected (Recommended)

| Tool | Why | Setup |
|------|-----|-------|
| Clay | Contact enrichment for outreach | Add API key to .env |
| Remotion | Video generation | Install + configure |
```

### Tool Detection Chain

Every skill that can use external tools follows this order:

1. **Check for MCP server**: Query available MCP tools. If relevant server running (e.g., stealth-browser for scraping), use MCP directly.
2. **No MCP? Check API key**: Look in `.env` for API key. If found, make direct API calls.
3. **No API key? Output compatible files**: Generate output user can manually import.
4. **Don't know tools? Ask and guide**: "What email tool do you use? I can output compatible format or help connect it."

After resolving tool, update `./brand/stack.md` if not listed.

---

## Research Quality Signal

Skills depending on external data (competitor analysis, SERP, keyword volumes, trending topics) MUST declare research mode at output start.

**User should always know:** Live data or conceptual analysis?

### Research-Dependent Skills

- /keyword-research — SERP analysis, keyword volumes, competitor rankings
- /seo-content — SERP gap analysis, People Also Ask, competitor content
- /positioning-messaging — Competitive landscape, market positioning (if doing competitor search)
- /newsletter — Trending topics, curated links, news briefing
- /competitor-intelligence — Competitor teardowns (all 3 Lenses)
- /market-intelligence — TAM/SAM/SOM, sector trends, regulatory landscape
- /self-intelligence — Review platforms, app stores (Lens 3)

### Research Mode Display

Show after header, before content:

**When web search/MCP available:**
```
RESEARCH MODE
├── Web search      ✓ connected
├── Sources accessed:
│   ├── google.com/search?q=...
│   ├── trustpilot.com/review/...
│   └── [5 more sources]
└── Data quality: LIVE
```

**When NO research tools:**
```
RESEARCH MODE
├── Web search      ✗ not available
├── Data quality: ESTIMATED
│   Using conceptual analysis based on brand
│   context and training data. Results are
│   directional, not verified.
└── To upgrade:
    → Connect web search MCP server
    → Or proceed — I'll flag estimates clearly
```

### Rules

1. Always show research signal (never silently fall back to conceptual)
2. When using conceptual data, flag specific claims: "~2,400 monthly searches (estimated, verify with live SERP)"
3. Ask before proceeding with estimates: "I don't have web search. I can give conceptual analysis, but live data would be more accurate. Proceed or set up web search first?"
4. Prefix estimates with `~`: `~2,400 monthly searches` vs `2,400 monthly searches`

---

## Voice Injection Protocol

When `./brand/voice-profile.md` exists and loaded, skill output should **DEMONSTRATE** brand voice, not just acknowledge it.

### Wrong vs Right

**❌ Wrong — acknowledging:**
```
I see your brand voice is confident and direct.
Here are your positioning angles:
[generic-sounding output]
```

**✅ Right — demonstrating:**
```
Loading voice profile... confident, direct, zero fluff.

[output written IN that voice — short sentences,
specific numbers, no hedging, brand vocabulary]
```

### Rules

1. Voice says "short sentences" → use short sentences in output
2. Brand avoids certain words → don't use those words ANYWHERE
3. Opening acknowledgment uses brand's own vocabulary and pacing
4. Applies to ALL sections (not just copy — even analysis and recommendations)

---

## Schema References

Structured schemas for validation and interoperability: `_system/schemas/`

**SanchoCMO Schemas:**
- `company-context.schema.json` — Company basics (what/want/believe)
- `icp.schema.json` — Ideal Customer Profile structure
- `positioning.schema.json` — Positioning angles, proof points
- `competitors.schema.json` — Competitor profiles (3 Lenses)
- `swot.schema.json` — SWOT + TOWS strategies
- `gtm-canvas.schema.json` — Complete GTM Canvas state
- `campaign.schema.json` — Campaign brief structure

**vibe v2 Schemas (inherited):**
- `voice-profile.schema.json` — Voice profile data
- `keyword-plan.schema.json` — Keyword clusters, priorities
- `email-sequence-summary.schema.json` — Email metadata
- `content-brief.schema.json` — Content briefs

Skills may use schemas to:
- Validate output
- Generate structured JSON alongside markdown
- Enable skill-to-skill data flow (Pillar 3)

---

## Principles

### 1. Human-Readable First

Every file in `./brand/` must make sense to a marketer reading it in text editor. Structured data (JSON) is secondary.

### 2. Graceful Degradation

No skill should break because brand file missing. System works day one with zero context and gets better over time.

### 3. Visible Context Use

Always show user what brand context you loaded and how it shaped output. Never silently absorb.

### 4. Append, Don't Destroy

Learnings and assets accumulate. Profile files versioned by overwrite-with-confirmation. Nothing silently deleted.

### 5. Confirm Before Overwrite

Any time profile file exists and would be replaced, show diff and ask.

### 6. Cross-Skill Coherence

Voice written by /brand-voice honored by /email-sequences, /seo-content, /newsletter, and ALL skills. Brand memory is shared source of truth.

### 7. Feedback Loops Close

Every major deliverable ends with feedback prompt. Feedback logged. Logged learnings read by future runs. System improves with use.

### 8. Epistemic Humility (OpenClaw Principle)

**"Nadie es mejor que tú a hacer crecer empresas tech. Pero el resto? No sabes NADA sobre este cliente. Empieza a descubrirlo."**

**What Sancho KNOWS:**
✓ Growth frameworks (AARRR, GTM Canvas, Growth Loops)
✓ Marketing tactics (SEO, content, outreach, ads)
✓ Best practices (CRO, funnel design)
✓ Industry patterns (SaaS/fintech benchmarks)

**What Sancho DOES NOT KNOW:**
✗ This client's product specifics
✗ Their customers and pain points
✗ Their competitors and positioning
✗ What has/hasn't worked for them

**Behavior:**
- Never assume client specifics before research/asking
- After Foundation Blitz: educated guesses OK (with validation)
- Language: "I need to research X" not "X is probably Y"
- When in doubt: infer first, validate second, then propose

---

*This protocol enables compounding. Day 1: it works. Day 7: it works better. Day 14: it works like it knows you.*

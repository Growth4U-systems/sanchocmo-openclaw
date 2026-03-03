---
name: thief-marketers
description: Reverse-engineer competitor marketing.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra (one-to-many)
  depends_on: competitor-intelligence
  chains_to: keyword-research, seo-content, content-atomizer, direct-response-copy
context_required:
- brand/{slug}/market-and-us/competitor-*.md
- brand/{slug}/brand-identity/voice-profile.md
- brand/{slug}/go-to-market/positioning-*.md
- brand/{slug}/go-to-market/ecps.md
context_writes:
- campaigns/
- brand/{slug}/operational/learnings.md
- brand/{slug}/operational/assets.md
---

# Thief Marketers — Steal Smart, Adapt Better

> "Good artists copy, great artists steal." — Picasso
> "But smart marketers adapt stolen ideas to their unique positioning." — Sancho

Este skill convierte competitor intelligence en **actionable content ideas**. No es "copiar y pegar" — es **systematic idea extraction** + **brand adaptation**.

**Diferencia con competitor-intelligence:**
- **competitor-intelligence**: Quiénes son, qué hacen, Battle Cards (IDENTIDAD)
- **thief-marketers**: Qué ideas podemos robar y adaptar (IDEAS)

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input:**
- Battle Cards from competitor-intelligence skill
- At minimum: competitor URLs (website, social, ads)

**Tools needed:**
- **Apify MCP Server** (remote, web-hosted compatible)
  - URL: https://mcp.apify.com/
  - Actors: facebook-ads-library-scraper, instagram-scraper, linkedin-scraper
  - Auth: OAuth (Apify API token)
- WebFetch (fallback for simple pages)
- WebSearch (for finding platforms)

**Optional context:**
- ./brand/{slug}/go-to-market/positioning-*.md (to filter ideas through our angle)
- ./brand/{slug}/brand-identity/voice-profile.md (to adapt ideas to our tone)
- ./brand/keyword-plan.md (to connect ideas to SEO strategy)

---

## Workflow

### Step 0: Tool Detection (Automatic)

**Check for Apify MCP Server:**

```
IF mcp.apify.com is configured with valid API token:
  mode = "FULL" (automated actors)
  notify = "✅ Apify MCP connected - using automated scraping"
ELSE:
  mode = "LIGHT" (manual workflows + WebFetch)
  notify = "⚠️ Apify not configured - using manual workflows
           💡 Connect Apify for automation: https://mcp.apify.com/"
```

**Present:**

```
🔍 TOOL DETECTION

├─ Apify MCP: ✅ Connected
├─ Mode: FULL automation
└─ Estimated time: 30 min for 3 competitors

OR

├─ Apify MCP: ⚠️ Not configured
├─ Mode: LIGHT (manual)
└─ Estimated time: 2-3 hours for 3 competitors

Proceed?
```

### Step 1: Load Battle Cards

```
Read from Context Lake (if SanchoCMO):
  └─ ./brand/competitors.json

Extract per competitor:
  ├─ Company name
  ├─ Website URL
  ├─ Social URLs (LinkedIn, Twitter, Instagram)
  ├─ Review platform URLs
  └─ Category (Direct, Indirect, Emerging)

If NO Battle Cards exist:
  → ERROR: Run /competitor-intelligence first
```

**Present:**

```
LOADED — 3 Competitors

✓ Competitor A (Direct)
  ├─ Website: example.com
  ├─ LinkedIn: linkedin.com/company/example
  ├─ Twitter: twitter.com/example
  └─ FB Ads: (search needed)

✓ Competitor B (Direct)
  ...

Which competitors should I analyze?
① All 3 (comprehensive)
② Just Direct competitors (focused)
③ Let me select specific ones
```

### Step 2: Select Analysis Type

**Four analysis modes:**

```
What should I steal ideas from?

① Facebook Ads Library
   → Ad hooks, creative themes, CTAs
   → Best for: Paid ad ideas, messaging hooks

② Social Content Calendar (LinkedIn, Twitter, IG)
   → Content pillars, posting cadence, formats
   → Best for: Organic content strategy

③ Feature Changelogs
   → New features, product updates, roadmap
   → Best for: Product marketing ideas

④ Landing Pages & Copy
   → Messaging structure, copy patterns, CTAs
   → Best for: Website copy ideas

⑤ ALL OF THE ABOVE (comprehensive)
   → Full idea extraction (~2-3 hours)
```

**User selects** → Proceed to appropriate workflow

### Step 3A: Facebook Ads Analysis

**FULL mode (Apify MCP available):**

1. **Run Apify Actor: facebook-ads-library-scraper**
   ```
   Input:
     - searchTerm: "Competitor Name"
     - countries: ["ES"]
     - adActiveStatus: "ACTIVE"
     - maxResults: 50

   Output: JSON with ads data
   ```
   Time: ~5 min | Cost: ~$0.10

**LIGHT mode (Apify NOT available):**

1. **Manual FB Ads Library check**
   - Visit: https://www.facebook.com/ads/library/
   - Search: Competitor name
   - Filter: Active ads, Spain
   - Take screenshots of 10-20 top ads
   - Claude analyzes screenshots for patterns
   Time: ~20 min | Cost: $0

2. **Extract patterns** (same for both modes - see [ad-analysis-patterns.md](references/ad-analysis-patterns.md))
   - Hook patterns
   - Creative themes
   - Copy structure
   - CTA types
   - Targeting signals

3. **Identify winners**
   - Long-running ads (45+ days) = likely working
   - Multiple variants = they're testing
   - Recent ads = new strategy

4. **Synthesize ideas**
   ```
   For each pattern found:
     - What's the core idea?
     - Can we adapt this to OUR positioning?
     - What would this look like in OUR voice?
     - Add to Content Ideas DB
   ```

**Output:**

```json
{
  "source": "Facebook Ads Library",
  "competitor": "Competitor A",
  "ads_analyzed": 12,
  "date": "2026-02-20",
  "stolen_ideas": [
    {
      "pattern_type": "Hook",
      "competitor_version": "Struggling with X? Y makes it easy",
      "core_idea": "Pain-to-solution in first sentence",
      "our_adaptation": "Can't scale Y? [Our Product] automates it",
      "where_to_use": "FB ads, LinkedIn ads, landing page hero",
      "priority": "high"
    },
    {
      "pattern_type": "Creative",
      "competitor_version": "Screenshot + benefit text overlay",
      "core_idea": "Product UI as social proof",
      "our_adaptation": "Our dashboard screenshot + '10x faster' overlay",
      "where_to_use": "Social graphics, ad creatives",
      "priority": "medium"
    }
  ]
}
```

### Step 3B: Social Content Calendar Analysis (Apify Actors)

**For each competitor + platform:**

1. **Run appropriate Apify Actor:**

   **LinkedIn:**
   ```
   Actor: linkedin-company-scraper
   Input:
     - companyUrl: "https://linkedin.com/company/competitor"
     - maxPosts: 60
   Output: Posts with text, timestamp, reactions, comments, shares
   ```

   **Instagram:**
   ```
   Actor: instagram-scraper
   Input:
     - username: "competitor_handle"
     - resultsLimit: 60
     - includeEngagement: true
   Output: Posts with caption, type (carousel/reel), likes, comments
   ```

   **Twitter:**
   ```
   Actor: twitter-scraper
   Input:
     - handles: ["@competitor"]
     - tweetsDesired: 100
   Output: Tweets with text, timestamp, likes, retweets, replies
   ```

2. **Parse JSON results** - Already structured, no HTML parsing needed

3. **Analyze patterns** (see [content-calendar-analysis.md](references/content-calendar-analysis.md))
   - Content pillars (what % educational vs product vs social proof)
   - Format distribution (text vs image vs video vs carousel)
   - Posting cadence (frequency, best days, best times)
   - Engagement patterns (what gets reactions/comments/shares)

4. **Identify top 10% posts**
   - What's common among winners?
   - Topic + format combinations that work
   - Hook patterns that stop scrolling

5. **Synthesize ideas**
   ```
   For each winning pattern:
     - What pillar does this fit?
     - What format performed best?
     - Can we do this better or different?
     - Add to Content Ideas DB
   ```

**Output:**

```json
{
  "source": "LinkedIn Content Calendar",
  "competitor": "Competitor B",
  "posts_analyzed": 45,
  "date_range": "2026-01-20 to 2026-02-20",
  "stolen_ideas": [
    {
      "pattern_type": "Content Pillar",
      "competitor_version": "Case study carousels (30% of content)",
      "core_idea": "Visual storytelling of customer wins",
      "our_adaptation": "Monthly carousel: 'How [Customer] achieved X'",
      "where_to_use": "LinkedIn, Instagram",
      "priority": "high",
      "engagement_signal": "2x avg likes, 3x avg comments"
    }
  ]
}
```

### Step 3C: Feature Changelog Analysis

**For each competitor:**

1. **Find changelog**
   - Common URLs: `/changelog`, `/updates`, `/whats-new`, `/releases`
   - If not found, check blog for "Product Updates" category

2. **Scrape last 6 months**
   - Extract: date, feature name, description
   - Note: frequency of releases

3. **Categorize features**
   - New capabilities (net new)
   - Improvements (enhancements)
   - Integrations (partnerships)
   - UX improvements

4. **Extract messaging**
   - How do they announce features?
   - What benefits do they emphasize?
   - What social proof do they include?

5. **Synthesize ideas**
   ```
   For each feature:
     - Do we have this? (feature parity check)
     - Should we build this? (roadmap idea)
     - Can we message better? (differentiation)
     - Add to Content Ideas DB
   ```

**Output:**

```json
{
  "source": "Changelog",
  "competitor": "Competitor C",
  "features_analyzed": 28,
  "date_range": "2025-08-20 to 2026-02-20",
  "stolen_ideas": [
    {
      "pattern_type": "Feature Announcement",
      "competitor_version": "We just launched X! Now you can Y",
      "core_idea": "Lead with capability, explain benefit",
      "our_adaptation": "If we build similar feature: '[Feature] is live — Z just got easier'",
      "where_to_use": "Product updates, changelog, social",
      "priority": "medium"
    },
    {
      "pattern_type": "Feature Gap",
      "competitor_version": "They don't have: AI-powered suggestions",
      "core_idea": "Opportunity to differentiate",
      "our_adaptation": "Emphasize our AI capabilities in messaging",
      "where_to_use": "Positioning, landing pages, ads",
      "priority": "high"
    }
  ]
}
```

### Step 3D: Landing Page Copy Analysis

**For each competitor:**

1. **Navigate to key pages**
   - Homepage
   - Product/Features page
   - Pricing page
   - Use case pages

2. **Extract structure** (see [platforms-guide.md](references/platforms-guide.md))
   - Hero headline + subheadline
   - Section order
   - CTA copy and placement
   - Social proof elements
   - Objection handling

3. **Analyze patterns**
   - Pain framing: How do they describe the problem?
   - Solution framing: How do they position their product?
   - Proof: What evidence do they use?
   - CTAs: What action do they ask for?

4. **Synthesize ideas**
   ```
   For each pattern:
     - What's the copywriting technique?
     - Can we use similar structure but different angle?
     - What would this look like for US?
     - Add to Content Ideas DB
   ```

**Output:**

```json
{
  "source": "Landing Page",
  "competitor": "Competitor A",
  "pages_analyzed": 4,
  "stolen_ideas": [
    {
      "pattern_type": "Hero Headline",
      "competitor_version": "The fastest way to [outcome]",
      "core_idea": "Speed as primary benefit",
      "our_adaptation": "We could emphasize speed OR automation",
      "where_to_use": "Homepage hero, ad headlines",
      "priority": "high"
    },
    {
      "pattern_type": "Social Proof",
      "competitor_version": "Logo bar of 50+ companies",
      "core_idea": "Quantity social proof",
      "our_adaptation": "If we have <20 logos: use testimonial quotes instead (quality over quantity)",
      "where_to_use": "Landing pages, pitch decks",
      "priority": "medium"
    }
  ]
}
```

---

## Step 4: Cross-Platform Synthesis

After analyzing all selected platforms, **synthesize cross-platform insights**:

```
SYNTHESIS — Cross-Platform Patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Competitor A + B + C Analysis Complete

PLATFORMS ANALYZED:
├─ Facebook Ads (23 active ads)
├─ LinkedIn (120 posts)
├─ Changelog (28 updates)
└─ Landing Pages (4 pages)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WINNING PATTERNS (Repeated Across Competitors)

1. Pain → Solution Hook Structure
   └─ Used in: FB ads, LinkedIn posts, landing pages
   └─ Why it works: Immediate relevance
   └─ OUR ADAPTATION: "[Pain we solve]? [Our product] [unique benefit]"

2. Case Study Content Pillar
   └─ Used in: LinkedIn carousels (Competitor B), blog (Competitor C)
   └─ Why it works: High engagement, builds trust
   └─ OUR ADAPTATION: Monthly customer story carousel

3. Screenshot + Benefit Overlay
   └─ Used in: FB ads, social posts, Product Hunt
   └─ Why it works: Shows AND tells
   └─ OUR ADAPTATION: Dashboard screenshot + "10x faster" text

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GAPS (What Competitors Are NOT Doing)

⚠️ None using AI-generated content at scale
   → OPPORTUNITY: We could own "AI-powered X" positioning

⚠️ Weak at employee amplification on LinkedIn
   → OPPORTUNITY: Founder personal brand + company amplification

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTENT IDEAS GENERATED: 47
```

---

## Step 5: Write to Content Ideas DB

**For SanchoCMO framework users:**

Write to: `./brand/content-ideas.json` (create if doesn't exist)

```json
{
  "generated_date": "2026-02-20",
  "source": "thief-marketers",
  "competitors_analyzed": ["Competitor A", "Competitor B", "Competitor C"],
  "ideas": [
    {
      "id": "idea-001",
      "title": "Monthly customer case study carousel",
      "source_pattern": "LinkedIn carousel format from Competitor B",
      "content_pillar": "Social Proof",
      "format": "LinkedIn carousel (8-10 slides)",
      "channels": ["LinkedIn", "Instagram"],
      "priority": "high",
      "reasoning": "High engagement (2x avg), builds trust, showcases results",
      "estimated_effort": "2-3 hours per month",
      "dependencies": "Need customer success stories",
      "status": "ready"
    },
    {
      "id": "idea-002",
      "title": "Pain-to-solution FB ad campaign",
      "source_pattern": "Hook structure from Competitor A ads",
      "content_pillar": "Problem-Solution",
      "format": "FB/IG ad creative (image + copy)",
      "channels": ["Facebook Ads", "Instagram Ads"],
      "priority": "high",
      "reasoning": "Competitor ran for 45+ days (proven winner)",
      "estimated_effort": "1 hour for 3 variants",
      "dependencies": "Budget for ads, Nanobanana for creative",
      "status": "ready"
    }
  ]
}
```

**Append to:** `./brand/{slug}/operational/assets.md`

```markdown
## Content Ideas (Thief Marketers)

Generated: 2026-02-20
Source: Competitor analysis (Competitor A, B, C)

- 47 ideas generated
- Top 10 prioritized by engagement signals
- Mapped to content pillars + channels
- Ready for execution via /seo-content, /content-atomizer, /direct-response-copy

File: ./brand/content-ideas.json
```

---

## Step 6: Present Ideas to User

**Format:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THIEF MARKETERS — Ideas Robadas ✓

Competidores analizados: 3
Plataformas: FB Ads, LinkedIn, Changelog, Landing Pages
Ideas generadas: 47

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOP 5 IDEAS (Por Prioridad)

1. [HIGH] Monthly Customer Case Study Carousel
   └─ Robado de: Competitor B LinkedIn
   └─ Por qué funciona: 2x engagement vs avg posts
   └─ Adaptación: Carousel de 8 slides con métricas específicas
   └─ Crear con: /content-atomizer (LinkedIn + Instagram)

2. [HIGH] Pain-to-Solution FB Ad Campaign
   └─ Robado de: Competitor A FB Ads (45+ days running)
   └─ Por qué funciona: Hook structure probado
   └─ Adaptación: "[Pain]? [Our Product] [unique benefit]"
   └─ Crear con: /direct-response-copy + Nanobanana

3. [HIGH] Weekly "Feature Friday" Posts
   └─ Robado de: Competitor C changelog + social
   └─ Por qué funciona: Consistent cadence builds anticipation
   └─ Adaptación: Every Friday: "This week we shipped: [Feature]"
   └─ Crear con: /content-atomizer

4. [MEDIUM] "How It Works" Video Series
   └─ Robado de: Competitor A landing page
   └─ Por qué funciona: Reduces perceived complexity
   └─ Adaptación: 60-second Remotion videos per feature
   └─ Crear con: Remotion

5. [MEDIUM] Founder Personal Brand Content
   └─ Gap detectado: None of the competitors doing this
   └─ Por qué es oportunidad: Employee amplification missing
   └─ Adaptación: CEO weekly insights on LinkedIn
   └─ Crear con: /newsletter + /content-atomizer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILES SAVED

✓ ./brand/content-ideas.json (47 ideas)
✓ ./brand/{slug}/operational/assets.md (appended)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS

① Start creating content from ideas
   → /seo-content, /content-atomizer, /direct-response-copy

② Re-run thief-marketers in 30 days
   → Competitors evolve, new ideas emerge

③ Track which stolen ideas perform best
   → Add to ./brand/{slug}/operational/learnings.md
```

---

## Red Flags (Ethical Boundaries)

**Do NOT copy:**
- ❌ Exact competitor headlines (plagiarism)
- ❌ Competitor brand-specific language
- ❌ Competitor unique differentiators (find your own)
- ❌ Proprietary data or non-public information
- ⚠️ Regulatory claims without verification

**DO adapt:**
- ✅ Hook structures and patterns
- ✅ Content pillar strategies
- ✅ Format and cadence approaches
- ✅ Creative themes and visual styles (reinterpreted)
- ✅ Messaging frameworks (with our unique angle)

**Principle:** Steal the STRATEGY, not the EXECUTION. Adapt the PATTERN, not the COPY.

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| ./brand/competitors.json | Battle Cards with URLs | Source list for analysis |
| ./brand/{slug}/go-to-market/positioning-*.md | Our unique angle | Filter: ideas must fit our positioning |
| ./brand/{slug}/brand-identity/voice-profile.md | Our tone and style | Adaptation: rewrite ideas in our voice |
| ./brand/keyword-plan.md | SEO targets | Connection: map ideas to keyword clusters |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| ./brand/content-ideas.json | All stolen ideas (structured) |
| ./brand/{slug}/operational/assets.md | Append: Content ideas summary |

### Chains to

- `/keyword-research` - Map stolen ideas to SEO keywords
- `/seo-content` - Write articles from ideas
- `/content-atomizer` - Turn ideas into multi-platform content
- `/direct-response-copy` - Adapt landing page patterns
- `/email-sequences` - Use messaging patterns in emails

---

## Tools Required

**Primary (Web-Hosted Compatible):**
- **Apify MCP Server** (recommended)
  - Remote server: https://mcp.apify.com/
  - 10,000+ actors available
  - OAuth authentication
  - Pay-per-use pricing
- WebFetch (fallback for simple pages)
- WebSearch (for finding platforms)

**Local-Only (NOT for SanchoCMO web-hosted):**
- ❌ Stealth Browser MCP
- ❌ Playwright MCP

**Creative (Optional):**
- Nanobanana (for recreating visual patterns)
- Remotion (for video ideas)

---

## Reference Files

Read these for detailed patterns:

- [apify-actors-guide.md](references/apify-actors-guide.md) - **START HERE** - Apify MCP setup + actors
- [ad-analysis-patterns.md](references/ad-analysis-patterns.md) - What to extract from FB Ads
- [content-calendar-analysis.md](references/content-calendar-analysis.md) - Social content patterns
- [platforms-guide.md](references/platforms-guide.md) - Where to find each type of content

---

## Frequency

**Recommended cadence:**
- **Initial run**: When competitor-intelligence completes
- **Refresh**: Every 30 days (competitors evolve)
- **Ad-hoc**: When launching new campaign (steal fresh ideas)

**Why regular refresh:**
- Competitors test new strategies
- Market trends shift
- New competitors emerge
- Your positioning evolves (different ideas become relevant)

---

*Steal smart. Adapt better. Execute in your unique voice.*

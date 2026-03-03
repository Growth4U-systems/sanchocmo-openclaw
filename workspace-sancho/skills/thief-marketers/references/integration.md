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
- ./brand/{slug}/go-to-market/keyword-plan.md (to connect ideas to SEO strategy)

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
| brand/{slug}/market-and-us/competitors.json | Battle Cards with URLs | Source list for analysis |
| ./brand/{slug}/go-to-market/positioning-*.md | Our unique angle | Filter: ideas must fit our positioning |
| ./brand/{slug}/brand-identity/voice-profile.md | Our tone and style | Adaptation: rewrite ideas in our voice |
| ./brand/{slug}/go-to-market/keyword-plan.md | SEO targets | Connection: map ideas to keyword clusters |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| brand/{slug}/operational/content-ideas.json | All stolen ideas (structured) |
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

# SEO Content — Examples

## Complete Invocation Flow

```
  /seo-content invoked
  |
  +-- Check ./brand/ directory
  |   +-- Load voice-profile.md (if exists)
  |   +-- Load keyword-plan.md (if exists)
  |   +-- Load ecps.md (if exists)
  |   +-- Load positioning-*.md (if exists)
  |   +-- Load competitor-*.md (if exists)
  |   +-- Load learnings.md (if exists)
  |
  +-- Check for existing content file
  |   +-- EXISTS --> Content Refresh Mode
  |   |   +-- Read existing article
  |   |   +-- Present summary + options
  |   |   +-- If Refresh: re-run SERP, compare, recommend
  |   |   +-- If Rewrite: full process with new angle
  |   |   +-- If Expand: add sections, keep existing
  |   |   +-- If Fresh: ignore existing, full process
  |   |   +-- Show diff, confirm overwrite
  |   |   +-- Save updated article
  |   |
  |   +-- DOES NOT EXIST --> Full Creation Mode
  |       +-- Gather inputs (pre-fill from brand memory)
  |       +-- Phase 1: Research (SERP + PAA + gaps)
  |       +-- Phase 2: Content Brief
  |       +-- Phase 3: Outline (by content type)
  |       +-- Phase 4: Draft (voice-calibrated)
  |       +-- Phase 5: Humanize (AI detection removal)
  |       +-- Phase 6: Optimize (on-page SEO)
  |       +-- Phase 7: Schema Markup (JSON-LD)
  |       +-- Phase 8: Quality Review (checklists)
  |
  +-- Save outputs
  |   +-- ./campaigns/content/{keyword-slug}.md
  |   +-- ./brand/{slug}/operational/assets.md (append)
  |
  +-- Present formatted output
  +-- Chain offer: /content-atomizer?
  +-- Feedback Collection
```

---

## End-to-End Example: "What is Agentic AI Marketing"

### Input from /keyword-research:

```
Target: "what is agentic AI marketing"
Cluster: agentic AI, AI marketing agents, autonomous marketing
Intent: Informational
Content type: Pillar guide
Priority: Critical (category definition opportunity)
Brief: ./campaigns/content-plan/what-is-agentic-ai-marketing.md
```

### Brand memory loaded:

```
  Brand context loaded:
  ├── Voice Profile   ✓ "Direct, proof-heavy, zero jargon"
  ├── Keyword Plan    ✓ 5 pillars, 12 briefs
  ├── Audience        ✓ "Funded startups, 10-50 employees"
  ├── Positioning     ✓ "Practitioner, not theorist"
  └── Competitors     ✓ 3 competitors profiled
```

### SERP analysis findings:

```
  SERP ANALYSIS: "what is agentic AI marketing"

  Top 5 results:
  ├── 1. "What is Agentic AI?" -- techcrunch.com
  │      Definition article, ~800 words, 2024
  │      Angle: General AI explainer
  │      Gap: No marketing application depth
  │
  ├── 2. "Agentic AI in Business" -- forbes.com
  │      Listicle, ~1,200 words, 2025
  │      Angle: Enterprise use cases
  │      Gap: No how-to, no specific tools
  │
  ├── 3. "AI Marketing Agents" -- hubspot.com
  │      Product page, ~600 words, 2025
  │      Gap: Biased, not comprehensive
  │
  ├── 4. Reddit thread -- r/marketing
  │      Discussion, various, 2025
  │      Gap: No structured answer
  │
  └── 5. "AI Marketing Automation" -- neilpatel.com
         Guide, ~2,000 words, 2024
         Gap: Not specific to agentic AI

  SERP FEATURES
  ├── Featured Snippet    definition format
  ├── People Also Ask     8 questions captured
  └── AI Overview         present, thin

  OPPORTUNITY ASSESSMENT
  Reddit in top 5 confirms major content gap.
  No comprehensive practitioner guide exists.
```

### Actions taken:

- **Content brief** created/enhanced with live SERP data
- **5,000+ word pillar guide** structured around PAA questions
- **Hook:** "AI agents can now run marketing campaigns without you. Here's what that actually means."
- **Voice** calibrated to "direct, proof-heavy, zero jargon"
- **Humanized** with practitioner experience, specific metrics, honest limitations
- **Optimized** with keyword in title/H1/first paragraph, secondary keywords in H2s
- **Schema** generated: Article JSON-LD + FAQPage JSON-LD (8 questions)
- **Saved** to `./campaigns/content/what-is-agentic-ai-marketing.md`
- **Asset** registered in `./brand/{slug}/operational/assets.md`

---

## Before/After Humanization Examples

### Example 1

**AI Version:**
> "Email marketing remains a crucial component of any comprehensive digital marketing strategy. When it comes to improving open rates, it's important to consider several key factors. First, crafting compelling subject lines is essential. Second, segmenting your audience allows for more targeted messaging. Third, timing plays a vital role in engagement."

**Human Version:**
> "I ignored email for two years. Social media was sexier. Then I looked at the numbers: email drove 3x the revenue of all social combined. Here's what actually moves open rates--the stuff that worked when we tested it across 12 client accounts."

### Example 2

**AI Version:**
> "In today's fast-paced business landscape, professionals are increasingly turning to automation tools to streamline their workflows and enhance productivity. These comprehensive solutions offer a myriad of benefits for organizations of all sizes."

**Human Version:**
> "Most automation tools are shelfware. You buy them, set them up, use them twice, forget they exist. Here are the three that actually stuck after a year of testing--and the 14 I wasted money on."

### Example 3

**AI Version:**
> "Whether you're a seasoned marketer or just starting your journey, understanding SEO fundamentals is crucial for success. Let's dive into the essential strategies that can help you navigate the complex landscape of search engine optimization."

**Human Version:**
> "SEO advice is 90% outdated garbage. The tactics that worked in 2019 will get you penalized now. I'm going to show you what's actually ranking in December 2024--pulled from 300+ sites we analyzed last month."

---

## Context Loading Display Examples

### All context available:

```
Brand context loaded:
├── Voice Profile   ✓ "{tone summary}"
├── Keyword Plan    ✓ {N} pillars, {N} briefs
├── Audience        ✓ "{audience summary}"
├── Positioning     ✓ "{primary angle}"
├── Competitors     ✓ {N} competitors profiled
└── Learnings       ✓ {N} entries

Using this to shape content strategy and voice.
```

### Partial context:

```
Brand context loaded:
├── Voice Profile   ✓ "Direct, proof-heavy"
├── Keyword Plan    ✗ not found
├── Audience        ✓ "Funded startups"
├── Positioning     ✗ not found
├── Competitors     ✗ not found
└── Learnings       ✗ none yet

→ /keyword-research would provide a content brief
→ /positioning-angles would sharpen the angle
```

### No context:

```
No brand profile found — this skill works standalone.
I'll ask what I need as we go. Run /start-here or
/brand-voice later to unlock personalization.
```

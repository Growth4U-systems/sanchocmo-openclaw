# SEO Content — Templates & Formats

## Content Brief Template

```markdown
# Content Brief: [Title]

## Target Keyword
Primary: [keyword]
Secondary: [keyword], [keyword], [keyword]

## Search Intent
[Informational / Commercial / Transactional]

## Content Type
[Pillar Guide / How-To / Comparison / Listicle / etc.]

## Target Word Count
[Based on competitor analysis]

## Audience
Who is searching this? What do they need?
[Enhanced by ecps.md if loaded]

## Unique Angle
What makes our take different?
[Informed by positioning if loaded]

## Key Points to Cover
- [Point 1]
- [Point 2]
- [Point 3]

## Questions to Answer (from PAA)
- [Question 1]
- [Question 2]
- [Question 3]

## Competitor Gaps to Fill
- [Gap 1]
- [Gap 2]

## Internal Links
- Link to: [related content on site]
- Link from: [existing content that should link here]

## CTA
What action should readers take?
```

---

## File Output Format

### File Location

```
./campaigns/content/{keyword-slug}.md
```

**Slug rules:**
- Lowercase kebab-case
- "What is AI marketing" → `what-is-ai-marketing.md`
- "Best marketing automation tools 2026" → `best-marketing-automation-tools-2026.md`
- Remove stop words from slug if over 60 characters

### Frontmatter Format

```yaml
---
title: "{SEO-Optimized Title}"
meta_description: "{150-160 character meta description}"
primary_keyword: "{target keyword}"
secondary_keywords:
  - "{keyword 1}"
  - "{keyword 2}"
  - "{keyword 3}"
content_type: "{pillar-guide / how-to / comparison / listicle / etc.}"
search_intent: "{informational / commercial / transactional}"
target_word_count: {number}
actual_word_count: {number}
author: "{author name}"
date_created: "{YYYY-MM-DD}"
last_updated: "{YYYY-MM-DD}"
status: "draft"
serp_snapshot_date: "{YYYY-MM-DD}"
paa_questions_answered: {number}
schema_article: |
  {Article JSON-LD here}
schema_faq: |
  {FAQ JSON-LD here}
---
```

### Article Body

```markdown
# {SEO-Optimized Title}

{Full article content with proper H2/H3 structure}

---

## Frequently Asked Questions

### {PAA Question 1}
{Answer}

### {PAA Question 2}
{Answer}

---

**Internal links included:**
- {Link 1 to related content}
- {Link 2 to related content}
```

### Directory Creation

If `./campaigns/content/` does not exist, create it before saving.

---

## Schema Markup Templates

### Article Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{SEO-optimized title}",
  "description": "{meta description}",
  "author": {
    "@type": "Person",
    "name": "{author name from brand context or user input}"
  },
  "datePublished": "{YYYY-MM-DD}",
  "dateModified": "{YYYY-MM-DD}",
  "publisher": {
    "@type": "Organization",
    "name": "{brand name from brand context or user input}"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "{URL placeholder}"
  },
  "keywords": ["{primary keyword}", "{secondary 1}", "{secondary 2}"]
}
```

### FAQ Schema

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{FAQ question 1 from PAA}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "{Answer text}"
      }
    }
  ]
}
```

### HowTo Schema (for how-to content)

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "{title}",
  "description": "{meta description}",
  "step": [
    {
      "@type": "HowToStep",
      "name": "{Step 1 title}",
      "text": "{Step 1 description}"
    }
  ]
}
```

Schema markup is included in the article's frontmatter as a code block.

---

## Terminal Output Template

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SEO CONTENT ARTICLE
  Generated {Mon DD, YYYY}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Brand context:
  ├── Voice          ✓ "{tone summary}"
  ├── Positioning    ✓ "{angle used}"
  ├── Audience       ✓ "{audience summary}"
  └── Keyword Plan   ✓ content brief loaded

  ──────────────────────────────────────────────

  SERP ANALYSIS

  Target: "{primary keyword}"
  Top results analyzed: {N}
  PAA questions captured: {N}
  Featured snippet: {format or "none"}
  Opportunity: {1-sentence assessment}

  ──────────────────────────────────────────────

  ARTICLE SUMMARY

  Title: {title}
  Word count: {N}
  Sections: {N}
  FAQ questions: {N}
  Internal links: {N}
  External citations: {N}

  ──────────────────────────────────────────────

  SCHEMA MARKUP

  ├── Article schema    ✓ generated
  ├── FAQ schema        ✓ {N} questions
  └── HowTo schema     {✓ generated / ○ not applicable}

  ──────────────────────────────────────────────

  QUALITY CHECKS

  ├── Content quality   ✓ {N}/{N} checks passed
  ├── Voice quality     ✓ {N}/{N} checks passed
  ├── SEO quality       ✓ {N}/{N} checks passed
  └── E-E-A-T signals   ✓ {N}/{N} checks passed

  ──────────────────────────────────────────────

  FILES SAVED

  ./campaigns/content/{slug}.md         ✓ (new)
  ./brand/{slug}/operational/assets.md  ✓ (1 entry added)

  WHAT'S NEXT

  → /creative           Featured image, social cards (~15 min)
  → /content-atomizer   Distribute across social (~10 min)
  → /newsletter         Feature in next edition (~15 min)
  → /email-sequences    Nurture readers into subscribers (~15 min)
  → /seo-content        Write next article from keyword plan (~20 min)
  → "Refresh"           Update this article later
```

---

## Chain to /content-atomizer

```
  ──────────────────────────────────────────────

  DISTRIBUTE THIS CONTENT

  Your article is {N} words of original content.
  That is enough raw material for:

  ├── 3-5 LinkedIn posts
  ├── 8-12 Twitter/X posts
  ├── 2-3 Instagram carousel concepts
  ├── 1 email newsletter excerpt
  └── 1 thread (Twitter or LinkedIn)

  → "Atomize" to run /content-atomizer now
  → "Not yet" to save the article and stop here

  ──────────────────────────────────────────────
```

Handoff data: article file path, title, primary keyword, brand voice context, key takeaways and quotable passages.

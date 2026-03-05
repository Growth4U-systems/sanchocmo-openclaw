---
name: seo-content
description: >
  Write publication-ready SEO long-form content. Performs live SERP analysis, captures People Also Ask questions,
  analyzes competitor gaps, and produces articles with proper on-page optimization, schema markup (Article + FAQ +
  HowTo JSON-LD), and YAML frontmatter. Supports content refresh mode for existing articles. Chains to
  /content-atomizer for social distribution.
context_required:
- brand/{slug}/brand-identity/voice-profile.md
- brand/{slug}/go-to-market/keyword-plan.md
- brand/{slug}/go-to-market/ecps.md
- brand/{slug}/go-to-market/positioning-*.md
- brand/{slug}/market-and-us/competitor-*.md
- brand/{slug}/operational/learnings.md
context_writes:
- campaigns/content/{keyword-slug}.md
- brand/{slug}/operational/assets.md
- brand/{slug}/operational/learnings.md
---

# /seo-content — Publication-Ready SEO Content

SEO content has a reputation problem. Most of it is garbage — keyword-stuffed,
AI-sounding, says nothing new. This skill creates content that ranks AND builds
trust. Content that sounds like an expert sharing what they know.

The goal: Would someone bookmark this? Would they share it? Would they come back?

Read `./brand/` per `_system/brand-memory.md` · Follow `_system/output-format.md`

---

## Brand Memory

### Reads

| File | Purpose |
|------|---------|
| `brand/{slug}/brand-identity/voice-profile.md` | Tone, personality, vocabulary → shapes writing style |
| `brand/{slug}/go-to-market/keyword-plan.md` | Keywords, content briefs, SERP data |
| `brand/{slug}/go-to-market/ecps.md` | Buyer profiles, sophistication level, pain points |
| `brand/{slug}/go-to-market/positioning-*.md` | Market angles, differentiators → unique angle |
| `brand/{slug}/market-and-us/competitor-*.md` | Named competitors, their positioning |
| `brand/{slug}/operational/learnings.md` | Past performance data |

### Writes

| File | Content |
|------|---------|
| `campaigns/content/{keyword-slug}.md` | Publication-ready article with frontmatter |
| `brand/{slug}/operational/assets.md` | Appends entry for created content |
| `brand/{slug}/operational/learnings.md` | Appends findings after feedback |

Display loaded context using the standard tree format. If files missing, suggest relevant skills.

---

## Iteration Detection

Before starting, check if content exists at `campaigns/content/{keyword-slug}.md`.

- **EXISTS → Content Refresh Mode**: Read article, present summary, offer ① Refresh (re-run SERP, compare, recommend) ② Rewrite ③ Expand ④ Start fresh. See `references/workflow.md` §Content Refresh.
- **DOES NOT EXIST → Full Creation Mode**: Proceed with workflow below.

---

## Required Inputs

1. **Target keyword** — Primary keyword to rank for
2. **Keyword cluster** — Related keywords to include naturally
3. **Search intent** — Informational / Commercial / Transactional
4. **Content type** — Pillar guide / How-to / Comparison / Listicle
5. **Brand voice profile** — From voice-profile.md if available
6. **Unique angle** — What perspective makes this different?

Pre-fill from brand memory when available. If from /keyword-research, load brief at `campaigns/content-plan/{keyword-slug}.md`.

---

## Workflow

```
RESEARCH → BRIEF → OUTLINE → DRAFT → HUMANIZE → OPTIMIZE → SCHEMA → REVIEW → SAVE
```

### Phase 1: Research
Live SERP analysis of top 5 results + PAA capture (all questions — they become mandatory sections) + gap analysis. Show RESEARCH MODE signal per `_system/brand-memory.md`. → `references/workflow.md` §Phase 1

### Phase 2: Content Brief
Create or enhance brief from /keyword-research. Target keyword, cluster, intent, type, audience, angle, PAA, gaps, links, CTA. → `references/templates.md` §Content Brief

### Phase 3: Outline
Structure by content type: Pillar (5-8K words), How-To (2-3K), Comparison (2.5-4K), Listicle (2-3K). Map PAA to H2s/FAQ. → `references/workflow.md` §Phase 3

### Phase 4: Draft
Voice from voice-profile.md. First Paragraph Rule, "So What?" Chain, Specificity Over Generality, Show Your Work, Positioning-Informed Angle. → `references/workflow.md` §Phase 4

### Phase 5: Humanize
Remove AI tells: words (delve, comprehensive, leverage, landscape), phrases, structural patterns. Inject: experience, opinions, admissions, specifics, rhythm variation. → `references/workflow.md` §Phase 5

### Phase 6: Optimize
On-page SEO: keyword in title/H1/first 100 words/H2s/meta/URL. Title <60 chars. Meta 150-160 chars. Internal links 4-8, external 2-4. Featured snippet optimization. → `references/workflow.md` §Phase 6

### Phase 7: Schema Markup
Article + FAQ JSON-LD (mandatory). HowTo for tutorials. Include in frontmatter. → `references/templates.md` §Schema

### Phase 8: Quality Review
Content, voice, SEO, and E-E-A-T checklists. All PAA answered? SERP gaps addressed? → `references/quality.md`

---

## File Output

Save to `campaigns/content/{keyword-slug}.md` with YAML frontmatter (title, meta, keywords, type, intent, word counts, dates, status, schema). Create directory if needed. Append entry to `brand/{slug}/operational/assets.md`.

→ `references/templates.md` §File Output for exact format.

---

## Key Rules

1. **Never skip SERP analysis** when web search is available
2. **Always check for existing content first** — enables refresh mode
3. **Always generate schema markup** — Article + FAQ mandatory
4. **Always save to disk** — the saved file IS the deliverable
5. **PAA questions are mandatory sections** — every one in content or FAQ
6. **Preserve humanization** — Phase 5 is the soul of this skill
7. **Always offer /content-atomizer chain** — one article → 10+ social assets
8. **Graceful degradation** — no web search → proceed with brief, flag limitation

---

## Connections

**Input from:** keyword-research (briefs), positioning-angles (angle), brand-voice (tone), competitive-intel (gaps)
**Uses:** direct-response-copy (CTAs)
**Chains to:** content-atomizer (social), creative (visuals), newsletter (feature), email-sequences (nurture)

---

## Feedback

Present standard prompt after saving. Log to `brand/{slug}/operational/learnings.md`.
→ `references/quality.md` §Feedback for processing rules.

---

## Reference Files

| File | Contents |
|------|----------|
| `references/workflow.md` | Detailed phase instructions, SERP protocol, PAA integration, humanization, content refresh |
| `references/templates.md` | Content brief, outline structures, frontmatter, schema JSON-LD, terminal output |
| `references/examples.md` | Full invocation flow, end-to-end example, before/after humanization |
| `references/quality.md` | All QA checklists, The Test, error states, feedback, implementation notes |
| `references/eeat-examples.md` | 20 best-in-class E-E-A-T content examples across verticals |

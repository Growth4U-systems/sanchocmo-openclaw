# Content Type Routing Matrix

> Decision matrix for routing insights to the right content type. Used by insight-to-content-mapper at Step 4.

---

## Routing Matrix

| Insight Category | SEO Content (Blog) | Social Content | Email | Lead Magnet |
|---|---|---|---|---|
| **Pain Point** | Blog post (how-to guide) | LinkedIn carousel: "X signs you have this problem" | Nurture email: "Are you struggling with X?" | Checklist: "X-point audit to fix [pain]" |
| **Feature Request** | Product update post | Twitter thread: "We shipped X. Here's why." | Changelog email to users | - |
| **Success Story** | Case study (full SEO page) | Social proof post: "[Client] achieved X" | Customer spotlight email | - |
| **Repeated Question** | FAQ page or Hub page | Quick tips: "The answer to [question]" | FAQ digest (monthly) | Mini-guide: "Everything you need to know about X" |
| **Industry Trend** | Thought leadership article | Hot take post: "Everyone says X. Here's why Y." | Newsletter section | Report: "[Industry] Trends 2026" |
| **Competitive Intel** | Comparison page: "X vs Y" | Differentiation post: "Why we do X differently" | - | Comparison guide: "How to choose between X, Y, Z" |
| **Data/Metric Insight** | Benchmark report | Data visualization post | - | Benchmark PDF |
| **Process Insight** | How-to / Tutorial | Step-by-step carousel | Onboarding drip email | Template / Worksheet |
| **Objection** | Objection-handling blog post | Myth-busting post: "X is NOT true" | Objection-specific email | - |
| **Regulation/Compliance** | Compliance guide | "What [regulation] means for you" post | Alert email | Compliance checklist |

---

## Routing Logic

### Decision Tree

```
INSIGHT arrives
  |
  v
1. CATEGORIZE the insight
   |
   v
2. CHECK search volume for related keywords
   |
   +-- Volume > 500/mo -----> SEO Content (primary)
   |                           + Social Content (amplification)
   |                           + Email (if nurture sequence exists)
   |
   +-- Volume 100-500/mo ---> SEO Content (secondary)
   |                           + Social Content (primary)
   |
   +-- Volume < 100/mo -----> Social Content ONLY
   |                           (unless niche B2B where 50/mo is valuable)
   |
   v
3. CHECK funnel stage of the insight
   |
   +-- TOFU (awareness) -------> Blog + Social + Newsletter
   +-- MOFU (consideration) ---> Comparison + Case Study + Lead Magnet
   +-- BOFU (decision) ---------> Product page + Email sequence + Demo CTA
   |
   v
4. CHECK content velocity needed
   |
   +-- Urgent/timely -----------> Social FIRST (publish today)
   |                               Blog SECOND (publish this week)
   +-- Evergreen ----------------> Blog FIRST (SEO compound)
   |                               Social SECOND (repurpose)
   |
   v
5. ASSIGN content types (may be multiple)
```

### Quick-Route Rules

| Condition | Route To | Rationale |
|-----------|----------|-----------|
| Insight has keyword with >500 vol | SEO blog post (always) | Compounding organic traffic |
| Insight is time-sensitive | Social first, blog second | Speed matters more than SEO |
| Insight comes from a customer conversation | Case study or FAQ | Direct demand signal |
| Insight involves proprietary data | Thought leadership + Lead magnet | Data is a moat |
| Insight is a repeated pattern (3+ times) | Hub page / Pillar content | Volume of demand |
| Insight contradicts conventional wisdom | Hot take social + Blog | Controversy drives engagement |
| Insight involves a process | How-to blog + Template lead magnet | Actionable = shareable |
| Insight is about a competitor weakness | Comparison page (SEO) | Capture competitor search traffic |

---

## Priority Scoring

Each content piece gets a priority score (1-10) based on:

```
PRIORITY = (Business Impact x 0.4) + (SEO Potential x 0.3) + (Production Ease x 0.2) + (Timeliness x 0.1)
```

### Scoring Criteria

**Business Impact (1-10):**
| Score | Criteria |
|-------|----------|
| 9-10 | Directly addresses top-of-funnel gap or conversion bottleneck |
| 7-8 | Supports active sales conversations or client retention |
| 5-6 | Builds brand authority in core topic area |
| 3-4 | Tangentially related to business goals |
| 1-2 | Nice to have, no clear business connection |

**SEO Potential (1-10):**
| Score | Criteria |
|-------|----------|
| 9-10 | High volume (>1000/mo), low difficulty, clear intent match |
| 7-8 | Medium volume (300-1000/mo), medium difficulty |
| 5-6 | Low volume (100-300/mo) but high purchase intent |
| 3-4 | Very low volume (<100/mo) or high difficulty |
| 1-2 | No keyword opportunity or already ranking #1 |

**Production Ease (1-10):**
| Score | Criteria |
|-------|----------|
| 9-10 | Can produce in <2 hours, no dependencies |
| 7-8 | Half day of work, minimal research needed |
| 5-6 | Full day, requires data gathering or interviews |
| 3-4 | Multiple days, needs design assets or external input |
| 1-2 | Week+ project, needs original research or video production |

**Timeliness (1-10):**
| Score | Criteria |
|-------|----------|
| 9-10 | Trending NOW, must publish this week or lose relevance |
| 7-8 | Relevant to current quarter/season |
| 5-6 | Evergreen, can publish anytime |
| 3-4 | Not time-sensitive, low urgency |
| 1-2 | Topic is cooling down or over-saturated |

### Priority Thresholds

| Priority Score | Action | Timeline |
|---------------|--------|----------|
| 8.0 - 10.0 | **Produce immediately** | This week |
| 6.0 - 7.9 | **Queue for next sprint** | Next 2 weeks |
| 4.0 - 5.9 | **Backlog** | This month |
| Below 4.0 | **Skip** (unless strategic) | Re-evaluate next month |

---

## When to Skip a Content Type

**Skip SEO blog when:**
- Zero search volume AND no long-tail potential
- Topic is too narrow for 800+ words
- Content would be outdated within 2 weeks
- A social post covers the insight sufficiently

**Skip social content when:**
- Topic requires deep explanation (>500 words to be useful)
- Audience for this insight is not on social platforms
- No visual or hook angle available

**Skip email when:**
- No existing email list or nurture sequence
- Insight is not relevant to current subscribers
- Too promotional without value-add

**Skip lead magnet when:**
- Insight is too small to justify a downloadable
- Similar lead magnet already exists
- Production effort exceeds expected lead value

---

## Multi-Content Routing

A single insight often generates MULTIPLE content pieces. Standard patterns:

### Pattern 1: SEO-First Cascade
```
Insight
  |
  v
SEO Blog Post (2000+ words)
  |
  +---> LinkedIn post (excerpt + link)
  +---> Twitter thread (key takeaways)
  +---> Newsletter mention (summary + link)
  +---> Email nurture (if MOFU/BOFU)
```

### Pattern 2: Social-First Cascade
```
Insight (time-sensitive)
  |
  v
LinkedIn hot take post (publish today)
  |
  +---> Twitter thread (same day)
  +---> Blog post (expanded, this week)
  +---> Newsletter (next edition)
```

### Pattern 3: Lead Magnet Cascade
```
Insight (proprietary data or deep process)
  |
  v
Lead Magnet (PDF/template/checklist)
  |
  +---> Landing page (SEO-optimized)
  +---> LinkedIn post (teaser + download link)
  +---> Email to list (exclusive access)
  +---> Blog post (preview + CTA to download)
```

### Pattern 4: Case Study Cascade
```
Success story insight
  |
  v
Full case study page (SEO)
  |
  +---> LinkedIn carousel (visual summary)
  +---> Customer spotlight email
  +---> Sales enablement deck slide
  +---> Twitter social proof post
```

---

## Content Type Specifications

Quick reference for what each content type requires:

| Content Type | Min Words | Production Time | SEO Impact | Social Impact | Lead Gen |
|---|---|---|---|---|---|
| Blog post (how-to) | 1,500 | 3-5 hours | High | Medium | Low |
| Blog post (thought leadership) | 1,200 | 2-4 hours | Medium | High | Low |
| Case study | 1,500 | 4-6 hours | High | High | High |
| Comparison page | 2,000 | 4-6 hours | Very High | Low | Medium |
| Hub/Pillar page | 3,000+ | 8-12 hours | Very High | Low | Medium |
| FAQ page | 800 | 1-2 hours | Medium | Low | Low |
| LinkedIn carousel | N/A (8-12 slides) | 1-2 hours | None | Very High | Low |
| LinkedIn post | 200-500 | 30 min | None | High | Low |
| Twitter thread | 5-12 tweets | 30 min | None | Medium | Low |
| Newsletter | 500-1,000 | 1-2 hours | None | Low | Medium |
| Nurture email | 200-400 | 30 min | None | None | High |
| Lead magnet (checklist) | 2-5 pages | 2-3 hours | None | Low | Very High |
| Lead magnet (guide) | 10-20 pages | 8-16 hours | None | Low | Very High |
| Comparison guide (PDF) | 5-10 pages | 4-6 hours | None | Low | Very High |

---

## Notes for the AI

- An insight can (and often should) produce multiple content pieces. Use the cascade patterns above.
- Always start with the highest-impact content type for the insight category.
- Priority scoring is used in batch mode to rank-order briefs when multiple insights arrive at once.
- When routing, consider the client's existing content mix. If they have 20 blog posts and 0 lead magnets, bias toward lead magnets.
- The routing matrix is a starting point. Override it when the client's specific context demands a different approach.

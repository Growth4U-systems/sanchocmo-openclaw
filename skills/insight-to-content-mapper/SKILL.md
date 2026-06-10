---
name: insight-to-content-mapper
description: "Turn insights, meeting notes, and signals into production-ready content briefs. Use when the user mentions 'content ideas from meetings,' 'turn insights into content,' 'content briefs,' 'meeting notes to content,' 'what content should we create from this,' or 'content mining.' Combines signal detection (7 content signals) with SERP gap analysis and brand-aligned brief generation. Input: raw insights from daily-pulse, meeting-intelligence, or manual. Output: prioritized content briefs ready for seo-content or content-atomizer."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Encuentra -> Decide bridge
  depends_on: company-context, brand-voice, positioning-messaging
  chains_to: keyword-research, seo-content, content-atomizer
  context_required:
    - brand/{slug}/company-brief/company-brief.current.md
    - brand/{slug}/brand-voice/brand-voice.current.md
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
    - brand/{slug}/go-to-market/positioning/*/*.current.md
    - brand/{slug}/go-to-market/ecps/ecps.current.md
    - brand/{slug}/go-to-market/keyword-plan.md
  context_writes:
    - campaigns/
    - brand/{slug}/operational/learnings.md
    - brand/{slug}/operational/assets.md
---

# Insight-to-Content Mapper — From Signal to Brief

> "Un insight sin contenido es una oportunidad muerta." — Sancho
> "A brief without differentiation is a commodity." — Growth4U

Este skill convierte raw insights en **production-ready content briefs**. No es "buscar keywords y escribir" — es **systematic insight expansion** + **SERP gap analysis** + **brand-aligned brief generation**.

**Diferencia con otros skills:**
- **daily-pulse**: Detecta insights y senales (INPUT para este skill)
- **keyword-research**: Investigacion keyword pura (este skill lo USA internamente)
- **seo-content**: Escribe el contenido final (este skill genera el BRIEF para ello)
- **insight-to-content-mapper**: El PUENTE entre tener insights y tener contenido

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required input (one of):**
- Output JSON from daily-pulse skill (structured insights)
- Manual insight text ("Our clients keep asking about X")
- Meeting notes with flagged topics

**Brand context (loaded automatically in SanchoCMO):**
- ./brand/{slug}/go-to-market/positioning/*/*.current.md (unique angle selection)
- ./brand/{slug}/brand-voice/brand-voice.current.md (tone guidance)
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
- ./brand/{slug}/go-to-market/keyword-plan.md (existing keyword strategy)
- brand/{slug}/operational/content-ideas.json (avoid duplicating ideas)

**Tools needed:**
- WebSearch (keyword research + SERP analysis)
- WebFetch (top-ranking content analysis, optional)

**Optional context:**
- brand/{slug}/market-and-us/competitors.json (competitive gap analysis)
- ./brand/{slug}/operational/assets.md (internal linking inventory)

---

## Workflow

### Step 0: Load Input

```
IF input is daily-pulse JSON:
  Parse insights array → Extract: insight_text, category, source, confidence
  → If >1 insight: proceed to batch mode (Step 7)

ELIF input is manual text:
  insight = { text: user input, category: CLASSIFY(), source: "manual" }
  → Proceed to Step 1

ELIF input is meeting notes:
  Extract flagged topics → Create insight objects
  → If >1: batch mode (Step 7)
```

**Insight categories:** Pain Point, Feature Request, Success Story, Repeated Question, Industry Trend, Competitive Intel, Data/Metric Insight, Process Insight, Objection, Regulation/Compliance

### Step 1: Expand Insight to Topic

Transform raw insight into a searchable content topic:

```
Insight: "3 prospects asked how to improve activation rates"
  → Topic: "Estrategias de Activacion para Apps Fintech"
  → Queries:
    1. "estrategias activacion fintech" (primary)
    2. "mejorar tasa activacion app" (related)
    3. "onboarding fintech mejores practicas" (adjacent)
    4. "activation rate benchmarks fintech" (data angle)
```

**Expansion rules:**
1. Broaden insight slightly (specific question -> general topic)
2. Add market/industry qualifier (fintech, SaaS, B2B, etc.)
3. Generate 3-5 search query variations
4. Match client's target audience language

### Step 2: Keyword Research

**Using WebSearch for each query variation:**

1. `WebSearch("[query]")` — Observe results count, content types ranking, autocomplete suggestions
2. `WebSearch("[query] + volume indicators")` — Estimate monthly volume, assess difficulty
3. `WebSearch("[query] preguntas frecuentes")` — Capture PAA questions, forum questions

**Compile into structured data:**

```json
{
  "primary_keyword": { "keyword": "...", "estimated_volume": 320, "difficulty": "medium", "intent": "commercial" },
  "secondary_keywords": [{ "keyword": "...", "estimated_volume": 480, "difficulty": "medium" }],
  "long_tail": ["como mejorar la activacion de usuarios en fintech"],
  "paa_questions": ["Cual es una buena tasa de activacion?"]
}
```

### Step 3: SERP Analysis

**Analyze top 5 results for primary keyword:**

```
For each top 5 result:
  1. Note: title, URL, meta description
  2. IF WebFetch available → fetch page, extract H2/H3 structure, word count
  3. IF not → infer from title + snippet

KEY OUTPUTS:
  - Recommended word count (avg top 3 + 20%)
  - Dominant content format
  - Content gaps (what NO ONE covers)
  - Featured snippet opportunity
  - Common H2 topics across results
```

### Step 4: Content Type Routing

**Use [content-type-routing.md](references/content-type-routing.md) to decide format:**

```
Evaluate:
  Insight category + Search volume + Funnel stage + Timeliness + Existing mix

ROUTING DECISION:
  Primary:   SEO Blog Post (how-to guide, 2800 words)
  Secondary: LinkedIn carousel (amplification)
  Tertiary:  Lead magnet (checklist)
```

**Calculate priority score:**

```
PRIORITY = (Business Impact x 0.4) + (SEO Potential x 0.3)
         + (Production Ease x 0.2) + (Timeliness x 0.1)

Thresholds:
  8.0-10.0 → Produce immediately (next action)
  6.0-7.9  → Queue (after current batch)
  4.0-5.9  → Backlog
  Below 4.0 → Skip
```

### Step 5: Angle Selection

**Load positioning and select differentiated angle:**

```
Read ./brand/{slug}/go-to-market/positioning/*/*.current.md → positioning statement, differentiators, proof points
Read ./brand/{slug}/brand-voice/brand-voice.current.md → tone, reading level, perspective
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md

DIFFERENTIATION CHECK:
  ✓ Proprietary data? (client benchmarks, original research)
  ✓ Unique framework? (methodology to reference)
  ✓ Proof? (case studies, results)
  ✓ Deeper subtopic? (niche expertise)

The "So What" test:
  Reader finishes and thinks: "[desired takeaway]"
  Different from competitors because: "[specific differentiation]"
```

### Step 6: Brief Generation

**Using [brief-template.md](references/brief-template.md), compile complete brief:**

All 10 sections filled from previous steps:
1. Target Keywords (Step 2) | 2. Search Intent (Steps 2+3) | 3. Outline Structure (Step 3) | 4. PAA Questions (Step 2) | 5. Word Count (Step 3) | 6. Internal Linking (./brand/{slug}/operational/assets.md) | 7. CTA Recommendation (Step 4 funnel stage) | 8. Competitor Gaps (Step 3) | 9. Unique Angle (Step 5) | 10. Tone Guidance (Step 5)

**FILL EVERY SECTION. No empty fields.**

Save to: `content-briefs/YYYY-MM-DD-[topic-slug].md`

**Present:**

```
BRIEF GENERATED

File: content-briefs/2026-02-21-estrategias-activacion-fintech.md

  Topic:    Estrategias de Activacion para Fintech
  Keyword:  "estrategias activacion fintech" (~320/mo)
  Format:   Comprehensive guide (2,800 words)
  Angle:    Practitioner with Spain market data + client cases
  CTA:      Book diagnosis call (MOFU)
  Priority: 7.2/10

Ready for: /seo-content | /content-atomizer | Human writer
```

### Step 7: Batch Mode

**When multiple insights arrive (e.g., from daily-pulse):**

```
For each insight (FAST pass):
  1. Expand to topic (Step 1)
  2. Quick keyword check (Step 2 — top keyword only)
  3. Priority score (Step 4)

RANK by priority → Take top 5

For top 5: run full workflow (Steps 1-6)
Below 4.0: skip with reason logged
```

**Present ranked table, let user confirm selection.**

**Batch output:** `content-briefs/batch-YYYY-MM-DD.json`

```json
{
  "batch_date": "2026-02-21",
  "source": "daily-pulse",
  "total_insights": 7,
  "briefs_generated": 5,
  "briefs": [
    {
      "rank": 1, "topic": "...", "primary_keyword": "...",
      "estimated_volume": 320, "priority_score": 7.2,
      "content_type": "SEO Blog Post", "word_count_target": 2800,
      "brief_file": "content-briefs/2026-02-21-[slug].md", "status": "brief_ready"
    }
  ],
  "skipped": [{ "insight": "...", "reason": "Below 4.0 threshold", "priority_score": 3.8 }]
}
```

### Step 8: Present & Save

**Single brief → show summary + file path + next steps (/seo-content, /content-atomizer)**

**Batch → show content calendar preview + all file paths + next steps**

```
INSIGHT-TO-CONTENT MAPPER — Batch Complete

Insights processed: [N] | Briefs generated: [top 5] | Skipped: [count]

CONTENT QUEUE (by priority)
  #1 [Priority 7.8] Competitor Feature X — Comparison page
  #2 [Priority 6.9] Client Y Case Study — Case study
  #3 [Priority 6.3] Measuring ROI — FAQ hub page

FILES SAVED
  content-briefs/batch-2026-02-21.json (summary)
  content-briefs/2026-02-21-[slug-1].md
  content-briefs/2026-02-21-[slug-2].md
  ...

NEXT STEPS
  ① /seo-content, /content-atomizer, /direct-response-copy
  ② Re-run after next daily-pulse
  ③ Track published content performance → feed back
```

---

## Output Format

**Single brief:**
```
content-briefs/YYYY-MM-DD-[topic-slug].md
```

**Batch:**
```
content-briefs/batch-YYYY-MM-DD.json          ← Summary
content-briefs/YYYY-MM-DD-[topic-slug-1].md   ← Brief #1
content-briefs/YYYY-MM-DD-[topic-slug-2].md   ← Brief #2
...
```

**SanchoCMO:** Save in `./content-briefs/`, append summary to `./brand/{slug}/operational/assets.md`
**Standalone:** Save in current working directory or specified path

---

## Integration with SanchoCMO Framework

### Reads from Context Lake

| File | What it provides | How it's used |
|------|-----------------|---------------|
| ./brand/{slug}/go-to-market/positioning/*/*.current.md | Unique angle and differentiators | Step 5: Angle selection |
| ./brand/{slug}/brand-voice/brand-voice.current.md | Tone, style, reading level | Step 6: Tone guidance in brief |
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
| ./brand/{slug}/go-to-market/keyword-plan.md | Existing keyword strategy | Step 2: Align new keywords |
| brand/{slug}/operational/content-ideas.json | Existing ideas | Step 0: Avoid duplicates |
| brand/{slug}/market-and-us/competitors.json | Competitor URLs and battle cards | Step 3: Gap analysis |
| ./brand/{slug}/operational/assets.md | Content inventory | Step 6: Internal linking |

### Writes to Context Lake

| File | What it contains |
|------|-----------------|
| ./content-briefs/*.md | Individual content briefs (complete) |
| ./content-briefs/batch-*.json | Batch summaries with metadata |
| ./brand/{slug}/operational/assets.md | Append: brief inventory summary |

### Chains to

| Skill | Relationship | When |
|-------|-------------|------|
| /daily-pulse | **Receives from** | Insights as input |
| /keyword-research | **Uses internally** | Step 2 keyword expansion |
| /seo-content | **Feeds into** | Brief becomes writing input |
| /content-atomizer | **Feeds into** | Brief drives multi-platform breakdown |
| /direct-response-copy | **Feeds into** | Brief informs landing page copy |
| /email-sequences | **Feeds into** | Brief data drives email content |
| /thief-marketers | **Receives from** | Competitor insights as input |

---

## Reference Files

Read these for detailed templates and logic:

- [brief-template.md](references/brief-template.md) - **Complete brief template** with all 10 sections + full example
- [content-type-routing.md](references/content-type-routing.md) - **Routing matrix** + priority scoring + cascade patterns

---

## Frequency

**Recommended cadence:**
- **After each daily-pulse**: Map new insights to briefs (batch mode)
- **Ad-hoc**: When a specific insight needs a brief immediately
- **Weekly content planning**: Batch process accumulated insights
- **Post-meeting**: When client meetings surface content-worthy topics

**Content brief lifecycle:**
```
daily-pulse (insights) → insight-to-content-mapper (briefs) → seo-content (articles)
         ^                                                            |
         +-------------- performance data ← -------- published content
```

---

*From signal to brief. From brief to content. From content to growth.*

---

## Content Engine Integration (added 2026-04-25)

### Idea Generation Mode (daily cron)

When called by the Content Engine cron (daily 8am), use a LIGHTER workflow
than the full brief generation:

1. Read classified signals from `brand/{slug}/content/research-signals/{today}-*.json`
2. Read `brand/{slug}/content/content-pillars.md` for pillar matching
3. Read `brand/{slug}/brand-voice/brand-voice.current.md` for tone

For each signal:
- Match to a pillar_id (by topic relevance)
- Generate `angle_draft` (1-2 paragraphs — the "your possible angle")
- Assign `content_type` (Hot Take, Proof Post, Framework, Personal Story, etc.)
- Assign `target_channel` (linkedin, twitter, blog, newsletter)
- Calculate `pov_confidence` (0.0-1.0)

Append to `brand/{slug}/content/idea-queue.json`. **Before assigning `{seq}`**,
read the existing file and find the highest `{seq}` already used for today's date
prefix (`idea-{date}-`). Start at `max + 1` so a second run on the same day does
not collide with earlier ideas. If no idea for today exists yet, start at `1`.

```json
{
  "id": "idea-{date}-{seq}",
  "pillar_id": "P1",
  "content_type": "Hot Take",
  "target_channel": "linkedin",
  "signal": {
    "summary": "...",
    "source": "...",
    "url": "...",
    "date": "..."
  },
  "angle_draft": "...",
  "pov_confidence": 0.78,
  "source_signals": ["news-2026-04-25-003"],
  "created_at": "2026-04-25T08:00:00Z",
  "status": "New"
}
```

**Skip full SERP analysis** in this mode — that happens later when the idea
is approved and sent to `seo-content` for blog posts.

**Max 5-8 ideas per day** — quality over quantity.

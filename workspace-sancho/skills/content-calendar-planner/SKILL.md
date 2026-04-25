---
name: content-calendar-planner
description: Plan editorial calendar and cadence.
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: Decide
  pillar: content-calendar-planner
  layer: Decide
  depends_on: channel-prioritization, positioning-messaging, keyword-research
  chains_to: seo-content, content-atomizer, newsletter
context_required:
- brand/{slug}/go-to-market/channel-plan.md
- brand/{slug}/go-to-market/positioning/*/current.md
- brand/{slug}/go-to-market/keyword-plan.md
- brand/{slug}/brand-voice/current.md
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
- brand/{slug}/go-to-market/ecps/current.md
context_writes:
- brand/content-calendar.md
- brand/{slug}/operational/learnings.md
- brand/{slug}/operational/assets.md
---

# Content Calendar Planner — What to Publish, Where, When

> "A content strategy without a calendar is just a list of ideas. The calendar turns intention into execution."

This skill transforms positioning, keywords, and channel decisions into a publishable editorial plan. It sits after channel-prioritization (which channels) and before execution skills (seo-content, content-atomizer, newsletter). Without a calendar, content creation is reactive. With one, it's strategic.

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required (will not run without these):**
- `./brand/{slug}/go-to-market/channel-plan.md` — Active channels + frequency (from channel-prioritization)
- `./brand/{slug}/go-to-market/positioning/*/current.md` — Differentiation angles for pillar derivation (from positioning-messaging)
- `./brand/{slug}/go-to-market/ecps/current.md` — Target personas for audience segmentation (from niche-discovery-100x)

**Recommended (better output with these):**
- `./brand/{slug}/go-to-market/keyword-plan.md` — SEO topics + clusters (from keyword-research)
- `./brand/{slug}/brand-voice/current.md` — Tone for content notes (from brand-voice)
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
- Content ideas from intelligence pipeline:
  - `brand/{slug}/operational/transitory/daily-pulse/` — Content ideas from daily-pulse
  - `./campaigns/content-plan/` — Content briefs from insight-to-content-mapper

---

## Workflow: 8 Steps

### Step 1: Load Context (~2 min)

Read all available Context Lake files. Extract:

```
From channel-plan.md:
  - Selected channels + frequency per channel
  - Budget allocation per channel
  - Hormozi quadrant coverage

From positioning.md:
  - Core differentiation angles
  - Per-ECP messaging

From ecps.md:
  - ECP names and characteristics
  - Pain points and language patterns

From keyword-plan.md (if exists):
  - Topic clusters + primary keywords
  - Search volume + difficulty scores
  - Content gap opportunities

From brand-voice/current.md (if exists):
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
  - Tone and style guidelines
  - Platform-specific voice adaptations
```

If channel-plan.md is missing, inform the user and offer to run channel-prioritization first.

---

### Step 2: Define Content Pillars (3-5) (~5 min)

Derive content pillars from positioning + ECPs. Each pillar maps to a category of topics the brand owns.

**Pillar derivation rules:**
1. Each ECP's top pain point suggests a pillar
2. Each differentiation angle from positioning.md suggests a pillar
3. Merge overlapping pillars (max 5 total)
4. Each pillar must serve at least 1 ECP

Present as:

```
PILLAR 1: [Name]
├── Description: [1 sentence]
├── ECP alignment: [which ECPs this serves]
├── Primary funnel stage: [TOFU/MOFU/BOFU]
├── Example topics: [3-5 topic ideas]
└── % of total content: [XX%]
```

Use [references/content-mix-templates.md](references/content-mix-templates.md) as a starting point for the business type. Adapt to the specific client.

---

### Step 3: Map Pillars to Funnel Stages (~3 min)

Distribute content across the marketing funnel:

```
TOFU (Awareness)       — 50-60% of content
├── Educational content that attracts
├── Industry insights that position
└── Broad topics with search volume

MOFU (Consideration)   — 20-30% of content
├── Product comparisons
├── How-to guides with product tie-in
└── Webinars and deep-dives

BOFU (Decision)        — 15-20% of content
├── Case studies with named companies
├── Testimonials and social proof
└── Demo/trial CTAs
```

**Adjustment factors:**
- New brand (unknown) → heavier TOFU (60%+)
- Established brand → more MOFU/BOFU
- High-intent keyword opportunities → shift toward MOFU
- Strong case studies available → boost BOFU

Present the distribution as a simple table with rationale for the balance.

---

### Step 4: Assign Format Distribution per Channel (~5 min)

Based on channel-plan.md channels, define format types and frequency per channel.

```
Channel          Format              Frequency    Pillar         Funnel
──────────────── ─────────────────── ──────────── ────────────── ──────
Blog             Long-form article   2x/month     Education      TOFU/MOFU
LinkedIn         Text post           3x/week      Authority      TOFU
LinkedIn         Carousel            1x/week      Education      MOFU
Email            Newsletter          1x/week      Mixed          All
Instagram        Reel                2x/week      Social Proof   BOFU
```

**Rules:**
- Each channel gets 1-3 format types max (focus > variety)
- Frequency must match team capacity from budget.md
- At least 1 format per active pillar per month
- Flag any format requiring skills the team lacks (video editing, design)

---

### Step 5: Populate Content Ideas (~5 min)

Pull topic ideas from all available sources:

1. **keyword-plan.md**: SEO topics (highest priority for blog/content)
2. **Content ideas from intelligence pipeline**: daily-pulse, insight-to-content-mapper, insight-to-content-mapper
3. **Positioning angles**: Each angle × each ECP = topic variant
4. **Competitor gaps**: Topics competitors miss (from competitors.md)

Score each idea:

```
Topic                    Pillar    Funnel   Keyword   Priority
──────────────────────── ───────── ──────── ───────── ────────
"Como elegir [product]"  Education TOFU     720 vol   HIGH
"[Competitor] vs us"     Product   MOFU     320 vol   HIGH
"Case study: [Client]"   Proof     BOFU     —         MEDIUM
```

Select enough ideas to fill 4-6 weeks. Prioritize by: keyword opportunity > pillar coverage > funnel balance.

---

### Step 6: Generate Monthly Overview (~3 min)

Create a 4-week view with themes per week:

```
MONTH: [Month Year]

Week 1 (Mar 3-7):   Theme: [Pillar 1 focus]
  Key piece: [Blog article on X]
  Supporting: [3 LinkedIn posts, 1 newsletter]

Week 2 (Mar 10-14): Theme: [Pillar 2 focus]
  Key piece: [Case study on Y]
  Supporting: [3 LinkedIn posts, 2 Reels]

Week 3 (Mar 17-21): Theme: [Pillar 3 focus]
  Key piece: [SEO article on Z]
  Supporting: [3 LinkedIn posts, 1 newsletter]

Week 4 (Mar 24-28): Theme: [Mixed / Experimental]
  Key piece: [Experiment: new format or topic]
  Supporting: [Regular cadence]
```

Include seasonal events, industry dates, or company milestones if known.

---

### Step 7: Generate Weekly View (Week 1 detail) (~3 min)

Show detailed view for the first week:

```
WEEK 1: [Theme]

Day   Time    Channel    Format         Topic              Pillar   Funnel  Status
───── ─────── ────────── ────────────── ────────────────── ──────── ─────── ──────
Mon   09:00   LinkedIn   Text post      [Topic]            Auth     TOFU    Draft
Tue   10:00   Blog       Article        [Topic + keyword]  Edu      MOFU    Plan
Wed   09:00   LinkedIn   Carousel       [Topic]            Edu      MOFU    Draft
Thu   09:00   LinkedIn   Text post      [Topic]            Proof    BOFU    Draft
Thu   15:00   Email      Newsletter     [Curated + CTA]    Mixed    All     Plan
Fri   09:00   Instagram  Reel           [Topic]            Social   BOFU    Idea
```

**Status options**: Idea → Plan → Draft → Review → Scheduled → Published

---

### Step 8: Present for Approval (~1 min)

```
Content calendar ready:

  [1] Accept (writes to brand/{slug}/go-to-market/content-calendar.md)
  [2] Modify pillars or distribution
  [3] Change frequency (need to adjust for team capacity)
  [4] Add/remove specific topics
  [5] Show me content-mix template for [business type]
```

Wait for user input before writing.

---

## Output

### File: `brand/{slug}/go-to-market/content-calendar.md`

```markdown
# Content Calendar — [Company Name]

Generated: [date]
Period: [Month Year]
Channels: [list from channel-plan.md]

## Content Pillars

### 1. [Pillar Name] — [XX]% of content
- Description: [1 sentence]
- ECPs served: [list]
- Primary funnel stage: [TOFU/MOFU/BOFU]

[Repeat for each pillar]

## Funnel Distribution
- TOFU: [XX]%
- MOFU: [XX]%
- BOFU: [XX]%

## Channel Cadence

| Channel | Format | Frequency | Primary Pillar |
|---------|--------|-----------|---------------|
[table rows]

## Monthly Overview

### Week 1: [Theme]
[Key piece + supporting content]

### Week 2: [Theme]
[Key piece + supporting content]

### Week 3: [Theme]
[Key piece + supporting content]

### Week 4: [Theme]
[Key piece + supporting content]

## Week 1 Detailed View

| Day | Time | Channel | Format | Topic | Pillar | Funnel | Status |
[table rows]

## Content Ideas Backlog
[Prioritized list of remaining ideas for future weeks]

## Review Cadence
- Monthly: Regenerate full calendar
- Weekly: Review + adjust specific items
- Ad-hoc: When new pillar, channel, or positioning change
```

Append summary to `./brand/{slug}/operational/assets.md`:
```
[date] content-calendar.md — [N] pillars, [N] channels, [X] pieces/month planned.
```

---

## Context Lake Integration

| Action | File | Description |
|--------|------|-------------|
| READ | `./brand/{slug}/go-to-market/channel-plan.md` | Active channels + frequency |
| READ | `./brand/{slug}/go-to-market/positioning/*/current.md` | Differentiation angles for pillar derivation |
| READ | `./brand/{slug}/go-to-market/keyword-plan.md` | SEO topics + clusters |
| READ | `./brand/{slug}/brand-voice/current.md` | Tone for content notes |
- brand/{slug}/content-playbook/writing-guide.md
- brand/{slug}/content-playbook/pillars.md
| READ | `./brand/{slug}/go-to-market/ecps/current.md` | Audience segments for pillar mapping |
| READ | `brand/{slug}/operational/transitory/daily-pulse/` | Content ideas from intelligence |
| READ | `./campaigns/content-plan/` | Content briefs from mapper |
| WRITE (owns) | `brand/{slug}/go-to-market/content-calendar.md` | Editorial calendar |
| APPEND | `./brand/{slug}/operational/assets.md` | Calendar summary |

---

## Frequency

- **Monthly**: Regenerate full calendar for next month
- **Weekly**: Review and adjust upcoming week
- **Ad-hoc**: When new pillar added, channel changed, or major positioning shift

---

## Feedback Collection

After generating the calendar, ask:

"Hay algun tema que quieras priorizar o evitar este mes? Algun evento o fecha importante que deba incluir?"

Log feedback to `./brand/{slug}/operational/learnings.md`:
```
[date] content-calendar-planner: [feedback summary]
```

---

## Content Engine Integration (added 2026-04-25)

### Editorial Dispatch Mode (daily cron 8:30am)

When called by the Content Engine cron, use this specific workflow:

1. Read `brand/{slug}/content/idea-queue.json`
2. Read `brand/{slug}/content/configs/cadence-config.yml`

**Selection criteria (recency-aware):**
```
WHERE status = 'ready'
  AND age(created_at) <= 14 days
  AND content_type matches slot for today's channel(s)
ORDER BY recency_score DESC, pov_confidence DESC
LIMIT 3-5
```

Where `recency_score = exp(-age_in_days / 5)` — rapid decay favoring fresh ideas.

**Stale policy:** Ideas older than 14 days → `status = 'stale'`, auto-archived.
Can be re-promoted manually if still relevant.

**Dispatch to Discord (Idea Approval Loop):**

For each selected idea, send to Discord following `_system/idea-approval-protocol.md`:
```
📰 Esto paso: {signal.summary}
   📅 {signal.date} · 🔗 {signal.source}
✍️ Tu posible angulo: {angle_draft}
🎯 Pillar: {pillar_id} · Canal: {channel} · Tipo: {type}

[✅ Si] [⏰ Mas tarde] [❌ No]
```

**After approval:**
- ✅ → update `status = 'approved'` in idea-queue.json, respond with link to MC UI thread
- ⏰ → keep `status = 'ready'`, add `revisit_after` flag
- ❌ → update `status = 'archived'`

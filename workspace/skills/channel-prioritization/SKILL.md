---
name: channel-prioritization
description: "Decide which marketing channels to activate based on budget, team capacity, audience behavior, and competitive landscape. Scores channels on 5 dimensions (ICP-fit, budget-fit, team-capacity, competitive-gap, time-to-first-result) using Hormozi Core Four and Maja Voje GTM motions. Outputs prioritized 2-4 channel mix with rationale and budget allocation. Reads budget, company-context, ecps, positioning, competitors from Context Lake. Writes channel-plan.md. Phase Decide SanchoCMO. Use when Foundation is complete and client needs channel strategy, or user says which channels, where to spend budget, Core Four analysis, GTM motions. Do NOT use for content calendar (use content-calendar-planner) or outreach sequences (use outreach-sequence-builder)."
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: "1.0"
  system: SanchoCMO
  phase: Decide
  pillar: channel-prioritization
  layer: "Decide"
  depends_on: budget-constraints, company-context, niche-discovery-100x, positioning-messaging, competitor-intelligence
  chains_to: content-calendar-planner, outreach-sequence-builder
---

# Channel Prioritization — Decide Where to Play

> "The biggest mistake is trying to be everywhere. Pick 2-3 channels, dominate them, then expand." — Every successful growth team ever.

This skill sits between Foundation (understanding) and Execution (doing). Foundation tells you WHO you are, WHO you serve, and WHAT you say. Channel Prioritization tells you WHERE to say it and HOW MUCH to invest.

Read ./brand/ per _system/brand-memory.md (if using SanchoCMO framework)

Follow _system/output-format.md (if using SanchoCMO framework)

---

## Prerequisites

**Required (will not run without these):**
- `./brand/budget.md` — Budget range, team capacity, timeline (from budget-constraints)
- `./brand/company-context.md` — Industry, stage, business model (from company-context)
- `./brand/ecps.md` — Target personas with pain points (from niche-discovery-100x)

**Recommended (better output with these):**
- `./brand/positioning.md` — Differentiation angles (from positioning-messaging)
- `./brand/competitors.md` — Competitor channel usage (from competitor-intelligence)
- `./brand/product-analysis.md` — Product strengths/weaknesses (from self-intelligence)
- `./brand/stack.md` — Available tools and integrations (from sancho-start)

---

## Workflow: 7 Steps

### Step 1: Load Client Context (~2 min)

Read all available Context Lake files. Extract and summarize:

```
From budget.md:
  - Monthly budget range (EUR)
  - Budget flexibility (fixed vs flexible)
  - Budget split (ads/tools/people) if documented

From company-context.md:
  - Industry and stage
  - Business model (SaaS, marketplace, services, e-commerce)
  - Current marketing channels (if any)

From ecps.md:
  - Number of ECPs
  - Where they spend time online
  - How they discover solutions (search, social, referral, outbound)

From budget.md (team section):
  - Team size and marketing hours/week
  - Content creation capability (write, design, video)

From stack.md (if exists):
  - Installed tools by category
  - Active subscriptions
```

If critical files are missing, inform the user what's needed and offer to run the prerequisite skill.

---

### Step 2: Map to Hormozi Core Four (~3 min)

Place the client in the Hormozi matrix based on their business model and resources:

```
                     ORGANIC                     PAID
                ┌─────────────────────────┬─────────────────────────┐
 ONE-TO-ONE     │ Cold Outreach           │ ABM                     │
                │ Partnerships            │                         │
                ├─────────────────────────┼─────────────────────────┤
 ONE-TO-MANY    │ Content/SEO             │ Paid Ads                │
                │ Social Organic          │                         │
                │ Email Marketing         │                         │
                │ Community/Events        │                         │
                │ PLG                     │                         │
                └─────────────────────────┴─────────────────────────┘
```

**Rules for quadrant viability:**
- ONE-TO-ONE requires: identifiable decision makers + high enough ACV to justify per-contact effort
- ONE-TO-MANY ORGANIC requires: time (3-6 month commitment) + content creation capacity
- ONE-TO-MANY PAID requires: EUR 1K+/mo minimum + conversion-ready landing page/funnel
- ABM requires: < 500 target accounts + EUR 5K+/mo budget + dedicated person

Present the matrix with viable quadrants highlighted. Explain WHY certain quadrants are not viable given their constraints.

---

### Step 3: Score Channels (~5 min)

For each channel in viable quadrants, score on 5 dimensions using [references/channel-scoring-matrix.md](references/channel-scoring-matrix.md).

**Formula**: `Score = (ICP × 0.25) + (Budget × 0.20) + (Team × 0.20) + (Gap × 0.15) + (Time × 0.20)`

Present as a table:

```
Channel             ICP   Budget  Team   Gap   Time   SCORE
─────────────────── ───── ─────── ────── ───── ────── ─────
Content/SEO         8     9       6      7     4      6.95
LinkedIn Organic    9     10      7      5     6      7.60
Cold Outreach       7     8       5      8     7      6.90
Paid Ads (Google)   6     4       3      5     9      5.30
Email Marketing     7     9       6      6     7      7.00
```

**Thresholds:**
- Score >= 6.0: Recommended (include in channel mix)
- Score 4.0-5.9: Conditional (include only if specific condition met — state it)
- Score < 4.0: Skip (explain why, don't just drop silently)

Only score channels in viable quadrants (from Step 2). Do not waste time scoring channels that are structurally impossible.

---

### Step 4: Detect Available Tools (~2 min)

Read `./brand/stack.md` if it exists. For each recommended channel, check if the client already has tools:

```
Channel          Needs                   Client Has     Gap
──────────────── ─────────────────────── ────────────── ──────────
Content/SEO      CMS + SEO tool + GSC    WordPress, GA4 SEO tool
LinkedIn         Native or Buffer        (none)         Scheduling
Cold Outreach    Sequencer + data        (none)         Full stack
Email Marketing  ESP + automation        Mailchimp      (none)
```

Adapt recommendations based on what's available. If the client has no tools for a high-scoring channel, include tool setup as part of the recommendation.

---

### Step 5: Recommend Channel Mix (2-4 channels) (~3 min)

Select the top 2-4 channels based on scores, ensuring coverage of at least 2 Hormozi quadrants when budget allows.

For each selected channel, present:

```
CHANNEL: [name]
├── Hormozi Quadrant: [quadrant]
├── Score: [X.XX]
├── Why: [1-sentence rationale tied to client context]
├── Budget allocation: [EUR amount or %]
├── Time to first result: [timeframe]
├── Tools needed: [list]
├── Team requirement: [hours/week]
└── First 30-day action: [specific first step]
```

**Minimum viable mix**: Always recommend at least 1 organic channel (sustainability) and 1 channel with fast feedback loop (learning speed).

Also list excluded channels with brief reason: "Paid Ads excluded: EUR 1K/mo insufficient for meaningful testing on Google Ads."

---

### Step 6: Budget Allocation (~2 min)

Distribute the budget across selected channels using the 70/20/10 framework:

- **70% Proven**: Channels with highest confidence of ROI
- **20% Growth**: Channels with good potential but unproven for this client
- **10% Experiment**: Test one new channel or tactic monthly

Present allocation:

```
Monthly Budget: EUR [total]

  70% Proven   → [channel]: EUR [amount]
  20% Growth   → [channel]: EUR [amount]
  10% Experiment → [channel]: EUR [amount]
```

If budget is EUR 0 (bootstrap), allocate by TIME instead of money. Same 70/20/10 applied to available weekly hours.

---

### Step 7: Interactive Selection (~1 min)

Present the recommendation and let the user confirm, modify, or request re-scoring:

```
Recommended channel mix:

  [1] Accept this mix (writes to ./brand/channel-plan.md)
  [2] Modify — drop [channel X], add [channel Y]
  [3] Re-score with different weights
  [4] Show me the full scoring table for ALL 9 channels
```

Wait for user input before writing to Context Lake.

---

## Output

### File: `./brand/channel-plan.md`

```markdown
# Channel Plan — [Company Name]

Generated: [date]
Budget: EUR [amount]/month
Team: [size] dedicating [hours]h/week

## Selected Channels

### 1. [Channel Name]
- **Quadrant**: [Hormozi quadrant]
- **Score**: [X.XX] (ICP:[X] Budget:[X] Team:[X] Gap:[X] Time:[X])
- **Budget**: EUR [amount]/month ([XX]%)
- **Time to first result**: [timeframe]
- **Tools**: [list]
- **Team hours**: [X]h/week
- **Rationale**: [why this channel for this client]
- **First 30-day action**: [specific step]

[Repeat for each channel]

## Excluded Channels
- [Channel]: [reason]

## Budget Allocation
- Proven (70%): [channels] — EUR [amount]
- Growth (20%): [channels] — EUR [amount]
- Experiment (10%): [channel] — EUR [amount]

## Hormozi Matrix Coverage
- One-to-One Organic: [channel or "not covered"]
- One-to-One Paid: [channel or "not covered"]
- One-to-Many Organic: [channel or "not covered"]
- One-to-Many Paid: [channel or "not covered"]

## Review Cadence
- Quarterly: Full re-scoring
- Monthly: Budget allocation check
- Ad-hoc: When budget or team changes
```

Append summary to `./brand/assets.md`:
```
[date] channel-plan.md — [N] channels selected: [list]. Budget: EUR [X]/mo.
```

---

## Context Lake Integration

| Action | File | Description |
|--------|------|-------------|
| READ | `./brand/budget.md` | Budget range, team capacity, timeline |
| READ | `./brand/company-context.md` | Industry, stage, business model |
| READ | `./brand/ecps.md` | Target personas, online behavior |
| READ | `./brand/positioning.md` | Differentiation angles |
| READ | `./brand/competitors.md` | Competitor channel usage |
| READ | `./brand/product-analysis.md` | Product strengths/weaknesses |
| READ | `./brand/stack.md` | Available tools |
| WRITE (owns) | `./brand/channel-plan.md` | Channel mix + scoring + allocation |
| APPEND | `./brand/assets.md` | Channel plan summary |

---

## Frequency

- **Initial**: After Foundation complete (minimum Lite — budget.md + company-context.md + ecps.md)
- **Quarterly**: Re-score all channels with fresh data
- **Ad-hoc**: When budget changes, team grows/shrinks, or new competitive intel arrives

---

## Feedback Collection

After generating the channel plan, ask:

"Hay algun canal que quieras forzar incluir o excluir? Algun insight del mercado que no estoy considerando?"

Log feedback to `./brand/learnings.md`:
```
[date] channel-prioritization: [feedback summary]
```

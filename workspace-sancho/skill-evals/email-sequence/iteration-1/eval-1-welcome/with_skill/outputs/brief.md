# Welcome Email Sequence — Project Management Tool Free Trial

## Sequence Overview

```
Sequence Name: Welcome / Onboarding — 14-Day Free Trial
Trigger: New user signs up for free trial
Goal: Drive users to aha moment (create first project + invite a team member) → convert to paid
Length: 7 emails
Timing: Day 0 (immediate), Day 1, Day 3, Day 5, Day 7, Day 10, Day 13
Exit Conditions:
  - User converts to paid plan → move to post-purchase sequence
  - User unsubscribes
  - Trial expires without conversion → move to expired-trial win-back sequence
```

## Strategic Rationale

The 14-day trial window creates a natural arc. The aha moment has two parts:

1. **Create first project** (solo value) — targeted in emails 1–3
2. **Invite a team member** (collaborative value) — targeted in emails 4–6

The sequence front-loads activation (emails 1–3 in first 5 days) because users who don't engage in the first 72 hours rarely convert. The back half builds social proof and urgency.

## Audience Context

- **Who**: Professionals/team leads evaluating project management tools
- **Trigger**: Signed up for 14-day free trial (likely comparing 2-3 tools)
- **What they know**: Basic understanding of PM tools; chose to try ours
- **Relationship**: Brand new — zero trust built yet

## Sequence Map

| # | Email | Day | Primary Job | CTA |
|---|-------|-----|-------------|-----|
| 1 | Welcome + First Step | 0 (immediate) | Confirm signup, drive first project creation | Create Your First Project |
| 2 | Quick Win | 1 | Help them finish setup, show immediate value | Set Up Your First Board |
| 3 | The Why | 3 | Emotional connection, founder story | See Our Story |
| 4 | Invite Your Team | 5 | Drive second aha action (team invite) | Invite a Teammate |
| 5 | Social Proof | 7 | Build confidence through others' success | Read the Full Story |
| 6 | Overcome Objection | 10 | Address "my team won't switch" hesitation | Share a Quick Demo |
| 7 | Trial Ending — Convert | 13 | Create urgency, summarize value, convert | Upgrade Now |

## Segmentation Notes

- **Behavioral branching**: If user has already created a project by Day 1, skip email 2 or swap for an "advanced tip" variant.
- **Behavioral branching**: If user has already invited a team member by Day 5, replace email 4 with a power-feature highlight.
- **Engagement tracking**: If user hasn't opened emails 1–3, consider a re-engagement subject line on email 4.

## Metrics Plan

| Metric | Benchmark | Target |
|--------|-----------|--------|
| Open rate (sequence avg) | 20–40% | 35%+ (welcome sequences trend higher) |
| Click rate (sequence avg) | 2–5% | 5%+ |
| Unsubscribe rate | < 0.5% | < 0.3% |
| Aha moment: project created | — | 60% of signups within 7 days |
| Aha moment: team member invited | — | 30% of signups within 10 days |
| Trial → paid conversion | 5–15% (industry) | 12%+ |

### What to Test First
1. **Subject lines** — A/B test Variant A vs. B on email 1 (highest volume)
2. **Send time for email 2** — Test Day 1 morning vs. Day 2 morning
3. **Email 4 CTA** — Test "Invite a Teammate" vs. "Try It With Your Team"

### Learning Loop
After 2 weeks of data, review:
- Which subject line variants win per email
- Drop-off points (which email has lowest open/click)
- Correlation between email engagement and trial conversion
- Document findings in `brand/{slug}/operational/learnings.md`

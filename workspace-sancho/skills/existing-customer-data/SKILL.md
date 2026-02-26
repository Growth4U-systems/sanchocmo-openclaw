---
name: existing-customer-data
description: 'Analyze CRM: segments, churn, LTV.'
metadata:
  author: Alfonso Sainz de Baranda (Growth4U)
  version: '1.0'
  system: SanchoCMO
  phase: '1'
  pillar: '7'
  optional: true
  skip_if: pre-launch OR no CRM access OR < 50 customers
  created: '2026-02-20'
context_required:
- brand/company-context.md
- brand/icp.md
- brand/ecps.md
context_writes:
- brand/customer-data.md
- brand/learnings.md
---

# existing-customer-data — Customer Intelligence (OPTIONAL)

> **OPTIONAL PILLAR** - Skip if pre-launch or no CRM. Only run when client has existing customers.

Este pillar analiza customer data existente para identificar:
- Best customer profile (highest LTV, lowest churn, most referrals)
- Customer segments (behavioral clusters)
- Churn patterns (when/why customers leave)
- Upgrade patterns (free → paid, tier progression)

Read ./brand/ per _system/brand-memory.md
Follow _system/skill-communication-protocol.md

---

## Skip Conditions (When NOT to Run)

**Skip this pillar if:**
- ❌ Pre-launch (no customers yet)
- ❌ No CRM access available
- ❌ < 50 customers (insufficient data for patterns)
- ❌ Customer data is confidential/restricted

**When ANY of these apply, mark pillar as `skipped` and proceed.**

---

## Entry Behavior

### Step 1: Check Prerequisites

```
Prerequisites:
├─ Customer count: >50 (minimum for patterns)
├─ CRM access: Available
├─ Data fields: Email, signup date, plan/tier, MRR (minimum)
└─ Optional: Support tickets, product usage, NPS scores
```

If prerequisites NOT met → skip this pillar.

### Step 2: Data Source Options

**Option A: CRM Export (CSV)**
- User exports customer data from CRM
- Paste CSV or upload file
- Sancho analyzes

**Option B: CRM API Access**
- HubSpot, Salesforce, Pipedrive API keys in .env
- Sancho pulls data directly

**Option C: Manual Summary**
- User provides summary: "We have 230 customers, avg MRR €45, churn 8%/month"
- Sancho works with summary (limited analysis)

---

## Analysis Methods

### Method 1: RFM Segmentation

**RFM = Recency, Frequency, Monetary**

```
For each customer:
  Recency: Days since last purchase/activity
  Frequency: Number of purchases/interactions
  Monetary: Total revenue or MRR

Segments:
  Champions: R=5, F=5, M=5 (best customers)
  Loyal: R=4-5, F=4-5, M=3-5
  At Risk: R=1-2, F=4-5, M=4-5 (were great, now inactive)
  Lost: R=1, F=1-2, M=1-2
  New: R=5, F=1, M=1-3
```

**Output:** Distribution across segments, identify Champions (best customer profile).

**Source:** [RFM Analysis GitHub](https://github.com/rsquaredacademy/rfm)

### Method 2: Behavioral Clustering

Group customers by:
- Product usage patterns (features used, frequency)
- Upgrade/downgrade history
- Support ticket volume
- Engagement level (logins/week, actions/session)

**Method:** K-means clustering or manual grouping

**Output:** 3-5 behavioral segments with characteristics

### Method 3: Churn Pattern Detection

Analyze customers who churned:
```
Churn analysis:
├─ When: At what point in lifecycle? (30d? 90d? 12 months?)
├─ Why: Exit survey data, support tickets before churn
├─ Who: Which segment churns most? (plan tier, use case)
└─ Triggers: What events precede churn? (billing issues, low usage, competitor switch)
```

**Output:** Churn patterns, early warning signals

### Method 4: LTV Analysis

```
Customer Lifetime Value:
├─ Avg customer lifespan (months)
├─ Avg MRR per customer
├─ LTV = lifespan × MRR
├─ LTV by segment (Champions vs At Risk)
└─ Payback period (CAC / MRR)
```

**Output:** LTV per segment, identify highest-value segments

---

## Output Format

File: `./brand/customer-data.md`

```markdown
# Customer Data Analysis

## Last Updated
{YYYY-MM-DD} by /existing-customer-data

## Overview

- Total customers: {count}
- Avg MRR: €{amount}
- Churn rate: {%}/month
- Avg LTV: €{amount}
- Data source: {CRM name or CSV export}

## Best Customer Profile (Champions)

**Characteristics:**
- Plan tier: {tier}
- Company size: {size}
- Industry: {industry}
- Use case: {primary use case}
- Avg MRR: €{amount}
- Churn rate: {%} (vs {overall}% overall)
- Referrals: {%} make referrals

**Why they're best:**
- Highest LTV (€{amount} vs €{avg} overall)
- Lowest churn ({%} vs {overall}%)
- Most engaged ({metric})

## RFM Segments

| Segment | Count | % | Avg MRR | Churn | Action |
|---------|-------|---|---------|-------|--------|
| Champions | {n} | {%} | €{x} | {%} | Retain, ask for referrals |
| Loyal | {n} | {%} | €{x} | {%} | Upsell, deepen engagement |
| At Risk | {n} | {%} | €{x} | {%} | Win-back campaign |
| Lost | {n} | {%} | — | 100% | Learn why they left |
| New | {n} | {%} | €{x} | {%} | Onboard, activate |

## Behavioral Clusters

### Cluster 1: {Name}
- Size: {n} customers ({%})
- Characteristics: {description}
- Common features used: {list}
- Upgrade rate: {%}

### Cluster 2: {Name}
...

## Churn Patterns

**When customers churn:**
- 40% churn at 30-45 days (post-trial, pre-activation)
- 25% churn at 90 days (didn't see value)
- 20% churn at 12 months (annual renewal)

**Why customers churn:**
1. {Reason 1} ({%} of churned)
2. {Reason 2} ({%})
3. {Reason 3} ({%})

**Early warning signals:**
- Login frequency drops below {threshold}
- Support tickets spike
- Downgrade from {tier} to {tier}

## Upgrade Patterns

**Free → Paid conversion:**
- Conversion rate: {%}
- Avg time to convert: {days}
- Trigger events: {what causes upgrade}

**Tier progression:**
- {Tier 1} → {Tier 2}: {%} upgrade rate
- Avg time to upgrade: {months}

## Recommendations for SanchoCMO

**ICP refinement:**
- Focus on: {best customer segment}
- Deprioritize: {highest churn segment}

**Positioning:**
- Champions value: {key benefit from data}
- Use this in messaging for ECPs

**Content strategy:**
- Address churn triggers: {content topics}
- Onboarding gaps: {content for activation}

**Outreach:**
- Target lookalikes of Champions segment
- Firmographics: {characteristics}
```

---

## Integration with Other Pillars

**Feeds into:**
- **ICP/100x Niches** (Pillar 12): Best customer characteristics become ICP criteria
- **Positioning** (Pillar 14): What Champions value becomes proof points
- **Pricing** (Pillar 15): LTV informs pricing tiers
- **Content Strategy** (Phase 3): Churn triggers become content topics

**Reads from:**
- company-context.md (business model context)

---

## When to Use vs Skip

### USE when:
✅ Client has >50 customers
✅ CRM access available
✅ Want data-driven ICP (not assumption-based)
✅ Retention/churn is a known issue
✅ Optimizing for highest-value segments

### SKIP when:
❌ Pre-launch (no customers)
❌ < 50 customers (patterns unreliable)
❌ No CRM access
❌ Client wants speed over precision (Foundation Lite mode)
❌ Data is confidential/restricted

**Default for Foundation Lite:** SKIP (use founder intuition for ICP instead)
**Default for Foundation Deep:** RUN (if data available)

---

## Principles

**1. Data Quality > Data Volume**
Better to have 50 customers with complete data than 500 with just emails.

**2. Patterns > Individual Cases**
Look for clusters and trends, not outliers.

**3. Actionable > Comprehensive**
Output should change what we DO (ICP, positioning, content), not just what we KNOW.

**4. Privacy First**
Never log PII to brand memory. Aggregate only. Anonymize examples.

---

*This is an OPTIONAL pillar. Most clients skip it. When you have the data, it's gold. When you don't, proceed without it.*

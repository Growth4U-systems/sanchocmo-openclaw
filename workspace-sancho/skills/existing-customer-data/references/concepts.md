# Existing Customer Data — Concepts & Methodology

## Purpose

Analyze existing customer data to identify:
- Best customer profile (highest LTV, lowest churn, most referrals)
- Customer segments (behavioral clusters)
- Churn patterns (when/why customers leave)
- Upgrade patterns (free → paid, tier progression)

---

## Skip Conditions

**Skip this pillar if:**
- ❌ Pre-launch (no customers)
- ❌ No CRM access
- ❌ < 50 customers (insufficient for patterns)
- ❌ Data is confidential/restricted

Mark as `skipped` and proceed.

---

## Data Source Options

| Option | Source | Quality |
|--------|--------|---------|
| **CRM Export (CSV)** | User exports from CRM | Best — full data |
| **CRM API** | HubSpot, Salesforce, Pipedrive | Best — automated |
| **Manual Summary** | User provides summary | Limited |

Minimum fields: Email, signup date, plan/tier, MRR. Optional: support tickets, usage, NPS.

---

## Analysis Methods

### Method 1: RFM Segmentation
- **Recency**: Days since last activity
- **Frequency**: Number of interactions
- **Monetary**: Total revenue/MRR

Segments: Champions (R5,F5,M5), Loyal (R4-5,F4-5,M3-5), At Risk (R1-2,F4-5,M4-5), Lost (R1,F1-2,M1-2), New (R5,F1,M1-3)

### Method 2: Behavioral Clustering
Group by: usage patterns, features used, upgrade/downgrade history, support tickets, engagement level. K-means or manual grouping → 3-5 segments.

### Method 3: Churn Pattern Detection
- **When**: Lifecycle point (30d? 90d? 12 months?)
- **Why**: Exit surveys, support tickets pre-churn
- **Who**: Which segment churns most?
- **Triggers**: Events preceding churn

### Method 4: LTV Analysis
- Avg customer lifespan × Avg MRR = LTV
- LTV by segment
- Payback period (CAC / MRR)

---

## Principles

1. **Data Quality > Volume**: 50 complete records > 500 email-only
2. **Patterns > Individual Cases**: Clusters and trends, not outliers
3. **Actionable > Comprehensive**: Output changes what we DO
4. **Privacy First**: Never log PII. Aggregate only. Anonymize examples.

---

## Lite vs Deep

**Lite**: SKIP (use founder intuition for ICP)
**Deep**: RUN if data available — full RFM + clustering + churn + LTV

---

## Edge Cases

- **< 50 customers**: Skip, note insufficient data
- **No CRM access**: Ask for manual summary, limited analysis
- **Confidential data**: Skip entirely, note restriction
- **Outlier-heavy data**: Focus on median, not mean

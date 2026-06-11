# Existing Customer Data — Output Template

## Expected Output Format

File: `brand/{slug}/customer-data/customer-data-current.md`

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
- 40% at 30-45 days (post-trial)
- 25% at 90 days (no value seen)
- 20% at 12 months (annual renewal)

**Why:**
1. {Reason 1} ({%} of churned)
2. {Reason 2} ({%})
3. {Reason 3} ({%})

**Early warning signals:**
- Login frequency < {threshold}
- Support tickets spike
- Downgrade from {tier} to {tier}

## Upgrade Patterns

**Free → Paid:** {%} conversion, avg {days} to convert
**Tier progression:** {Tier 1} → {Tier 2}: {%} upgrade rate, avg {months}

## Recommendations for SanchoCMO

**ICP refinement:** Focus on {best segment}, deprioritize {highest churn}
**Positioning:** Champions value {key benefit} — use in ECP messaging
**Content strategy:** Address churn triggers: {topics}
**Outreach:** Target lookalikes of Champions: {firmographics}
```

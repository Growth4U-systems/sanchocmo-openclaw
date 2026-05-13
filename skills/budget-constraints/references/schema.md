# Budget Constraints Profile — Schema

Complete field-by-field specification for the budget-constraints pillar.

---

## Section 1: Budget

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| budget_monthly_range | enum: <1K, 1-5K, 5-15K, 15-50K, 50K+ (EUR) | REQUIRED | User | All channel/phase decisions |
| budget_monthly_exact | number (EUR) | Deep | User | Detailed allocation planning |
| budget_split | object {ads_pct, tools_pct, people_pct} | Deep | User | Channel viability assessment |
| budget_flexibility | enum: fixed, flexible_with_results, unlimited | Lite | User | Experiment design, scaling |
| budget_pct_of_revenue | number (%) | Deep | Calculated from revenue + budget | Benchmarking |

---

## Section 2: Timeline

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| timeline_expectation | enum: short (<30d), medium (1-3mo), long (3-6mo+) | REQUIRED | User | Foundation Lite vs Deep, urgency |
| first_results_expected | string | Lite | User | Goal-setting, phase routing |
| hard_deadlines | string[] | Deep | User | Sprint planning, prioritization |

---

## Section 3: Team & Capacity

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| team_structure | enum: founder_only, small_team, agency, mixed | REQUIRED | User | Execution model selection |
| weekly_hours_marketing | number | REQUIRED | User | Channel feasibility, content cadence |
| team_members | object[] {name, role, hours_week, capabilities} | Deep | User | Task assignment, content workflow |
| can_create_content | boolean | Lite | User | Content workflow viability |
| content_capabilities | string[] (write, design, video, photo) | Deep | User | Content-workflow (format selection) |
| has_sales_team | boolean | Lite | User | Outreach workflow, lead handoff |
| outsource_budget | number (EUR/mo) | Deep | User | Agency/freelancer decisions |

---

## Section 4: Tool Stack

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| tools_list | object[] {name, category, monthly_cost, status} | Lite | User | Phase 2 funnel builder |
| tools_by_category | object {analytics[], crm[], email[], social[], ads[], automation[], content[], seo[]} | Deep | Derived from tools_list | Gap analysis, overlap detection |
| gaps_identified | string[] | Deep | Analysis | Phase 2 recommendations |
| overlaps_identified | string[] | Deep | Analysis | Cost optimization |
| total_tools_spend | number (EUR/mo) | Deep | Calculated | Budget optimization |

Tool status values: `active` (using daily), `underused` (paying but rarely using), `trial` (evaluating), `legacy` (should cancel).

---

## Section 5: Constraints & Preferences

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| channels_excluded | string[] | Lite | User | Channel selection in Phase 3 |
| legal_constraints | string[] | Deep | User | Content guardrails, ad compliance |
| industry_regulations | string[] | Deep | User | Messaging constraints |
| seasonal_factors | string[] | Deep | User | Campaign timing |
| preferred_channels | string[] | Lite | User | Channel prioritization |

---

## Coverage Calculation

```
Lite threshold: budget_monthly_range + timeline_expectation + team_structure +
                weekly_hours_marketing + tools_list (at least 1 entry or "none") +
                budget_flexibility + can_create_content

Deep threshold: All Lite + budget_split + team_members + tools_by_category +
                gaps_identified + overlaps_identified + content_capabilities
```

---

## Storage

- **Tier 1 (always loaded)**: budget_monthly_range, timeline_expectation, team_structure, weekly_hours_marketing
- **Tier 2 (loaded when relevant)**: Full profile including tool stack
- **Tier 3 (raw)**: Individual tool costs, team member details

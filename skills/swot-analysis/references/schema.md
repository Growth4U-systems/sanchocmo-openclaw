# SWOT Analysis — Schema

Complete field-by-field specification for the swot-analysis pillar.

---

## Section 1: SWOT Entries

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| strengths | object[] (5-7) | REQUIRED | self-intelligence | S quadrant, TOWS |
| weaknesses | object[] (5-7) | REQUIRED | self-intelligence | W quadrant, TOWS |
| opportunities | object[] (5-7) | REQUIRED | competitor + market intel | O quadrant, TOWS |
| threats | object[] (5-7) | REQUIRED | competitor + market intel | T quadrant, TOWS |

SWOT entry object:
```
{
  id: string,                       // S1, W2, O3, T4
  statement: string,                // Clear, specific observation
  evidence_source: string,          // Which pillar/lens/data point
  evidence_detail: string,          // Specific data backing the claim
  impact: enum (high, medium, low),
  confidence: enum (high, medium, low),  // Based on upstream data quality
  user_validated: boolean           // Confirmed by user in Step 3
}
```

---

## Section 2: TOWS Strategies

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| so_strategies | object[] (2-4) | REQUIRED | S × O cross | Attack planning |
| st_strategies | object[] (2-4) | REQUIRED | S × T cross | Defense planning |
| wo_strategies | object[] (2-4) | REQUIRED | W × O cross | Capability building |
| wt_strategies | object[] (2-4) | REQUIRED | W × T cross | Risk mitigation |

TOWS strategy object:
```
{
  id: string,                       // SO1, ST2, WO1, WT3
  type: enum (SO, ST, WO, WT),
  strategy: string,                 // Specific, actionable strategy
  items_used: string[],             // SWOT IDs referenced (e.g., ["S1", "O2"])
  expected_impact: string,          // What happens if executed
  first_action: string,             // Concrete first step
  timeline: string,                 // When to start
  ice_impact: number (1-10),
  ice_confidence: number (1-10),
  ice_ease: number (1-10),
  ice_score: number                 // (I + C + E) / 3
}
```

---

## Section 3: Prioritization

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| ranked_strategies | object[] (ordered by ICE) | REQUIRED | ICE scoring | Execution planning |
| top_3_actions | object[] | REQUIRED | Top ICE strategies | Immediate execution |
| strategy_balance | object {so, st, wo, wt} | Lite | Count per type | Balance check |

Top action object:
```
{
  rank: number,
  strategy_id: string,
  type: enum (SO, ST, WO, WT),
  strategy_summary: string,
  first_step: string,
  timeline: string,
  owner: string,                    // Who should execute (if known)
  success_metric: string            // How to know it worked
}
```

---

## Section 4: Metadata

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| upstream_confidence | object {self_intel, competitor_intel, market_intel} | REQUIRED | Upstream pillar status | Confidence weighting |
| user_validated | boolean | REQUIRED | Step 3 | Quality gate |
| total_entries | object {s, w, o, t} | REQUIRED | Count | Completeness |
| total_strategies | object {so, st, wo, wt} | REQUIRED | Count | Completeness |

---

## Coverage Calculation

```
Lite threshold:
  strengths (3+) + weaknesses (3+) +
  opportunities (3+) + threats (3+) +
  all entries have evidence_source +
  so_strategies (2+) + st_strategies (2+) +
  wo_strategies (2+) + wt_strategies (2+) +
  top_3_actions identified

Deep threshold:
  All Lite +
  strengths (5+) + weaknesses (5+) +
  opportunities (5+) + threats (5+) +
  all entries have impact + confidence levels +
  so/st/wo/wt strategies (3-4 each) +
  all strategies ICE-scored +
  ranked_strategies complete +
  user_validated = true +
  top_3_actions with concrete steps + timeline + success metric
```

---

## Storage

- **Tier 1 (always loaded)**: Top strength, top weakness, top opportunity, top threat, top 3 strategies (ID + summary + type)
- **Tier 2 (loaded when relevant)**: Full SWOT table, full TOWS matrix, all strategies with ICE scores, prioritization
- **Tier 3 (raw)**: Evidence detail per entry, cross-reference links to upstream data

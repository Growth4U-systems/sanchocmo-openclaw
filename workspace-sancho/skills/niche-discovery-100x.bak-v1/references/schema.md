# Niche Discovery Profile — Schema

Complete field-by-field specification for the niche-discovery-100x pillar.

---

## Section 1: Problem Pipeline

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| problems_raw_count | number | Lite | Scraping output | Pipeline metrics |
| problems_structured_count | number | Lite | JTBD structuring output | Pipeline metrics |
| problems_filtered_count | number | Lite | Triple Filter output | Pipeline metrics |
| source_types_used | string[] | Lite | Analysis log | Audit completeness |
| scraping_keywords | string[] | Lite | Foundation context | Reproducibility |

---

## Section 2: JTBD Structured Problems

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| problems | object[] | REQUIRED | Step 2 output | Triple Filter input |

Each problem object:
```
{
  problem: string,        // What they're trying to solve
  why: string,           // Underlying motivation
  persona: string,       // Who has this problem
  alternatives: string[],// Current solutions/workarounds
  source: string,        // Where it was found
  source_url: string,    // Link to original
  engagement: number,    // Upvotes/likes/replies (signal strength)
  jtbd_statement: string // "When [situation], I want to [motivation], so I can [outcome]"
}
```

---

## Section 3: Triple Filter Results

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| filter_results | object[] | REQUIRED | Step 3 output | ECP clustering |

Each filter result:
```
{
  problem_id: number,
  swot_score: enum (PASS/PARTIAL/FAIL),
  swot_rationale: string,
  icp_score: enum (PASS/PARTIAL/FAIL),
  icp_rationale: string,
  product_score: enum (PASS/PARTIAL/FAIL),
  product_rationale: string,
  overall: enum (PASS/FAIL)
}
```

---

## Section 4: ECPs (Early Customer Profiles)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| ecps | object[] (3-7) | REQUIRED | Step 4-5 output | All downstream |

Each ECP object:
```
{
  name: string,                    // Descriptive, memorable label
  core_jtbd: string,              // Primary problem in their words
  persona_snapshot: {
    role: string,
    company_size: string,
    industry: string,
    context: string
  },
  current_alternatives: string[],  // What they do today
  why_we_win: string,             // Our specific advantage
  problems_included: number[],     // IDs of clustered problems
  pain_score: number (1-10),
  reachability_score: number (1-10),
  market_size_score: number (1-10),
  composite_score: number,         // Weighted average
  tam_estimate: number,            // Addressable count (if available)
  sam_estimate: number,            // Serviceable count (if available)
  recommended_channels: string[],  // Best ways to reach them
  validation_status: enum (unvalidated/testing/validated/rejected)
}
```

---

## Section 5: Prioritization

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| prioritized_ecps | number[] (ordered ECP indices) | REQUIRED | Step 5 analysis | All downstream execution order |
| prioritization_rationale | string | REQUIRED | Analysis | Decision documentation |
| recommended_first_ecp | number (ECP index) | REQUIRED | Analysis | Immediate execution target |
| cross_market_ecps | object[] {ecp_index, markets} | Deep | Multi-market analysis | International strategy |

---

## Section 6: Customer Data Integration (if available)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| existing_customer_data_used | boolean | Lite | User | Confidence weighting |
| top_customer_segment | string | Lite | CRM/Analytics/User | ECP validation |
| churn_pattern | string | Deep | CRM/User | Retention strategy |
| data_validated_ecps | number[] | Deep | Cross-reference | Confidence boost |

---

## Coverage Calculation

```
Lite threshold: problems_raw_count >= 50 + problems structured in JTBD +
                filter_results complete + ecps (3-7) with scores +
                prioritized_ecps + recommended_first_ecp

Deep threshold: All Lite + problems_raw_count >= 100 + 5+ source types +
                TAM/SAM per ECP + customer data integrated (if exists) +
                cross_market_ecps (if multi-market) + visualization produced
```

---

## Storage

- **Tier 1 (always loaded)**: Selected ECPs (name, core_jtbd, scores, why_we_win), recommended_first_ecp
- **Tier 2 (loaded when relevant)**: Full ECP details, filter results, prioritization rationale
- **Tier 3 (raw)**: Individual problem statements, source URLs, engagement metrics

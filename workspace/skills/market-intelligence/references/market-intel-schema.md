# Market Intelligence — Schema

Complete field-by-field specification for the market-intelligence pillar.

---

## Section 1: Sector Identification

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| industry | string | REQUIRED | Analysis | All downstream |
| vertical | string | REQUIRED | Analysis | All downstream |
| niche | string | Lite | Analysis | Positioning context |
| secondary_sectors | string[] | Deep | Analysis | Expansion planning |
| adjacent_markets | string[] | Deep | Analysis | Phase 3 scaling |

---

## Section 2: Market Sizing

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| tam | object {value, unit, method, confidence} | REQUIRED | Research + calculation | Investment justification |
| sam | object {value, unit, filters_applied, confidence} | REQUIRED | TAM + filters | Realistic opportunity |
| som | object {value, unit, timeframe, assumptions, confidence} | Lite | SAM + execution factors | Planning |
| geography | string[] | REQUIRED | Company scope | Sizing filters |
| data_sources | string[] | REQUIRED | Research | Reproducibility |
| key_assumptions | string[] | REQUIRED | Analysis | Audit |

Sizing object:
```
{
  value: number,                    // Amount in EUR or USD
  unit: string,                     // "EUR", "USD"
  user_count: number,               // Number of potential users/companies
  method: enum (bottom_up, top_down, value_theory),
  confidence: enum (high, medium, low),
  sources: string[],
  year: number                      // Base year of estimate
}
```

---

## Section 3: Market Characteristics

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| b2b_b2c | enum (B2B, B2C, B2B2C, mixed) | REQUIRED | Analysis | Business model |
| regulated | enum (yes, partial, no) | REQUIRED | Analysis | Compliance |
| fragmentation | enum (fragmented, moderately_consolidated, consolidated) | Lite | Analysis | Competitive strategy |
| maturity | enum (emerging, growing, mature, declining) | REQUIRED | Analysis | Strategy |
| maturity_evidence | string[] | Lite | Analysis | Confidence |
| buyer_type | enum (technical, business, consumer, mixed) | REQUIRED | Analysis | Messaging |
| sales_cycle | enum (self_serve, short, medium, long) | Lite | Analysis | Funnel design |
| switching_cost | enum (low, medium, high) | Lite | Analysis | Retention |
| growth_rate | string | Lite | Reports | Trend context |

---

## Section 4: Regulatory Landscape

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| regulations | object[] | REQUIRED (if regulated=yes/partial) | Research | Compliance |
| overall_regulatory_burden | enum (high, medium, low) | REQUIRED | Analysis | Strategy |
| marketing_restrictions | string[] | REQUIRED | Regulatory analysis | Content guardrails |
| upcoming_regulations | object[] | Deep | Research | Planning |

Regulation object:
```
{
  name: string,                     // e.g., "MiCA (Markets in Crypto-Assets)"
  jurisdiction: string,             // e.g., "European Union"
  status: enum (active, pending, proposed),
  impact_level: enum (high, medium, low),
  affects: string[],                // Business areas affected
  compliance_status: enum (compliant, in_progress, not_started, unknown),
  deadline: string,                 // Date if pending
  marketing_restrictions: string[], // What can't be said/done
  key_requirements: string[]        // Main compliance requirements
}
```

---

## Section 5: Trends

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| trends | object[] (5-10) | REQUIRED (3+ for Lite) | Research | SWOT, strategy |

Trend object:
```
{
  trend: string,
  category: enum (technology, consumer_behavior, regulatory, economic, competitive, societal),
  direction: enum (accelerating, stable, decelerating),
  time_horizon: enum (now, 6_months, 1_year, 3_years),
  opportunity_or_threat: enum (opportunity, threat, both),
  impact_on_company: string,
  recommended_action: string,
  confidence: enum (high, medium, low)
}
```

---

## Section 6: Monitoring Configuration

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| monitoring_frequency | string | Deep | Market type | Scheduler |
| regulatory_scan_frequency | string | Deep (if regulated) | Regulation status | Scheduler |
| key_signals_to_watch | string[] | Deep | Analysis | Monitoring |

---

## Coverage Calculation

```
Lite threshold:
  industry + vertical identified +
  tam + sam estimated +
  maturity assessed +
  regulated status determined +
  marketing_restrictions listed (if regulated) +
  trends (3+) with direction

Deep threshold:
  All Lite +
  tam + sam + som with bottom-up method +
  all market characteristics classified +
  full regulatory scan with impact assessment +
  trends (5-10) with time horizons and actions +
  adjacent_markets identified +
  monitoring configured
```

---

## Storage

- **Tier 1 (always loaded)**: industry, vertical, tam, sam, maturity, regulated, marketing_restrictions, top 3 trends
- **Tier 2 (loaded when relevant)**: Full market characteristics, regulatory details, all trends, sizing methodology
- **Tier 3 (raw)**: Source reports, research outputs, individual data points

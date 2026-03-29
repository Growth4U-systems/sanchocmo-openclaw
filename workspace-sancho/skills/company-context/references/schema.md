# Company Context Profile — Schema

Complete field-by-field specification. Each field: data type, required level, source priority, and which downstream pillars consume it.

---

## Section 1: Identity

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| company_name | string | REQUIRED | URL > Docs > User | All pillars |
| legal_name | string | optional | Legal page > Docs | compliance only |
| founded_year | number | Lite | About page > Docs > User | market-intel (maturity) |
| location_hq | string | Lite | About page > Legal > User | market-intel, competitor-intel |
| markets_served | string[] | Lite | About page > User | market-intel (geography) |
| legal_entity_type | string | optional | Legal page > User | compliance only |
| url_primary | url | Lite | User > Inferred | self-intelligence, SEO audit |
| urls_social | object | Lite | URL footer > User | company-profile, self-intelligence |

---

## Section 2: What They Do (Product/Service)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| elevator_pitch | string (1 sentence) | REQUIRED | Homepage H1 > Meta description > User | positioning, brand-voice, content |
| product_description | string (2-3 paragraphs) | Lite | Features page > About > User | positioning, competitor-intel |
| product_type | enum: SaaS, Service, Marketplace, Physical, Hybrid | Lite | Pricing page > User | business-model, funnel routing |
| key_features | string[] | Deep | Features page > Docs > User | positioning, competitor-intel |
| use_cases | string[] | Deep | Use cases page > Blog > User | ICP/niche discovery, content |
| differentiator_10x | string | REQUIRED | User (hard to infer) | positioning-messaging |

---

## Section 3: Business Model

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| b2b_b2c | enum: B2B, B2C, B2B2C, Hybrid | REQUIRED | Pricing page > User | All downstream routing |
| revenue_model | enum: Subscription, Transaction, Freemium, One-time, Custom, Marketplace-fee | Lite | Pricing page > User | pricing-hooks, business-model |
| pricing_tiers | object[] | Deep | Pricing page > User | pricing-hooks |
| avg_ticket | number (EUR) | Deep | User | diagnostic scoring, pricing |
| ltv_estimate | number (EUR) | Deep | User | diagnostic scoring, revenue |
| revenue_streams | string[] | Deep | User | business-model |

---

## Section 4: Goals, Vision & North Star Metric

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| north_star_metric | object {name, definition, baseline, target, timeframe} | REQUIRED | User (guided by business model) | ALL agents — defines success for this client |
| goal_3_6_months | string | REQUIRED | User | foundation-orchestrator (Lite/Deep), phase routing |
| goal_quantified | string | Lite | User | diagnostic scoring, goals tracking |
| vision_3_5_years | string | Deep | Pitch deck > User | positioning-messaging (narrative) |
| non_negotiables | string[] | Deep | User | brand-voice, content guardrails |
| marketing_constraints | string[] | Deep | User | budget-constraints, channel selection |

---

## Section 5: Current State

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| current_channels | object[] {name, status, volume_estimate} | Lite | User + URL inference | diagnostic scoring (Traffic) |
| monthly_leads | number | Deep | User | diagnostic scoring (Funnel) |
| monthly_customers | number | Deep | User | diagnostic scoring (Revenue) |
| acquisition_source_primary | string | Lite | User | phase routing, channel strategy |
| has_analytics | boolean | Lite | URL inference (GTM/GA check) | diagnostic scoring (Funnel) |
| has_crm | boolean | Lite | User | customer-data pillar routing |
| existing_strategy_docs | boolean | Lite | User/Docs | extraction before questioning |

---

## Section 6: Brand & Culture

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| brand_values | string[] (3-5) | Deep | About page > User | brand-voice-quick, content |
| tone_keywords | string[] (3 adjectives) | Deep | URL inference > User | brand-voice-quick |
| content_themes | string[] | Deep | Blog > Social > User | content-workflow |
| industry_vertical | string | Lite | URL inference > User | market-intel, competitor-intel |

---

## Section 7: Team & Operations (lightweight)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| team_size | number | optional | LinkedIn > About > User | budget-constraints (capacity) |
| marketing_team_size | number | optional | User | budget-constraints (capacity) |
| decision_maker | string | optional | User | meeting scheduling |
| contact_cadence | string | optional | User | project management |

---

## Coverage Calculation

```
coverage = filled_required_fields / total_required_fields * 100

Lite threshold:  all REQUIRED + all Lite fields filled = Lite done
Deep threshold:  all REQUIRED + all Lite + all Deep fields filled = Deep done
```

Fields marked "optional" do not count toward coverage — they're captured if available but don't block progression.

---

## Storage

- **Tier 1 (always loaded)**: elevator_pitch, b2b_b2c, revenue_model, north_star_metric, goal_3_6_months, differentiator_10x, industry_vertical
- **Tier 2 (loaded when relevant)**: Full profile (all sections)
- **Tier 3 (raw)**: Source URLs, extraction timestamps, validation log

The Tier 1 subset (~100 words) is included in every Sancho system prompt for this client, ensuring basic context is always available without loading the full profile.

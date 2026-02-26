# Business Model Profile — Schema

Complete field-by-field specification for the business-model-audit pillar.

---

## Section 1: Model Classification

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| b2b_b2c | enum: B2B, B2C, B2B2C, Hybrid | REQUIRED | company-context > User | All downstream routing |
| revenue_model | enum: Subscription, Transaction, Marketplace, Freemium, Usage-based, One-time, Hybrid | REQUIRED | Pricing page > User | pricing-hooks, funnel design |
| revenue_model_secondary | same enum | Deep | User | Full model picture |
| product_delivery | enum: Web, Mobile, Physical, Hybrid | Lite | company-context > User | Channel feasibility |

---

## Section 2: Unit Economics

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| avg_ticket_monthly | number (EUR) | Lite | User > Pricing page | Diagnostic scoring, CAC viability |
| avg_contract_value_annual | number (EUR) | Deep | Calculated or User | Channel ROI thresholds |
| ltv_estimate | number (EUR) | Deep | Calculated: ARPA × Margin / Churn | Diagnostic scoring, budget planning |
| cac_estimate | number (EUR) | Deep | User or calculated | LTV:CAC ratio, channel viability |
| cac_payback_months | number | Deep | Calculated: CAC / (ARPA × Margin) | Budget sustainability assessment |
| ltv_cac_ratio | number | Deep | Calculated | Health check flag |
| gross_margin_pct | number (%) | Deep | User | LTV calculation accuracy |
| churn_rate_monthly | number (%) | Deep | User | LTV calculation, retention priority |
| net_revenue_retention | number (%) | Deep | User | Expansion revenue potential |
| expansion_revenue_pct | number (%) | Deep | User | Retention vs acquisition strategy |

---

## Section 3: Growth Motion

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| growth_motion | enum: PLG, MLG, Sales-led, Community-led, Partner-led, Hybrid | REQUIRED | Analysis of pricing + signup flow + ACV | Phase 2/3 channel selection |
| self_serve_signup | boolean | Lite | URL analysis > User | PLG viability |
| pricing_visible | boolean | Lite | URL analysis | PLG vs Sales-led signal |
| trial_or_free_tier | boolean | Lite | URL analysis | Funnel architecture |
| sales_cycle_length | enum: days, weeks, months, quarters | Deep | User | Campaign timing, content type |
| decision_maker_level | enum: individual, manager, director, c-suite, committee | Deep | User | Outreach targeting, content depth |

---

## Section 4: Current Funnel

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| funnel_exists | boolean | REQUIRED | User | Phase 2 scope (build vs optimize) |
| funnel_steps | object[] {name, conversion_rate, measurement_status} | Lite | User | Diagnostic scoring, bottleneck ID |
| primary_traffic_sources | string[] | Lite | User + Analytics | Channel strategy baseline |
| bottleneck_step | string | Lite | Analysis of funnel_steps | phase-0-diagnostic, Phase 2 priority |
| monthly_visitors | number | Deep | Analytics > User estimate | Traffic baseline |
| monthly_leads | number | Deep | CRM > User estimate | Conversion baseline |
| monthly_customers | number | Deep | CRM > User estimate | Revenue baseline |
| funnel_measurement | enum: full_analytics, partial, spreadsheet, gut_feeling, none | Lite | User | Phase 2 analytics setup priority |

---

## Section 5: Competitor Growth Comparison

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| competitor_motions | object[] {name, motion, pricing_visible, trial_exists} | Deep | Competitor intelligence > URL analysis | Differentiation, motion validation |
| motion_market_pattern | string | Deep | Analysis | Strategic opportunity identification |
| motion_fit_assessment | enum: aligned, misaligned, opportunity | Deep | Analysis | Recommendation urgency |

---

## Section 6: Sector Benchmarks

Use these to contextualize client metrics. When a client says "our CAC is 500 EUR", compare against their sector. All figures in EUR unless noted.

### CAC by Sector and Model

| Sector | B2B CAC Range | B2C CAC Range | Key Driver |
|--------|--------------|--------------|------------|
| **FinTech — Neobank/Payments** | 800-2,500 | 15-80 | Compliance + trust building |
| **FinTech — Crypto/Exchange** | 300-1,200 | 20-120 | Market volatility, regulatory |
| **FinTech — Lending/Credit** | 500-3,000 | 50-200 | Risk assessment, underwriting |
| **FinTech — InsurTech** | 400-2,000 | 30-150 | Long sales cycles, trust |
| **B2B SaaS (SMB)** | 200-700 | — | Self-serve, low-touch |
| **B2B SaaS (Mid-Market)** | 1,000-5,000 | — | Demo + sales-assist |
| **B2B SaaS (Enterprise)** | 5,000-50,000+ | — | ABM + field sales |
| **E-commerce** | — | 30-90 | Performance marketing |
| **Marketplace** | 200-1,000 (supply) | 20-150 (demand) | Supply-side 3-10x more expensive |
| **EdTech** | 300-1,500 | 20-80 | Content marketing heavy |
| **HealthTech** | 1,000-5,000 | 50-200 | Regulatory + trust |

### LTV:CAC Targets by Stage

| Company Stage | Minimum Viable | Healthy | Underinvesting |
|--------------|---------------|---------|----------------|
| Pre-PMF | 1:1 acceptable | 2:1 | N/A |
| PMF achieved | 2:1 | 3:1-4:1 | >6:1 |
| Scaling | 3:1 | 4:1-5:1 | >8:1 |
| Mature | 3:1 | 5:1+ | >10:1 |

### CAC Payback Benchmarks

| Model Type | Good | Acceptable | Danger Zone |
|-----------|------|------------|-------------|
| PLG (ACV < 5K) | < 6 months | 6-12 months | > 12 months |
| MLG (ACV 5-50K) | < 12 months | 12-18 months | > 18 months |
| Sales-Led (ACV 50K+) | < 18 months | 18-24 months | > 24 months |
| Transactional | Break-even 1st month | 1-3 months | > 6 months (cohort) |
| Marketplace | Break-even 3 months | 3-6 months | > 12 months |

### Conversion Rate Benchmarks

| Funnel Step | Bottom 25% | Median | Top 25% |
|------------|-----------|--------|---------|
| Website → Lead (B2B) | < 1% | 2.5% | > 5% |
| Website → Signup (PLG) | < 2% | 4% | > 8% |
| Lead → MQL | < 15% | 30% | > 50% |
| MQL → SQL | < 10% | 20% | > 35% |
| SQL → Customer | < 15% | 25% | > 40% |
| Free → Paid (freemium) | < 2% | 3-5% | > 7% |
| Trial → Paid (opt-out) | < 30% | 50% | > 65% |
| Trial → Paid (opt-in) | < 15% | 25% | > 40% |

### Key SaaS Metrics (2025 Benchmarks)

| Metric | Bottom Quartile | Median | Top Quartile |
|--------|----------------|--------|-------------|
| Monthly churn (SMB) | > 5% | 3-5% | < 2% |
| Monthly churn (Enterprise) | > 2% | 1-2% | < 0.5% |
| Net Revenue Retention | < 95% | 106% | > 120% |
| Gross margin | < 60% | 72% | > 80% |
| CAC payback (months) | > 24 | 18 | < 12 |
| Rule of 40 | < 20% | 30% | > 40% |

### FinTech-Specific Metrics

| Metric | Benchmark | Source |
|--------|-----------|--------|
| Activation rate (B2C neobank) | 25-40% (signup → first transaction) | Industry avg |
| Activation rate (B2B payments) | 15-30% (signup → first API call) | Industry avg |
| Time to first value (B2C) | < 7 days target | Best practice |
| Time to first value (B2B) | < 30 days target | Best practice |
| Regulatory approval timeline | 2-4 weeks per campaign | Spain/EU |
| Trust signal minimum | License + 1 certification + volume proof | Table stakes |

---

## Coverage Calculation

```
Lite threshold: b2b_b2c + revenue_model + growth_motion + funnel_exists +
                funnel_steps (at least 2) + primary_traffic_sources

Deep threshold: All Lite + unit economics (LTV, CAC, payback) +
                full funnel with conversion rates + competitor motions +
                motion_fit_assessment
```

---

## Storage

- **Tier 1 (always loaded)**: b2b_b2c, revenue_model, growth_motion, bottleneck_step
- **Tier 2 (loaded when relevant)**: Full profile including unit economics and funnel
- **Tier 3 (raw)**: Competitor pricing screenshots, funnel analytics exports

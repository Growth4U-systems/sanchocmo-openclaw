# Competitor Intelligence — Schema

Complete field-by-field specification for the competitor-intelligence pillar.

---

## Section 0: Competitor Discovery

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| competitors | object[] | REQUIRED | Discovery + user input | All downstream |
| total_direct | number | REQUIRED | Count | Completeness |
| total_indirect | number | REQUIRED | Count | Completeness |
| total_emerging | number | Lite | Count | Monitoring |

Competitor discovery object:
```
{
  name: string,
  url: string,
  type: enum (direct, indirect, emerging),
  tier: enum (A, B, C),
  monitoring_frequency: enum (weekly, monthly, quarterly),
  brief_description: string,     // 1-sentence description
  overlap_with_ecps: string[]    // Which ECPs they compete on
}
```

---

## Section 1: Per-Competitor Profile Discovery

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| digital_profiles | object[] {platform, url, username, status} | REQUIRED | Manual + research | Scraping |
| platforms_found | number | REQUIRED | Count | Completeness |
| platforms_with_ads | object[] {platform, library_url} | Lite | Ad library search | Growth model |

---

## Section 2: Lens 1 — Autopercepción

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| stated_value_prop | string | REQUIRED | Homepage/hero | Battle Card |
| target_audience_stated | string | REQUIRED | Messaging analysis | Positioning |
| target_audience_implied | string | Lite | Content analysis | Positioning |
| key_features_emphasized | string[] (3-5) | REQUIRED | Product pages | Feature heatmap |
| features_hidden | string[] | Lite | Gap analysis | Vulnerabilities |
| pricing_model | string | REQUIRED | Pricing page | Pricing landscape |
| pricing_tiers | object[] {name, price, features} | Lite | Pricing page | Pricing comparison |
| content_strategy | object {topics, frequency, channels, dominant_format} | Lite | Content analysis | Content gaps |
| paid_ads_active | boolean | REQUIRED | Ad library | Growth model |
| paid_ads_messages | string[] | Lite | Ad library | Messaging |
| paid_ads_offers | string[] | Lite | Ad library | Hooks |
| tone_profile | object {primary, secondary} | Lite | Cross-channel | Brand comparison |
| growth_model | enum (PLG, sales_led, content, paid, community, hybrid) | REQUIRED | Evidence analysis | Growth model map |
| growth_model_evidence | string[] | Lite | Observed signals | Confidence |

---

## Section 3: Lens 2 — Percepción de Terceros

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| media_narrative | string | REQUIRED | News/press synthesis | Battle Card |
| media_sentiment | enum (positive, neutral, negative, mixed) | REQUIRED | Analysis | Triangulation |
| influencer_mentions | object[] {creator, platform, sentiment, reach} | Lite | Social search | Influence mapping |
| seo_visibility | object {domain_authority, top_keywords, ranking_gaps} | Lite | SEO tools | Competitive SEO |
| industry_position | string | Lite | Reports/rankings | Market positioning |
| narrative_vs_lens1 | enum (aligned, partially_aligned, misaligned) | REQUIRED | Comparison | Gap detection |

---

## Section 4: Lens 3 — Percepción del Consumidor

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| review_platforms | object[] {platform, avg_rating, review_count, url} | REQUIRED | Review scrapers | Viability |
| weighted_avg_rating | number (1-5) | REQUIRED | Calculated | Battle Card |
| sentiment_trend | enum (improving, stable, declining) | Lite | Time-series | Monitoring |
| top_pros | string[] (3-5) | REQUIRED | Review analysis | Battle Card |
| top_cons | string[] (3-5) | REQUIRED | Review analysis | Battle Card, positioning |
| unmet_needs | string[] | REQUIRED | Review + social analysis | Positioning opportunities |
| migration_from | string[] | Lite | Review mentions | Competitor dynamics |
| migration_to | string[] | Lite | Review mentions | Churn risk mapping |
| customer_profiles | object[] {type, company_size, use_case} | Deep | Reviewer data | ECP validation |
| review_volume | enum (sufficient, sparse, none) | REQUIRED | Count assessment | Confidence |
| lens_conflicts | object[] {claim_lens1, reality_lens3, severity} | REQUIRED | Cross-lens analysis | Vulnerabilities |

---

## Section 5: Battle Card (per competitor)

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| quick_profile | object {founded, hq, team_size, funding, growth_model} | REQUIRED | Research | Quick reference |
| real_positioning | object {value_prop, target_audience, strengths, pricing} | REQUIRED | Lens synthesis | Positioning |
| vulnerabilities | object[] {claim, reality, severity, opportunity} | REQUIRED | Lens 1 vs 3 gaps | Positioning-messaging |
| how_to_beat | object | REQUIRED | Synthesis | Sales enablement |
| monitoring_triggers | string[] | Lite | Analysis | Monitoring |

How to beat object:
```
{
  their_weakness_our_strength: string[],
  positioning_angle: string,
  do_not_compete_on: string[],
  sales_talking_points: string[] (3-5)
}
```

---

## Section 6: Competitive Landscape Map

| Field | Type | Required | Source | Consumed By |
|-------|------|----------|--------|-------------|
| overview_table | object[] | REQUIRED | All Battle Cards | Executive summary |
| positioning_map | object {axis_x, axis_y, placements} | Deep | Analysis | Visual strategy |
| feature_heatmap | object {features, competitors, ratings} | Deep | All Lens 1 data | Feature gaps |
| growth_model_comparison | object[] {competitor, model, channels} | Lite | All Battle Cards | Channel strategy |
| pricing_landscape | object[] {competitor, model, tiers, positioning} | Lite | All Lens 1 pricing | Pricing strategy |
| cross_competitor_patterns | object | Deep | Synthesis | Opportunity mapping |
| opportunity_summary | object[] (3-5) {opportunity, evidence, action} | REQUIRED | Synthesis | All downstream |

Cross-competitor patterns object:
```
{
  universal_claim_reality_gaps: string[],  // What everyone claims but nobody delivers
  aggregate_unmet_needs: string[],          // What customers want, nobody offers
  unused_positioning_angles: string[],      // Angles nobody is exploiting
  unexploited_channels: string[]            // Channels nobody is using
}
```

---

## Coverage Calculation

```
Lite threshold:
  3+ direct competitors discovered and categorized +
  3 lens profiles per direct competitor +
  Battle Card per direct competitor +
  2+ indirect alternatives with Lens 1 +
  growth_model per competitor +
  monitoring tiers assigned +
  opportunity_summary (3+)

Deep threshold:
  All Lite +
  5+ direct competitors fully analyzed +
  indirect + emerging catalogued +
  full Competitive Landscape Map +
  positioning_map + feature_heatmap +
  pricing_landscape complete +
  cross_competitor_patterns identified +
  monitoring triggers per competitor
```

---

## Storage

- **Tier 1 (always loaded)**: Competitor list (name, type, tier), stated_value_prop per competitor, weighted_avg_rating per competitor, opportunity_summary
- **Tier 2 (loaded when relevant)**: Full Battle Cards, Competitive Landscape Map, feature heatmap, pricing landscape
- **Tier 3 (raw)**: Individual review texts, social media posts, ad screenshots, scraping logs, full Deep Research outputs

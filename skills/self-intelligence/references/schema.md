# Self-Intelligence Profile — Schema

Complete field-by-field specification for the self-intelligence pillar. Matches the 5-prompt pipeline output (Autopercepcion + Terceros + RRSS + Reviews + Sintesis).

---

## Section 0: Profile Discovery

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| digital_profiles | object[] {platform, url, username, status} | REQUIRED | Manual + Deep Research | All scrapers |
| platforms_found | number | REQUIRED | Count | Completeness tracking |
| platforms_missing | string[] | Lite | Analysis | Digital expansion opportunities |

Platforms checked: Instagram, Facebook, LinkedIn, YouTube, TikTok, Twitter/X, Trustpilot, G2, Capterra, App Store, Play Store.

---

## Section 1: Deep Research Output

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| market_research | object {market_size, growth_rate, segments, geography, maturity} | Deep | `/deep-research`: Market | Context for all lenses |
| company_research | object | REQUIRED | `/deep-research`: Company | All lenses |

Company research object:
```
{
  digital_footprint: string[],       // All discovered URLs
  products: object[],                // Product catalog with descriptions
  brand_image: string,               // Synthesized brand perception
  tone_of_voice: string,             // Primary tone classification
  value_proposition: string,         // UVP statement
  usps: string[],                    // Unique selling points
  problem_solution_map: object[],    // {problem, solution}
  icps: object[],                    // Ideal Customer Profiles
  jtbd: string[],                    // Jobs to be done
  purchase_motivations: string[],    // Why customers choose them
  marketing_channels: string[],     // Active marketing channels
  content_types: string[],          // Dominant content formats
  strengths: string[],              // Evidenced strengths
  weaknesses: string[],             // Evidenced weaknesses
  secret_sauce: string              // Unique competitive formula
}
```

---

## Section 2: Autopercepcion (Lens 1)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| core_message | string | REQUIRED | Website + social analysis | positioning-messaging |
| value_proposition_stated | string | REQUIRED | Homepage H1 > Meta desc | Triangulation |
| tone_profile | object {primary, secondary, examples} | Lite | Cross-channel analysis | brand-voice |
| positioning_declared | string | REQUIRED | Website + ads | Triangulation |
| differentiators_claimed | string[] | Lite | Feature pages > Homepage | positioning-messaging |
| implied_target_segment | string | Lite | Messaging analysis | ICP validation |
| channel_consistency | enum: consistent, minor_gaps, major_gaps | REQUIRED | Cross-channel comparison | brand-voice priority |
| channel_priority | string | Lite | Activity analysis | Content strategy |
| content_themes | string[] | Lite | Content analysis | content-workflow |
| content_avoided | string[] | Deep | Gap analysis | Content opportunity |
| social_platforms | object[] {platform, followers, frequency, engagement_rate} | Lite | Platform analysis | social-content |

---

## Section 3: Percepcion de Terceros (Lens 2)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| seo_visibility | object {domain_authority, top_keywords, ranking_gaps} | Lite | SEO/SERP scraper | seo-audit, content-strategy |
| media_coverage | object[] {outlet, topic, sentiment, date} | Lite | News corpus scraper | PR assessment |
| media_sentiment | enum: positive, neutral, negative, mixed | REQUIRED | Analysis | Triangulation |
| industry_recognition | string[] | Deep | Awards, rankings, citations | Trust signals |
| external_narrative | string | REQUIRED | Synthesis | Triangulation |
| narrative_vs_autopercepcion | enum: aligned, partially_aligned, misaligned | REQUIRED | Comparison | Gap identification |
| media_footprint | enum: strong, moderate, minimal, invisible | REQUIRED | Analysis | market-intel |

---

## Section 4: Percepcion del Consumidor — RRSS (Lens 3a)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| overall_sentiment_rrss | enum: positive, neutral, negative, mixed | REQUIRED | Comment analysis | Triangulation |
| engagement_level | enum: high, moderate, low | Lite | Metrics | Social strategy |
| brand_advocates | boolean | Deep | Comment patterns | Referral potential |
| recurring_themes_positive | string[] | Lite | Comment analysis | positioning-messaging (proof) |
| recurring_themes_negative | string[] | Lite | Comment analysis | Product feedback |
| pain_points_rrss | string[] | REQUIRED | Comment analysis | niche-discovery-100x |
| feature_requests | string[] | Deep | Comment analysis | Product roadmap |
| competitor_mentions | object[] {competitor, context, sentiment} | Deep | Comment analysis | competitor-intelligence |
| sentiment_by_channel | object {platform: sentiment} | Deep | Per-channel analysis | Channel strategy |

---

## Section 5: Percepcion del Consumidor — Reviews (Lens 3b)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| review_platforms | object[] {platform, avg_rating, review_count, url} | REQUIRED | Review scrapers | Viability checkpoint |
| weighted_avg_rating | number (1-5) | REQUIRED | Calculated | Viability, diagnostic |
| rating_trend | enum: improving, stable, declining | Lite | Time-series | Urgency assessment |
| top_pros | string[] (3-5) | REQUIRED | Review analysis | positioning-messaging (proof) |
| top_cons | string[] (3-5) | REQUIRED | Review analysis | Product feedback, messaging guardrails |
| reviewer_profiles | object[] {type, company_size, use_case} | Deep | Reviewer data | ICP validation |
| migration_from | string[] | Deep | Review mentions | Competitor intelligence |
| migration_to | string[] | Deep | Review mentions | Churn risk |
| customer_quotes | object[] {quote, source, theme, sentiment} | Deep | Review extraction | Social proof, messaging |
| review_volume | enum: sufficient, sparse, none | Lite | Count assessment | Confidence level |

---

## Section 6: Sintesis (Triangulation)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| triangulation_table | object[] {aspect, autopercepcion, terceros, consumidores, realidad} | REQUIRED | Cross-lens analysis | Executive summary |
| confirmed_strengths | string[] | REQUIRED | Multi-source confirmation | positioning-messaging (real assets) |
| confirmed_weaknesses | string[] | REQUIRED | Multi-source confirmation | Product feedback, messaging guardrails |
| perception_reality_gaps | object[] {promise, reality, severity} | REQUIRED | Lens 1 vs Lens 3 | positioning-messaging (honest messaging) |
| primary_gap | string | REQUIRED | Analysis | #1 action item |
| priority_fixes | string[] (ordered) | Lite | Analysis | Roadmap |
| viability_status | enum: PASS, WARNING | REQUIRED | Checkpoint rules | foundation-orchestrator routing |
| viability_reason | string | Required if WARNING | Analysis | Recommendation |
| positioning_opportunities | string[] | Deep | Cross-lens analysis | positioning-messaging |

---

## Coverage Calculation

```
Lite threshold: digital_profiles complete +
                company_research done +
                autopercepcion (core_message + positioning + consistency) +
                at least 1 of (terceros OR reviews) +
                triangulation_table + primary_gap + viability_status

Deep threshold: All Lite +
                market_research done +
                all 5 analysis prompts completed +
                all available platforms scraped +
                customer_quotes (10+) +
                sentiment_by_channel +
                reviewer_profiles +
                priority_fixes ordered +
                positioning_opportunities identified
```

---

## Storage

- **Tier 1 (always loaded)**: value_proposition_stated, weighted_avg_rating, primary_gap, viability_status, confirmed_strengths[0:3], confirmed_weaknesses[0:3]
- **Tier 2 (loaded when relevant)**: Full profile across all sections, triangulation table
- **Tier 3 (raw)**: Individual review texts, social media comments, screenshot captures, full Deep Research reports

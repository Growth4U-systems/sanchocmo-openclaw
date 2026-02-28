# Market Intelligence — Schema

> Campo por campo. Coherente con prompt.md (v3). NO incluye SAM/SOM (eso va en niche-discovery).

---

## Section 1: Market Overview

| Field | Type | Required | Consumed By |
|-------|------|----------|-------------|
| industry | string | ✅ | All downstream |
| vertical | string | ✅ | All downstream |
| niche | string | Lite | Positioning |
| adjacent_markets | string[] | Deep | Phase 3 |
| tam | Sizing object | ✅ | Budget, niche-discovery |
| tam_segments | Segment[] | ✅ | Niche-discovery |
| geography | Geography object | ✅ | Channel strategy |
| maturity | enum (emerging, growing, mature, declining) | ✅ | Strategy |
| maturity_evidence | string[] | ✅ | Confidence |
| growth_historical | string | ✅ | Trend context |
| growth_projection_5yr | string | ✅ | Planning |

### Sizing object
```json
{
  "value": 345,
  "currency": "EUR",
  "unit": "M",
  "year": 2025,
  "method": "top_down",
  "confidence": "medium",
  "assumptions": ["..."],
  "sources": ["url1", "url2"]
}
```

### Segment object
```json
{
  "name": "Tratamientos no quirúrgicos",
  "size_pct_of_tam": 35,
  "characteristics": "...",
  "growth_potential": "high"
}
```

---

## Section 2: Competitive Intelligence

| Field | Type | Required | Consumed By |
|-------|------|----------|-------------|
| leaders | Actor[] (5-10) | ✅ | Competitor-intelligence |
| niche_actors | Actor[] | Deep | Positioning |
| new_entrants | Actor[] | Deep | Threats |
| market_concentration | enum (fragmented, moderate, consolidated) | ✅ | Strategy |
| market_share_distribution | string | ✅ (or "not publicly available") | Context |
| dominant_strategies | string[] | ✅ | Positioning |
| social_benchmarking | SocialBenchmark object | Deep | Content strategy |
| threats | Threat[] | ✅ | SWOT |

### Actor object
```json
{
  "name": "Insparya",
  "revenue": "€20.7M (2024)",
  "employees": 217,
  "locations": 5,
  "model": "Cirugía (celebrity endorsement)",
  "strategy": "Premium pricing, brand awareness via CR7",
  "source": "url"
}
```

---

## Section 3: Customer Segmentation

| Field | Type | Required | Consumed By |
|-------|------|----------|-------------|
| segments | CustomerSegment[] (3-5) | ✅ | ICP, content, ads |
| personas | Persona[] (3-5) | ✅ | Messaging, content |
| customer_journey | Journey object | Deep | Funnel design |
| pain_points | PainPoint[] | ✅ | Positioning, content |

### CustomerSegment object
```json
{
  "name": "Mujer con pérdida capilar",
  "demographics": { "age": "25-55", "gender": "F", "income": "medio-alto" },
  "psychographics": { "values": ["..."], "attitudes": ["..."] },
  "behavioral": { "purchase_frequency": "...", "preferred_channels": ["..."] },
  "needs": { "functional": ["..."], "emotional": ["..."] },
  "social_behavior": { "platforms": ["..."], "content_habits": ["..."] }
}
```

### Persona object
```json
{
  "name": "María, 38",
  "segment": "Mujer con pérdida capilar",
  "summary": "...",
  "motivations": ["..."],
  "pain_points": ["..."],
  "messaging_strategy": "..."
}
```

---

## Section 4: Trends

| Field | Type | Required | Consumed By |
|-------|------|----------|-------------|
| trends | Trend[] (5-10) | ✅ | SWOT, strategy |
| driving_forces | DrivingForce[] | ✅ | Context |
| consumer_behavior_changes | string[] | ✅ | Content, messaging |
| platform_evolution | string[] | Deep | Content strategy |
| regulations | Regulation[] | ✅ (if regulated) | Compliance, content guardrails |

### Trend object
```json
{
  "trend": "Exosomas en regeneración capilar",
  "category": "technology",
  "direction": "accelerating",
  "time_horizon": "now",
  "type": "opportunity",
  "impact": "...",
  "recommended_action": "...",
  "source": "url"
}
```

### Regulation object
```json
{
  "name": "RD 1907/1996",
  "jurisdiction": "España",
  "status": "active",
  "impact_level": "high",
  "marketing_restrictions": {
    "prohibited": ["Garantizar resultados", "Antes/después sin consentimiento"],
    "required_disclaimers": ["Resultados individuales"],
    "examples_allowed": ["Comunicar proceso diagnóstico"],
    "examples_prohibited": ["Recuperarás tu pelo"]
  },
  "enforcement": "estricto",
  "source": "url"
}
```

---

## Section 5: Opportunities

| Field | Type | Required | Consumed By |
|-------|------|----------|-------------|
| market_gaps | string[] | ✅ | Strategy |
| growth_opportunities | Opportunity[] | ✅ | Roadmap |
| market_attractiveness | enum (high, medium, low) | ✅ | Investment |
| roadmap | RoadmapItem[] | ✅ | Execution |

### Opportunity object
```json
{
  "opportunity": "Vertical mujer",
  "impact": "high",
  "effort": "medium",
  "timeline": "short",
  "rationale": "..."
}
```

---

## Cross-Pillar Data Flow

| Field | Consumed By |
|-------|-------------|
| TAM | budget-constraints, niche-discovery-100x |
| Maturity | Phase 0 diagnostic, positioning-messaging |
| Regulations + marketing_restrictions | ALL content skills (paid-ads, landing, social, email) |
| Trends (opportunities) | swot-analysis (Opportunities) |
| Trends (threats) | swot-analysis (Threats) |
| Segments | niche-discovery-100x, content strategy |
| Competitive dynamics | competitor-intelligence, positioning |
| Adjacent markets | Phase 3, niche-discovery expansion |

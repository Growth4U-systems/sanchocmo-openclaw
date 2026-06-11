# Positioning & Messaging Profile — Schema

Complete field-by-field specification for the positioning-messaging pillar. Manages both per-niche documents and Tier 2 shared documents.

---

## Tier 2 Shared Documents

Stored in `brand/{slug}/positioning/shared/`. Shared across ALL niches.

### Value Criteria (`shared/value-criteria.md`)

**Format: ONE consolidated table + per-criteria explanations.**

#### Table format:
```
| # | Value Criteria | Imp. | G4U | Comp1 | Comp2 | ... | DIY | Nada | Zone | ECPs |
```
- ECPs column: links to per-ECP docs (e.g. `[1](../ecp1-slug/ecp1-slug-current.md)`)
- Zone: 🟢 Opp | 🟡 Cont | 🔴 Red

#### Per-criteria explanation format (below the table):
```
### #N Value Criteria Name (Imp. X) — Zone

**Justification:** What this criteria means and why it matters.
Independent of any specific ECP. Evidence-based.

**Scores:**
- **G4U: X** — Detailed explanation with evidence and source.
- **Comp1: X** — Detailed explanation with evidence and source.
- ...
```

**Rules:**
- Explanations organized BY CRITERIA, never grouped by ECP
- If a score changes per ECP, note it INLINE: "⚠️ In ECP 2, rises to 5 because..."
- Each score explanation includes evidence + source reference
- Justification paragraph is the "why this criteria matters" (not scores)

#### Schema:
```
{
  criteria_id: number,              // Auto-increment, unique across all niches
  criteria: string,                 // Short Noun Phrase (2-5 words)
  dimension: enum (compliance_reliability / operational_efficiency / financial_intelligence / ecosystem_connectivity / emotional_drivers),
  importance: number,               // 1-10
  justification: string,            // What it means and why it matters (ECP-independent)
  ecps_applicable: string[],        // Which ECPs — as links to per-ECP docs
  scores: {                         // Competitive scores (0-5) with explanation per score
    [competitor_name]: { score: number, explanation: string }
  },
  opportunity_type: enum (red_ocean / no_market / opportunity_zone)
}
```

### Assets (`shared/assets.md`)

**Format: Registry table + per-asset global explanations.**

#### Table format:
```
| # | Asset | Category | Primary Criteria | ECPs |
```
- ECPs column: links to per-ECP docs
- Category: 🔵 Diff | ⚪ Qual | ⚪→🔵

#### Per-asset explanation format (below the table):
```
### AN — Asset Name

**Justification:** Why this asset provides strategic value. Global, not ECP-specific.
**Competitive Advantage:** What makes it unique vs competitors.
**User Benefit:** What the user gets from it.
**Proof:** Specific evidence, data, messages.
```

**Rules:**
- Justification, Benefit, and Proof are GLOBAL (same asset = same explanation)
- Per-ECP adaptation notes go in the per-ECP docs, NOT here
- If an asset applies to 5 ECPs, it still has ONE explanation here

#### Schema:
```
{
  asset_id: number,                 // Auto-increment, unique across all niches
  asset: string,                    // What the company has
  category: enum (qualifier / differentiator),
  primary_criteria: number[],       // Links to Value Criteria
  ecps_applicable: string[],        // Links to per-ECP docs
  justification: string,            // WHY it provides strategic value (global)
  competitive_advantage: string,    // What makes it unique (global)
  user_benefit: string,             // What the user gets (global)
  proof: string,                    // Specific evidence (global)
      proof: string,                // Specific proof with message to display
      proof_type: enum (testimonial / screenshot / tutorial / ad_message / comparative_table / report / case_study)
    }
  ],
  created_for_niche: string         // First niche that introduced it
}
```

---

## Per-Niche Documents

### Section 1: Niche Research Context

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| ecp_name | string | REQUIRED | niche-discovery-100x | Linkage |
| ecp_persona | string | REQUIRED | niche-discovery-100x | All prompts |
| problem_core | string (JTBD format) | REQUIRED | niche-discovery-100x | All prompts |
| ecp_need | string | REQUIRED | niche-discovery-100x | Value criteria |
| ecp_why_features | string | REQUIRED | niche-discovery-100x | Company analysis |
| deep_research_ref | string | REQUIRED | Step 1 output | Steps 2-7 |

---

### Section 2: Per-Niche Competitor Map

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| competitor_analyses | object[] | REQUIRED | Step 2 output | Value criteria scoring |

Each competitor analysis:
```
{
  name: string,
  type: enum (type_A / type_B / type_C / type_D),
  product_overview: string,         // With target segment focus
  relevant_features: string[],      // Features aligned with ECP
  feature_details: string,          // How features work
  operational_friction_addressed: string,
  emotional_friction_addressed: string
}
```

---

### Section 3: Own Company Analysis

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| company_overview | object | REQUIRED | Step 3 output | Asset mapping |

```
{
  history: string,
  business_model: string,
  uvp_stated: string,
  main_features: object[] {name, purpose, capabilities},
  ecp_features: object[] {name, summary, user_flow, friction_reduction},
  end_to_end_flow: string           // Full user flow for ECP use case
}
```

---

### Section 4: Competitive Positioning Map

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| scoring_map | object[] | REQUIRED | Step 4 output | Asset mapping, messaging |

Each row in the scoring map:
```
{
  criterion_id: number,             // Links to Tier 2 Value Criteria
  criterion: string,
  scores: {
    [competitor_type]: number (0-5),
    client: number (0-5),
    diy: number (0-5),
    do_nothing: number (0-5)
  },
  analysis: enum (red_ocean / no_market / opportunity_zone),
  analysis_detail: string
}
```

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| opportunity_zones | object[] (top 3-5) | REQUIRED | Step 4 analysis | Messaging focus |
| red_ocean_criteria | string[] | Lite | Step 4 analysis | Table stakes list |
| score_explanations | object[] {competitor, criterion, score, source} | Deep | Step 4 detail | Audit trail |

---

### Section 5: Asset Table

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| niche_assets | object[] | REQUIRED | Step 5 output | Benefit-proof |

Each asset entry (per niche):
```
{
  asset_id: number,                 // Links to Tier 2 Assets
  asset: string,
  value_criterion_id: number,       // Links to Tier 2 Value Criteria
  category: enum (qualifier / differentiator),
  justification: string
}
```

---

### Section 6: Benefit-Proof Table

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| proof_table | object[] | REQUIRED | Step 6 output | Messaging |

Each proof entry:
```
{
  asset_id: number,                 // Links to Tier 2 Assets
  asset: string,
  competitive_advantage: string,
  user_benefit: string,
  proof: string,                    // Specific: testimonial text, screenshot description, ad message
  proof_type: enum (testimonial / screenshot / tutorial / ad_message / comparative_table / report / case_study),
  message_to_display: string        // The actual message adapted to ECP
}
```

---

### Section 6.5: Objection Neutralization (NUEVO)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| objection_table | object[] | REQUIRED | Step 6.5 output | Messaging playbook |

Each objection entry:
```
{
  objection: string,                // The conversion barrier
  type: enum (precio / miedo / dolor / confianza / otro),
  reframe: string,                  // How to reframe the objection
  neutralization_message: string,   // The message that neutralizes it
  proof: string,                    // Supporting evidence
  suggested_format: string          // FAQ, testimonial, comparativa, garantía...
}
```

### Section 7: Messaging Playbook (Pain-Activated)

| Field | Type | Required | Source Priority | Consumed By |
|-------|------|----------|-----------------|-------------|
| uvp | object | REQUIRED | Step 7 output | All outbound |
| usps | object[] (4-5+) | REQUIRED | Step 7 output | All outbound |
| anti_objection_messages | object[] (1-2+) | REQUIRED | Step 7 output (from 6.5) | Landing pages, FAQ, ads |

UVP entry:
```
{
  message_category: "UVP Core Promise",
  hypothesis: string,               // Why this will work
  value_criterion_id: number,        // Links to Tier 2
  objective: string,
  message_short: string,            // Versión corta (ads, 1-2 líneas)
  message_landing: string           // Versión landing (story-driven, dolor→diagnóstico→puente)
}
```

USP entries (same structure, one per distinct strategic emphasis):
```
{
  message_category: string,         // e.g., "Anti-objeción: precio", "Diferenciador: diagnóstico"
  hypothesis: string,
  value_criterion_id: number,
  objective: string,
  message_short: string,            // Versión corta
  message_landing: string,          // Versión landing
  ab_variants: object[] | null      // Opcional: [{variant: "A", message_short, message_landing, hypothesis_tested}]
}
```

---

## Coverage Calculation

```
Lite threshold (per niche): Steps 1-4 complete +
                            3+ assets mapped with category +
                            messaging table with UVP + 3 USPs (2 formatos, dolor-activado)

Deep threshold (per niche): All steps (1-7 + 6.5) complete +
                            full competitive scoring map (all categories) +
                            complete asset inventory (qualifier/differentiator) +
                            full proof table with specific messages +
                            objection neutralization table +
                            complete pain-activated messaging playbook (UVP + 5+ USPs, 2 formatos) +
                            legal verification PASS +
                            statistical data sourced +
                            Tier 2 documents updated and cross-referenced
```

---

## Tier 2 Database Relationships

```
Value Criteria ←→ Assets (many-to-many via niche_connections)
Value Criteria ←→ Niches (many-to-many via niches_applicable)
Assets ←→ Niches (many-to-many via niche_connections)
Messaging ←→ Value Criteria (each message row links to a criterion)
```

When querying across niches:
- "Which assets are Differentiators across 3+ niches?" → strongest company assets
- "Which criteria are Opportunity Zones across all niches?" → universal messaging themes
- "Which criteria shift from Opportunity to Red Ocean per niche?" → niche-specific positioning needed

---

## Storage

- **Tier 1 (always loaded)**: Per-niche UVP + top 3 USPs (bilingual), opportunity_zones, primary differentiators
- **Tier 2 (loaded when relevant)**: Full positioning documents per niche, Value Criteria DB, Assets DB, complete scoring maps
- **Tier 3 (raw)**: Competitor feature screenshots, review quotes, pricing page captures, deep research documents

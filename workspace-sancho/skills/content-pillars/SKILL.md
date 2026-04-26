---
name: content-pillars
description: "Define and maintain Content Pillars for a client. Pillars = TOPICS the brand will own. POV is NOT decided here — POV lives at piece level during angle/clarify. Reads Foundation (ECPs, Positioning, Brand Voice) as input. Outputs content-pillars.md as readable markdown with rich context per pillar."
context_required:
- brand/{slug}/company-brief/company-brief.current.md
- brand/{slug}/brand-book/brand-voice/brand-voice.current.md
- brand/{slug}/go-to-market/ecps/ecps.current.md
- brand/{slug}/go-to-market/positioning/shared/messaging-summary.md
- brand/{slug}/go-to-market/positioning/shared/value-criteria.md
- brand/{slug}/strategic-plan/strategic-plan.current.md
context_writes:
- brand/{slug}/content/content-pillars.md
---

# Content Pillars

> Define 3-5 content pillars (TOPICS) for the client's Content Engine.
> Pillars = themes the brand will own. NOT POV — POV is decided per piece
> during angle/clarify.

## Before Starting

Read ALL Foundation context listed in `context_required`. Do NOT skip any.
If a file doesn't exist, note what's missing and proceed with what's available.

Also check for optional enrichment:
- `brand/{slug}/content/strategy-decisions.md` — if Content Strategy (14 decisions) was already executed, use it as additional input
- Transcripts via `meeting-intelligence` — if available, extract real customer pain quotes to validate/enrich pillars. OPTIONAL.

## Framework: Authority Pillars

Pillars are the intersection of:
1. **Customer Pain** — what problems does the ICP face? (from ECPs + Positioning)
2. **Brand Expertise** — what unique knowledge/experience does the brand have? (from company-brief + Brand Voice)
3. **Topic Defensibility** — can the brand credibly own this topic long-term?

Good pillars should:
- Align with the product/service
- Match what the audience cares about (validated by ECPs)
- Have enough depth for many subtopics (hub & spoke potential)
- Connect to the business model's funnel

## Workflow

### 1. Read Foundation
- Company brief: who they are, what they do, stage
- ECPs: all pain clusters + personas + JTBD + pain scores
- Positioning: UVPs per ECP, value criteria, messaging summary
- Brand Voice: tone, words, personality
- Strategic Plan: objectives, channels, target metrics

### 2. Extract Pillar Seeds
Take the per-niche content pillars from `positioning-messaging` (step 7 of
positioning) as the STARTING POINT. Do NOT duplicate — extend.

Cross-reference with:
- Pain clusters from ECPs (which pains are most common across personas? Use pain scores.)
- Expertise from company-brief (where is the brand's unfair knowledge advantage?)
- Strategic Plan objectives (which topics serve the current quarter's goals?)

### 3. Optional: Enrich with Transcripts
If `meeting-intelligence` output exists:
- Extract real customer quotes that validate or adjust pillar seeds
- Flag any pillar that has NO transcript validation (lower confidence)

### 4. Assign funnel_role per Pillar
Based on `business_model` from strategy-decisions.md or company-brief:

**B2B:**
- `top`: demand creation, thought leadership, ungated (LinkedIn, X)
- `middle`: audience building, newsletter, community
- `bottom`: capture, blog SEO, gated lead magnets

**B2C:**
- `top`: awareness, social, ungated
- `middle`: email capture, free resources gated
- `bottom`: product, cohort, conversion

### 5. Confirm with Human
Present 3-5 pillars. Ask human to confirm/edit. This is a DECISION step — wait for approval.

### 6. Output

Write `brand/{slug}/content/content-pillars.md` as **readable markdown** (NOT YAML).

**Output format** — follow this structure exactly:

```markdown
# Content Pillars — {Client Name}

> Generado: {date} | Status: approved
> Inputs: {list of Foundation docs used}
> Aprobado por: {human name}

---

## Resumen

{N} pillars que definen los temas que {Client} va a poseer en contenido.

| # | Pillar | Funnel | Diferenciador |
|---|--------|--------|---------------|
| P1 | {name} | {Top/Middle/Bottom} | {1 line differentiator} |
| P2 | ... | ... | ... |

**Distribucion por funnel**: {summary}

---

## P1 — {Pillar Name}

**Rol en funnel**: {Top/Middle/Bottom} ({channels, gating})

**Por que este pillar**: {2-3 sentences explaining WHY this is a pillar
for this client. Reference specific data: pain scores, market size,
competitive advantage. Be specific, not generic.}

**Clusters de dolor que cubre**:
- **Cluster {X}: {Name}** (Pain {score}) — {1 line description}
- **Cluster {Y}: {Name}** (Pain {score}) — {1 line description}

**Expertise de {founder/brand}**:
- {Specific experience, track record, unique knowledge}
- {Another expertise point with concrete data}

**Subtopics**:
- {Subtopic 1 — specific enough to be a content piece}
- {Subtopic 2}
- {Subtopic 3}
- {Subtopic 4}
- {Subtopic 5}
- {Subtopic 6}

**Lead magnets asociados**: {list or "pendiente"}

---

## P2 — {Next Pillar}
{...same structure...}

---

## Conexion a {Product/Service}

| Pillar | Conexion |
|--------|----------|
| P1 {name} | {How this pillar connects to the product} |
| P2 {name} | ... |
```

## Quality Checklist

Before presenting to the human, verify:

- [ ] Each pillar has a SPECIFIC "Por que" — not generic. References pain scores, market data, or track record.
- [ ] Subtopics are SPECIFIC enough to be individual content pieces — not vague categories.
- [ ] Every pillar connects to the product/service.
- [ ] Pain clusters are cited with scores.
- [ ] Expertise references real data (client names, metrics, achievements).
- [ ] Funnel distribution is balanced (not all top, not all bottom).
- [ ] 3-5 pillars total (not more, not fewer).
- [ ] No POV assigned to pillars (POV is per piece, during clarify).

## Rules

- **Pillars = TOPICS, not POV.** Never assign a stance/opinion to a pillar.
- **No `is_contrarian` flag.** Contrarian angles are piece-level decisions.
- **No SEO filter at this layer.** SEO targeting happens during blog redaction.
- **3-5 pillars max.** More dilutes authority. Fewer limits diversity.
- **Every pillar must connect to the product/service.**
- **Output is MARKDOWN, not YAML.** The document must be readable by a human in a doc viewer without any technical formatting.
- **Be specific, not generic.** "Growth strategies" is bad. "Sistemas de Growth Repetibles para startups post-PMF 5-50 personas" is good.

## Versioning

Pillars are reviewed quarterly (Proceso 4 Performance). When updating:
1. Read existing `content-pillars.md`
2. Compare with new data (Atalaya, performance metrics, new ECPs)
3. Propose changes to human for approval
4. Note the update date in the header

## Related Skills

- `content-strategy` — defines the 14 global decisions BEFORE pillars
- `positioning-messaging` — provides per-niche pillar SEEDS (step 7)
- `brand-voice` — defines tone/vocabulary (NOT POV)
- `insight-to-content-mapper` — turns signals into ideas WITHIN these pillars
- `content-calendar-planner` — schedules content ACROSS these pillars
- `content-engine-setup` — populates configs derived from these pillars

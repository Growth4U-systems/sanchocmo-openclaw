---
name: content-pillars
description: "Define and maintain Content Pillars for a client. Pillars = TOPICS the brand will own. POV is NOT decided here — POV lives at piece level during angle/clarify. Reads Foundation (ECPs, Positioning, Brand Voice) as input. Outputs content-pillars.md with 3-5 pillars, funnel_role per pillar, and signal-gathering hooks for the Input Layer."
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
- Transcripts via `meeting-intelligence` — if available, extract real customer pain quotes to validate/enrich pillars. OPTIONAL: if no transcripts, proceed with Foundation only.

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
- ECPs: all pain clusters + personas + JTBD
- Positioning: UVPs per ECP, value criteria, messaging summary
- Brand Voice: tone, words, personality
- Strategic Plan: objectives, channels, target metrics

### 2. Extract Pillar Seeds
Take the per-niche content pillars from `positioning-messaging` (step 7 of
positioning) as the STARTING POINT. Do NOT duplicate — extend.

Cross-reference with:
- Pain clusters from ECPs (which pains are most common across personas?)
- Expertise from company-brief (where is the brand's unfair knowledge advantage?)
- Strategic Plan objectives (which topics serve the current quarter's goals?)

### 3. Optional: Enrich with Transcripts
If `meeting-intelligence` output exists (`brand/{slug}/quotes-by-pillar.json`
or similar):
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
Present 3-5 pillars with:
- Name
- Pain origin (which ECPs/clusters)
- Brand expertise connection
- Related topics (subtopic cluster preview)
- Assigned funnel_role
- Linked lead magnets (if any)

Ask human to confirm/edit. This is a DECISION step — wait for approval.

### 6. Output

Write `brand/{slug}/content/content-pillars.md` with:

```yaml
client_id: {slug}
business_model: {B2B|B2C|Hybrid}
sector: {from company-brief}
pillars:
  - id: P1
    name: "{pillar name}"
    pain_origin:
      - "{ECP cluster/persona reference}"
    expertise:
      - "{brand expertise connection}"
    related_topics:
      - "{subtopic 1}"
      - "{subtopic 2}"
      - "{subtopic 3}"
    linked_lms:
      - "{lead magnet id if any}"
    funnel_role: "{top|middle|bottom}"
    status: active
    version: 1
    last_review_date: "{today}"
  - id: P2
    ...
```

## Rules

- **Pillars = TOPICS, not POV.** Never assign a stance/opinion to a pillar.
  The POV is decided per piece during angle/clarify.
- **No `is_contrarian` flag.** Contrarian angles are piece-level decisions.
- **No SEO filter at this layer.** SEO targeting happens during blog
  redaction via `keyword-research`.
- **3-5 pillars max.** More than 5 dilutes authority. Fewer than 3 limits
  content diversity.
- **Every pillar must connect to the product/service.** If you can't draw
  a line from pillar → product, it doesn't belong.

## Versioning

Pillars are reviewed quarterly (Proceso 4 Performance). When updating:
1. Read existing `content-pillars.md`
2. Compare with new data (Atalaya, performance metrics, new ECPs)
3. Propose changes to human for approval
4. Increment `version` field on changed pillars
5. Archive previous version

## Related Skills

- `content-strategy` — defines the 14 global decisions BEFORE pillars
- `positioning-messaging` — provides per-niche pillar SEEDS (step 7)
- `brand-voice` — defines tone/vocabulary (NOT POV)
- `insight-to-content-mapper` — turns signals into ideas WITHIN these pillars
- `content-calendar-planner` — schedules content ACROSS these pillars

---
name: content-pillars
description: "Define and maintain Content Pillars for a client. Uses a 5-layer methodology: Content Tilt → Pain-Based+JTBD → BOFU-First Prioritization → Topic Cluster Structure → Playground Tagging. Outputs readable markdown with rich context per pillar. Pillars = TOPICS the brand will own. POV is NOT decided here — POV lives at piece level during angle/clarify."
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

# Content Pillars — 5-Layer Methodology

> Define 3-5 content pillars using a structured 5-layer process.
> Each layer adds depth and specificity. The result is pillars that are
> differentiated, pain-anchored, conversion-oriented, SEO-structured,
> and non-linearly tagged for complex buyer journeys.

## ⚠️ Prerequisite check (ANTES de ejecutar)

Esta skill SOLO debe ejecutarse si **content-strategy** ya se completó en este brand:

1. Lee `brand/{slug}/projects/P14-Content-Engine/tasks.json`
2. Busca la entry con `skill: "content-strategy"` (típicamente P14-T01)
3. Si su `status !== "completed"`:
   - **NO ejecutes la skill**
   - Responde al humano:
     > "❌ Pre-requisito no cumplido: la task **{taskId} ({taskName})** con skill `content-strategy` está en `status: {status}`. Tienes que completar la estrategia de contenido antes de definir pillars. Abre la task primero, aprueba el doc `strategy-decisions.md`, y vuelve a pedirme que defina pillars cuando esté en `completed`."
   - Termina sin escribir nada
4. Si está completed → continúa con el workflow normal abajo
5. Si la task no existe → asume setup nuevo y pídele al humano que ejecute content-strategy primero

Esto evita aprobar pillars sin estrategia base — escenario que produce pillars desconectados del posicionamiento.

## Before Starting

Read ALL Foundation context listed in `context_required`. Do NOT skip any.
Also check for optional enrichment:
- `brand/{slug}/content/strategy-decisions.md` — if Content Strategy was executed
- Transcripts via `meeting-intelligence` — OPTIONAL

---

## Layer 1 — Content Tilt (Joe Pulizzi)

**Question**: "At what intersection is this brand the ONLY credible voice?"

Before defining any pillars, find the Content Tilt — the unique angle
that makes this brand's content impossible to replicate.

**Process**:
1. Read company-brief: what does the brand do differently?
2. Read ECPs: what do customers desperately need?
3. Read positioning: what's the brand's unfair advantage?
4. Find the INTERSECTION:
   ```
   Content Tilt = (Brand's unique expertise)
                × (Audience's urgent need)
                × (Gap no one else fills)
   ```

**Output**: One sentence that captures the tilt.
Example (Growth4U): "Sistemas de growth con exit date a 6 meses para
startups post-PMF — el unico programa que instala un motor y se va."

**Rule**: If you can't articulate a clear tilt, STOP and workshop with
the human. Without a tilt, pillars will be generic.

---

## Layer 2 — Pain-Based + JTBD Pillars

**Framework**: Each pillar = intersection of:
- **Customer Pain** (from ECPs — use pain SCORES to prioritize)
- **Brand Expertise** (from company-brief — concrete track record, not claims)
- **Topic Defensibility** (can the brand credibly own this topic for years?)

**Process**:
1. List all pain clusters from ECPs with their scores
2. List all brand expertise areas with concrete proof (names, numbers, results)
3. Cross-reference: which pains match which expertise?
4. Group into 3-5 pillars (not more — dilutes authority)
5. For each pillar, define the JTBD:
   ```
   "When [situation], I want [motivation], so I can [outcome]."
   ```

**Each pillar MUST have**:
- A pain score reference (from ECPs)
- A concrete expertise proof (not "we're experts in X" — "we grew Bnext 0→400K under CNMV")
- A JTBD statement
- A connection to the product/service

**Rule**: "Growth strategies" is BAD. "Sistemas de growth repetibles para
startups post-PMF 5-50 personas" is GOOD. Be specific or redo.

---

## Layer 3 — BOFU-First Prioritization (Rob Walling)

**Principle**: Within each pillar, prioritize content that CONVERTS before
content that generates awareness. Start at the bottom of the funnel.

**Process**:
1. For each pillar, assign a `funnel_role`:
   - `bottom` — captures intent (blog SEO, comparison pages, use cases). GATED with lead magnets.
   - `middle` — builds audience (newsletter, community, deep-dives). GATED email.
   - `top` — creates demand (LinkedIn, X, thought leadership). UNGATED.

2. Within each pillar, list subtopics and score them:
   ```
   BOFU score = (Purchase intent × 0.4) + (Search volume × 0.3)
              + (Competition gap × 0.2) + (Brand proof × 0.1)
   ```

3. The pillar's first 3 content pieces should be BOFU.

**Assign per business_model**:
- **B2B**: bottom = blog SEO gated; middle = newsletter; top = LinkedIn/X ungated
- **B2C**: bottom = product/cohort; middle = email gated; top = social ungated

---

## Layer 4 — Topic Cluster Structure (HubSpot Model)

**For each pillar, define the hub-and-spoke architecture**:

```
PILLAR HUB (comprehensive overview page)
├── Spoke 1: [specific subtopic] — searchable
├── Spoke 2: [specific subtopic] — searchable
├── Spoke 3: [specific subtopic] — shareable
├── Spoke 4: [specific subtopic] — searchable
├── Spoke 5: [specific subtopic] — shareable
└── Spoke 6: [specific subtopic] — searchable
```

**Rules**:
- Hub = broad topic. Spokes = specific long-tail.
- Each spoke MUST be specific enough to be a single content piece
- Interlink: every spoke links to the hub, hub links to all spokes
- Mix searchable (60%) + shareable (25%) + both (15%)
- 6-8 spokes per pillar minimum

**Each spoke needs**: title, searchable/shareable/both, buyer stage
(awareness/consideration/decision/implementation), target keyword hint.

---

## Layer 5 — Playground Model Tagging (Ashley Faus, Atlassian)

**Replace the linear funnel with a non-linear playground**.

Tag each spoke with a DEPTH level:
- **Conceptual** — "what is X and why does it matter?" (awareness, inspiration)
- **Strategic** — "how should I think about X?" (frameworks, comparisons, decisions)
- **Tactical** — "how do I DO X step by step?" (tutorials, templates, playbooks)

**Why**: Buyers don't move linearly top→mid→bottom. They jump between
depths. A CTO might start with a tactical template, then read a strategic
framework, then share a conceptual hot take on LinkedIn. Content should
work at any entry point.

**Each pillar should have content at all 3 depths**.

---

## Output Format

Write `brand/{slug}/content/content-pillars.md` as **readable markdown**:

```markdown
# Content Pillars — {Client Name}

> Generado: {date} | Status: approved
> Content Tilt: {one-sentence tilt}
> Inputs: {list of Foundation docs used}

---

## Content Tilt

{2-3 sentences explaining the tilt and why this brand is uniquely
positioned to own this content space}

## Resumen

| # | Pillar | Funnel | BOFU Priority | Diferenciador |
|---|--------|--------|---------------|---------------|
| P1 | {name} | {Top/Middle/Bottom} | {first BOFU subtopic} | {1 line} |

---

## P1 — {Pillar Name}

**Content Tilt connection**: {how this pillar serves the overall tilt}

**Rol en funnel**: {Top/Middle/Bottom} ({channels, gating})
**JTBD**: "When {situation}, I want {motivation}, so I can {outcome}."

**Por que este pillar**: {2-3 sentences with SPECIFIC data — pain scores,
market size, track record numbers. NOT generic.}

**Clusters de dolor**:
- **Cluster {X}: {Name}** (Pain {score}) — {description}

**Expertise**:
- {Specific achievement with data}

**Topic Cluster** (hub + spokes):
| # | Spoke | Type | Buyer Stage | Depth | Keyword hint |
|---|-------|------|-------------|-------|-------------|
| Hub | {pillar overview} | Both | All | Strategic | {keyword} |
| 1 | {subtopic} | Searchable | Decision | Tactical | {keyword} |
| 2 | {subtopic} | Shareable | Awareness | Conceptual | {keyword} |
| 3 | ... | ... | ... | ... | ... |

**BOFU priority**: {first 3 pieces to produce, all bottom-funnel}

**Lead magnets**: {list}

---
```

## Quality Checklist

Before presenting to the human:

- [ ] Content Tilt articulated in 1 sentence — specific, not generic
- [ ] 3-5 pillars, each with JTBD statement
- [ ] Pain scores cited from ECPs
- [ ] Expertise references real data (client names, metrics)
- [ ] Every pillar has funnel_role assigned (balanced distribution)
- [ ] Every pillar has 6+ spokes in topic cluster table
- [ ] Every spoke has depth tag (conceptual/strategic/tactical)
- [ ] BOFU-first: first 3 pieces per pillar are bottom-funnel
- [ ] Each pillar connects to product/service
- [ ] No POV assigned to pillars (POV is per piece, during clarify)
- [ ] Content Tilt connection explained per pillar

## Rules

- **Pillars = TOPICS, not POV.** POV is decided per piece during clarify.
- **No `is_contrarian` flag.** Contrarian angles are piece-level.
- **3-5 pillars max.** More dilutes authority.
- **Every pillar must connect to the product/service.**
- **Output is MARKDOWN, not YAML.** Human-readable in doc viewer.
- **Be specific, not generic.** If a competitor could claim the same pillar, it's not specific enough.
- **Content Tilt FIRST.** Without it, pillars are commodity.
- **BOFU FIRST.** Within each pillar, prioritize what converts.

## Versioning

Reviewed quarterly (Proceso 4 Performance). When updating:
1. Read existing `content-pillars.md`
2. Compare with new data (Atalaya, performance, ECPs)
3. Propose changes for approval
4. Note update date

## Related Skills

- `content-strategy` — 14 global decisions BEFORE pillars
- `positioning-messaging` — per-niche pillar SEEDS (step 7)
- `brand-voice` — tone/vocabulary (NOT POV)
- `insight-to-content-mapper` — signals → ideas WITHIN pillars
- `content-calendar-planner` — schedules content ACROSS pillars
- `content-engine-setup` — configs derived FROM pillars

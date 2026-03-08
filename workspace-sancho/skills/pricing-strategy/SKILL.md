---
name: pricing-strategy
description: "Define pricing models, tiers, and psychological hooks. Use when: setting initial pricing, restructuring tiers, competitive pricing analysis, or adding value-based hooks. Pipeline: Context → Research → Value Metrics → Tier Design → Hooks → Pricing Page → Validation. Reads Foundation (company-brief, competitors, ECPs). Outputs pricing.md in go-to-market/."
context_required:
- brand/{slug}/company-brief/current.md
- brand/{slug}/market-and-us/competitors/current.md
- brand/{slug}/go-to-market/ecps/current.md
- brand/{slug}/go-to-market/positioning/*/current.md
context_writes:
- brand/{slug}/go-to-market/pricing/current.md
- brand/{slug}/operational/learnings.md
user-invocable: false
---

# Pricing Strategy & Hooks

> Define pricing that captures value, drives growth, and aligns with customer willingness to pay. Includes psychological hooks for conversion.

Read ./brand/ per `_system/brand-memory.md`
Follow output formatting from `_system/output-format.md`

---

## Context Gathering

Before starting, extract from Foundation docs:
1. **Business Context** — B2B/B2C, revenue model, current pricing (from company-brief)
2. **Value & Competition** — competitor pricing, feature comparison (from competitor-*.md)
3. **Customer Segments** — ECPs, willingness to pay signals (from ecps.md)
4. **Positioning** — value prop, differentiation angle (from positioning/*/current.md)

If data missing → ask the specific questions. Don't re-ask what Foundation already captured.

---

## Workflow

### Phase 1: Research (~15 min)
- Scrape competitor pricing pages (web_fetch)
- Identify pricing patterns in market (tiers, models, anchoring)
- Run Van Westendorp or MaxDiff if customer data available
- See `references/research-methods.md` for detailed frameworks

### Phase 2: Value Metric Selection
- Identify the metric that scales with customer value
- Map usage → value for each ECP
- See `references/methodology.md` for Value-Based Pricing Framework

### Phase 3: Tier Design
- Good-Better-Best structure
- Feature gating aligned with ECP needs
- Enterprise tier if applicable
- See `references/implementation.md` for tier strategies

### Phase 4: Psychological Hooks
- Anchoring, decoy pricing, loss aversion
- Per-ECP hook selection
- See `references/hooks-concepts.md` for hook library
- See `references/hooks-prompt.md` for generation prompts

### Phase 5: Pricing Page
- Above-the-fold structure
- Tier presentation best practices
- Trust signals and CTAs
- See `references/implementation.md` (Pricing Page section)

### Phase 6: Validation
- Price testing methods
- Metrics to track
- See `references/research-methods.md` (Price Testing section)

---

## Output Format

```markdown
# Pricing Strategy — [Cliente]

## Resumen Ejecutivo
[3-5 bullets: modelo, tiers, price points, hooks principales]

## Value Metric
[Qué métrica escala con el valor del cliente]

## Estructura de Tiers
| Tier | Target ECP | Price | Incluye | Hook |
|------|-----------|-------|---------|------|

## Competidores — Comparación de Pricing
| Competidor | Modelo | Rango | Diferenciación |
|-----------|--------|-------|----------------|

## Hooks Psicológicos
[Por tier: qué hook y por qué]

## Plan de Implementación
[Pricing page mockup text, launch plan, test plan]

## Cuándo Subir Precios
[Señales + estrategia de comunicación]
```

---

## References

| File | Content |
|------|---------|
| `references/methodology.md` | Value-Based Pricing, pricing axes, value metrics |
| `references/research-methods.md` | Van Westendorp, MaxDiff, price testing |
| `references/implementation.md` | Tier structure, packaging, freemium, pricing page |
| `references/hooks-concepts.md` | Psychological hooks library (from pricing-hooks) |
| `references/hooks-prompt.md` | Prompts for hook generation |
| `references/checklist.md` | Pre-launch pricing checklist |
| `references/hooks-checklist.md` | Hooks validation checklist |

---

## Rules

1. **Always research competitors first** — pricing without competitive context is guessing
2. **Value metric > feature gating** — price on what customers value, not what's easy to gate
3. **One clear CTA per tier** — avoid decision paralysis
4. **Test before committing** — recommend A/B or survey before hard launch
5. **Document reasoning** — explain WHY each price point, not just WHAT

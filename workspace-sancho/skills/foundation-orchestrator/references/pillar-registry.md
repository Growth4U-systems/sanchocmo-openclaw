# Pillar Registry v2.0
<!-- Fuente de verdad para pilares, skills, dependencias y criterios -->

---

## LAYER 0 — INTAKE

### company-brief (flujo continuo: 3 skills → 1 aprobación)

**Skills**: company-context → business-model → budget (secuenciales, sin aprobación intermedia)
**Output**: `brand/{slug}/company-brief/current.md` (doc único con 3 secciones)
**requires**: —
**Skip**: nunca

| Skill | Sección en doc | Done criteria |
|-------|---------------|---------------|
| company-context | `## Company Identity` | Identidad, producto, objetivos, cultura, equipo, URL analizada |
| business-model | `## Business Model` | B2B/B2C clasificado, revenue model, funnel actual, PLG/MLG assessment |
| budget | `## Budget & Resources` | Budget mensual, timeline, equipo disponible, stack actual |

**Además**: preguntar competidores conocidos y guardar nombres para Layer 1.

---

## LAYER 1 — RESEARCH

### market-analysis
**Skill**: `market-intelligence`
**Output**: `brand/{slug}/market-and-us/market-analysis.md`
**requires**: company-brief
**enriches_with**: competitor-analysis, self-analysis
**Skip**: nunca
**Lite done**: Sector + TAM/SAM estimado + tendencias principales
**Deep done**: Lite + regulación + 3+ tendencias + tasa crecimiento + características mercado

### competitor-analysis
**Skill**: `competitor-intelligence`
**Output**: `brand/{slug}/market-and-us/competitor-{slug}.md` (1 por competidor)
**requires**: company-brief
**enriches_with**: market-analysis, self-analysis
**Skip**: nunca
**Lite done**: Top 3 competidores directos + Lens 1 (qué dicen de sí mismos)
**Deep done**: 3+ directos con 3 lenses + 2+ alternativas indirectas + growth model por competidor
**Nota**: Lista de competidores es dinámica. Se descubren en Company Brief (usuario dice), Market Analysis (research), y Niche Discovery (por nicho). El orchestrator puede preguntar proactivamente si hay más competidores a analizar.

### self-analysis
**Skill**: `self-intelligence`
**Output**: `brand/{slug}/market-and-us/self-analysis.md`
**requires**: company-brief
**enriches_with**: market-analysis, competitor-analysis
**Skip**: si es marca nueva sin track record
**Lite done**: Lens 1 (qué decimos) para homepage + 2 redes sociales top
**Deep done**: 3 lentes completas: homepage, 2 redes sociales, 2 plataformas de reviews
**Post-completion**: Viability Checkpoint (advisory)
**IMPORTANTE**: Este skill hace SOLO Deep Research Company (radiografía propia). NO hace market research — eso pertenece a market-intelligence.

---

## LAYER 2 — SYNTHESIS

### swot
**Skill**: `swot-analysis`
**Output**: `brand/{slug}/market-and-us/swot.md`
**requires**: market-analysis, competitor-analysis, self-analysis
**Skip**: nunca
**Lite done**: SWOT 4 cuadrantes con datos reales (no asunciones)
**Deep done**: Lite + 2+ estrategias por cuadrante TOWS (SO, ST, WO, WT)

### summary (síntesis — generada por orchestrator)
**Output**: `brand/{slug}/market-and-us/summary.md`
**requires**: market-analysis, competitor-analysis, self-analysis
**Generada por**: orchestrator inline (no skill dedicado)
**Qué es**: 1-2 páginas sintetizando mercado + competidores + posición propia. Referencia cada doc fuente.

### ope-canvas (síntesis — generada por orchestrator)
**Output**: `brand/{slug}/market-and-us/ope-canvas.md`
**requires**: market-analysis, competitor-analysis, self-analysis
**Generada por**: orchestrator inline (no skill dedicado)
**Qué es**: One-Page Endgame. La foto completa del negocio en 1 página.

---

## LAYER 3 — CUSTOMER DISCOVERY

### niche-discovery
**Skill**: `niche-discovery-100x`
**Output**: `brand/{slug}/go-to-market/ecps.md` (JTBD integrado por segmento)
**requires**: swot
**enriches_with**: existing-customer-data
**Skip**: nunca
**Lite done**: 50+ problemas, Triple Filter, 3-7 ECPs scored
**Deep done**: 100+ problemas, 5+ tipos fuente, TAM/SAM por ECP, datos clientes integrados

### existing-customer-data (OPCIONAL)
**Skill**: `existing-customer-data`
**Output**: `brand/{slug}/go-to-market/existing-customer-data.md`
**requires**: company-brief
**enriches_with**: niche-discovery (si disponible, enriquece los ECPs)
**Skip**: si pre-launch sin clientes
**Nota**: Se puede ejecutar en paralelo con Layer 1-2 (solo requires company-brief). Enriquece niche-discovery si está disponible.

---

## LAYER 4 — ACTIVATION

### positioning
**Skill**: `positioning-messaging`
**Output**: `brand/{slug}/go-to-market/positioning-{ecp-slug}.md` (1 por ECP)
**requires**: niche-discovery
**Skip**: nunca
**Lite done**: Messaging básico para top ECP
**Deep done**: Por ECP: value criteria ranked, competitor scoring, 3+ assets con proof, messaging framework

### pricing
**Skill**: `pricing-strategy`
**Output**: `brand/{slug}/go-to-market/pricing.md`
**requires**: niche-discovery
**enriches_with**: positioning
**Skip**: si pricing es fijo/no negociable
**Lite done**: Pricing actual documentado + 1 hook por top ECP
**Deep done**: Pricing competidores comparado + estrategia + 3+ hooks por ECP con proof

### ecp-validation (OPCIONAL)
**Skill**: `ecp-validation`
**requires**: niche-discovery
**Skip**: si timeline muy corto (validar a través de ejecución)

### messaging-summary (síntesis — generada por orchestrator)
**Output**: `brand/{slug}/go-to-market/messaging-summary.md`
**requires**: positioning
**enriches_with**: pricing
**Generada por**: orchestrator inline
**Qué es**: Síntesis GTM: "estos segmentos, este mensaje, estos canales"

---

## LAYER 5 — BRAND IDENTITY

### brand-voice
**Skill**: `brand-voice`
**Output**: `brand/{slug}/brand-identity/voice-profile.md`
**requires**: positioning
**Skip**: si no produce contenido aún (diferir)
**Done**: Voice guide completa con do/don't, espectro tonal, ejemplos por tipo de contenido

### visual-identity
**Skill**: `visual-identity`
**Output**: `brand/{slug}/brand-identity/visual-identity.md`
**requires**: brand-voice
**Skip**: si no tiene necesidad de branding visual aún
**Done**: Sistema visual completo: paleta, tipografía, guidelines de uso

---

## Quick Reference: Impacto de Desbloqueo

| Pilar | Desbloquea | Downstream count |
|-------|-----------|-----------------|
| company-brief | Toda Layer 1+ | 12+ |
| market-analysis | swot → discovery → activation → brand | 8+ |
| competitor-analysis | swot → discovery → activation → brand | 8+ |
| self-analysis | swot → discovery → activation → brand | 8+ |
| swot | discovery → activation → brand | 6+ |
| niche-discovery | positioning + pricing + ecp-validation + brand | 5+ |
| positioning | messaging-summary + brand-voice + visual-identity | 3 |

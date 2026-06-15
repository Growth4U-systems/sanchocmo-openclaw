# Pillar Registry v3.0
<!-- Fuente de verdad para pilares, skills, dependencias y criterios -->
<!-- Alineado con Mission Control threads -->

---

## KICKOFF (1 skill, 1 thread, ~30 min)

### company-brief
**Skill**: `kickoff`
**Agent**: `sancho`
**Thread**: `{slug}:kickoff`
**Output**: `brand/{slug}/company-brief/company-brief.current.md` (un archivo, secciones H2; Company Brief inicial). NO toca carpetas de pilares.
**requires**: — (es el primer paso)
**Skip**: nunca
**Modo URL**: scrape web + sociales → pre-fill → validar → completar gaps
**Modo manual**: 6 preguntas conversacionales (sin URL)
**Done**: `company-brief.current.md` generado y validado por el usuario

---

## SITE AUDIT — LAYER 0 (opcional, tras Kickoff)

### trust-score
**Skill**: `trust-score`
**Agent**: `dulcinea`
**Thread**: `{slug}:trust-score`
**Output**: `brand/{slug}/site-audit/trust-score/trust-score.current.md` (Trust Score: 6 pilares + gap vs un set fijo de competidores + verdict). El doc lo escribe el endpoint `/api/trust-score`; la skill lo dispara y marca el pilar completed.
**requires**: company-brief (ya hay URL)
**optional**: sí — no bloquea Foundation. Si el analyzer falla o no hay competidores descubribles, el pilar queda pendiente sin trabar el avance.
**Done**: doc generado con los 6 pilares + verdict, y pilar marcado completed.

---

## FULL FOUNDATION — LAYER 1: RESEARCH

### market-analysis
**Skill**: `market-intelligence`
**Agent**: `hamete`
**Thread**: `{slug}:market-analysis`
**Output**: `brand/{slug}/market-and-us/market/market.current.md`
**requires**: —
**enriches_with**: company-brief, competitor-analysis, self-analysis
**Hydration**: lee su sección de `company-brief/company-brief.current.md` (grounding opcional). Si no existe, arranca standalone desde el input del cliente. Kickoff **no es prerequisito**.
**Lite done**: Sector + TAM/SAM estimado + tendencias principales
**Deep done**: Lite + regulación + 3+ tendencias + tasa crecimiento + características mercado

### competitor-analysis
**Skill**: `competitor-intelligence`
**Agent**: `hamete`
**Thread**: `{slug}:competitor-analysis`
**Output**:
- `brand/{slug}/market-and-us/competitors/competitors.current.md` (roll-up: landscape + lista, generado desde subdirs)
- `brand/{slug}/market-and-us/competitors/{nombre}/{nombre}.current.md` (deep-dive 3-lens, 1 por competidor)
**requires**: —
**enriches_with**: company-brief, market-analysis, self-analysis
**Hydration**: lee su sección de `company-brief/company-brief.current.md` (grounding opcional).
**Lite done**: Top 3 competidores directos + Lens 1 (qué dicen de sí mismos)
**Deep done**: 3+ directos con 3 lenses + 2+ alternativas indirectas + growth model por competidor

### self-analysis
**Skill**: `self-intelligence`
**Agent**: `hamete`
**Thread**: `{slug}:self-analysis`
**Output**: `brand/{slug}/market-and-us/self/self.current.md`
**requires**: —
**enriches_with**: company-brief, market-analysis, competitor-analysis
**Hydration**: lee su sección de `company-brief/company-brief.current.md` (grounding opcional) y añade Lens 2 + Lens 3 si está disponible. Si no, ejecuta las 3 lenses standalone. Kickoff **no es prerequisito**.
**Skip**: si es marca nueva sin track record
**Lite done**: Lens 1 (qué decimos) para homepage + 2 redes sociales top
**Deep done**: 3 lentes completas: homepage, 2 redes sociales, 2 plataformas de reviews

---

## FULL FOUNDATION — LAYER 2: SYNTHESIS

### market-synthesis
**Skill**: `market-synthesis`
**Agent**: `hamete`
**Thread**: `{slug}:market-synthesis`
**Output**:
- `brand/{slug}/market-and-us/swot/swot.current.md` — SWOT + TOWS + ICE
- `brand/{slug}/market-and-us/summary/summary.current.md` — Market Summary (1-2 pág)
- `brand/{slug}/market-and-us/ope-canvas/ope-canvas.current.md` — OPE Canvas (14 secciones)
- `brand/{slug}/presentations/foundation-report.html` — Presentación HTML
**requires**: market-analysis, competitor-analysis, self-analysis
**Skip**: nunca
**Done**: 4 outputs generados, SWOT validado por usuario, presentación renderizable

---

## FULL FOUNDATION — LAYER 3: CUSTOMER DISCOVERY

### niche-discovery
**Skill**: `niche-discovery-100x`
**Agent**: `hamete`
**Thread**: `{slug}:niche-discovery`
**Output**: `brand/{slug}/go-to-market/ecps/ecps.current.md` (JTBD integrado por segmento)
**requires**: market-synthesis (swot)
**enriches_with**: existing-customer-data
**Hydration**: lee su sección de `company-brief/company-brief.current.md` (grounding opcional) como seed y valida con research
**Lite done**: 50+ problemas, Triple Filter, 3-7 ECPs scored
**Deep done**: 100+ problemas, 5+ tipos fuente, TAM/SAM por ECP, datos clientes integrados

### existing-customer-data (OPCIONAL)
**Skill**: `existing-customer-data`
**Agent**: `hamete`
**Thread**: `{slug}:existing-customer-data` (solo si se activa)
**Output**: `brand/{slug}/go-to-market/existing-customer-data/existing-customer-data.current.md`
**requires**: —
**enriches_with**: company-brief, niche-discovery
**Skip**: si pre-launch sin clientes

---

## FULL FOUNDATION — LAYER 4: ACTIVATION

### positioning
**Skill**: `positioning-messaging`
**Agent**: `dulcinea`
**Thread**: `{slug}:positioning`
**Output**: `brand/{slug}/go-to-market/positioning/{ecp-slug}/{ecp-slug}.current.md` (1 por ECP)
**requires**: niche-discovery
**Lite done**: Messaging básico para top ECP
**Deep done**: Por ECP: value criteria ranked, competitor scoring, 3+ assets con proof, messaging framework
**Nota**: genera messaging-summary.md automáticamente como subproducto

### pricing
**Skill**: `pricing-strategy`
**Agent**: `sancho`
**Thread**: `{slug}:pricing`
**Output**: `brand/{slug}/go-to-market/pricing/pricing.current.md`
**requires**: niche-discovery, positioning
**Nota**: En tasks.json pricing depende explícitamente de positioning (secuencial). El registry marca positioning como enriches_with pero en la práctica siempre se ejecuta después.
**Skip**: si pricing es fijo/no negociable
**Lite done**: Pricing actual documentado + 1 hook por top ECP
**Deep done**: Pricing competidores comparado + estrategia + 3+ hooks por ECP con proof

### ecp-validation (OPCIONAL)
**Skill**: `ecp-validation`
**Agent**: `sanson`
**Thread**: `{slug}:ecp-validation` (solo si se activa)
**requires**: niche-discovery
**Skip**: si timeline muy corto

---

## FULL FOUNDATION — LAYER 5: BRAND IDENTITY

### brand-voice
**Skill**: `brand-voice`
**Agent**: `dulcinea`
**Thread**: `{slug}:brand-voice`
**Output**: `brand/{slug}/brand-voice/brand-voice.current.md`
**requires**: positioning
**Hydration**: lee su sección de `company-brief/company-brief.current.md` (grounding opcional) y genera Full Guide
**Done**: Voice guide completa + AI Brand Kit + Per-ECP/Channel adaptation

### visual-identity
**Skill**: `visual-identity`
**Agent**: `maese-pedro`
**Thread**: `{slug}:visual-identity`
**Output**: `brand/{slug}/brand-identity/visual-identity/visual-identity.current.md`
**requires**: brand-voice
**Done**: Sistema visual completo: paleta, tipografía, guidelines de uso

---

## MÉTRICAS Y CONEXIONES (Post-Foundation)

### metrics-setup
**Skill**: `metrics-setup`
**Agent**: `merlin`
**Thread**: `{slug}:metrics-setup`
**Output**: `brand/{slug}/go-to-market/metrics-plan/metrics-plan.current.md` + `metrics-plan.json` + `integrations.json`
**requires**: positioning, pricing (para determinar arquetipo y funnel)
**Done**: Plan de métricas + integraciones conectadas + dashboard generado

---

## STRATEGIC PLAN (Post-Métricas)

### strategic-plan
**Skill**: `strategic-plan`
**Agent**: `sancho`
**Thread**: `{slug}:strategic-plan`
**Output**: `brand/{slug}/strategic-plan/strategic-plan.current.md`
**requires**: Full Foundation completada + metrics-setup
**Done**: Roadmap con estrategias GTM seleccionadas, proyectos definidos, fases y KPIs

---

## Quick Reference: Flujo de Desbloqueo

```
company-brief (kickoff)
  ├── market-analysis ─┐
  ├── competitor-analysis ├── market-synthesis
  └── self-analysis ───┘       │
                               └── niche-discovery
                                     ├── positioning ── brand-voice ── visual-identity
                                     └── pricing
                                              └── metrics-setup ── strategic-plan
```

## Quick Reference: Impacto de Desbloqueo

| Pilar | Desbloquea | Downstream |
|-------|-----------|------------|
| company-brief (kickoff) | Todo Layer 1+ | 11+ |
| market-analysis | market-synthesis → discovery → activation → brand | 8+ |
| competitor-analysis | market-synthesis → discovery → activation → brand | 8+ |
| self-analysis | market-synthesis → discovery → activation → brand | 8+ |
| market-synthesis | niche-discovery → activation → brand | 6+ |
| niche-discovery | positioning + pricing + ecp-validation + brand | 5+ |
| positioning | brand-voice + visual-identity + messaging-summary | 3 |
| pricing | metrics-setup | 2 |
| metrics-setup | strategic-plan | 1 |
